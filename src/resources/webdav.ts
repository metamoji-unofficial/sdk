/**
 * The WebDAV data plane (`drive/webdav.tsp`).
 *
 * Where `drives.*` is the control plane — who owns what, and where it lives —
 * this is where note bodies actually move. `NwWebDAVRequest` holds no host of
 * its own: every method takes the **absolute URL** of a resource, built by the
 * caller from the home collection URL (`users.get()`'s `homeDir`) plus a
 * resource id.
 *
 * Four of the eight verbs are WebDAV's own — `MKCOL`, `MOVE`, `PROPFIND`,
 * `PROPPATCH`. TypeSpec has no decorator for them and approximates with `@post`;
 * this client sends the real method.
 *
 * Authentication is not the session cookie here but HTTP Basic, plus an
 * `X-mmj-appcode` header carrying `appAuthKey` from `users.get()`. Set them
 * once with `webdav.authorize()`.
 */

import type { MetamojiContext } from "../core/http.js";
import { fail, ok, type Result } from "../core/result.js";
import { childNamed, childrenNamed, escapeXml, parseXml, type XmlNode } from "../core/xml.js";

const DAV_NS = "DAV:";
/** MetaMoji's own "dead property" namespace: `create`, `lastSyncedRevision`, `syncUpdate`. */
export const METAMOJI_PROP_NS = "http://xmlns.metamoji.com/digitalcabinet/tinydotnote/1.0/";

/** Status shared by every WebDAV response (`NwWebDAVResult`). */
export interface WebDavResult {
  responseStatusCode: number;
  isSuccessful: boolean;
  /** Always false here — this client has no cancellation channel. */
  isCancelled: boolean;
  errorString?: string;
}

export interface WebDavFileResult extends WebDavResult {
  /** The body. The app writes it to a temporary file; the bytes are given here. */
  responseFile: Uint8Array;
  mimeType?: string;
}

export interface WebDavHeaderResult extends WebDavResult {
  responseHeader: Record<string, string>;
}

/** One collection or resource from a multistatus response (`NwWebDAVItem`). */
export interface WebDavItem {
  href?: string;
  /** The last path segment, decoded. */
  uriName?: string;
  displayName?: string;
  isCollection?: boolean;
  /**
   * Standard `DAV:` properties, name to text. The app whitelists nothing, so
   * whatever the server sent is here — `getcontentlength`, `getlastmodified`,
   * `getetag` and so on.
   */
  liveProperties: Record<string, string>;
  /** Properties in MetaMoji's own namespace. */
  deadProperties: Record<string, string>;
  children: WebDavItem[];
}

export interface WebDavPropResult extends WebDavResult {
  /** The raw XML, as the app keeps it. */
  responseString: string;
  /** The tree rooted at the requested resource. */
  itemTree?: WebDavItem;
  /** Every item, keyed by href. */
  multiResponses: Record<string, WebDavItem>;
  hrefs: string[];
  isValidMultiResponse: boolean;
  liveProperties: Record<string, string>;
  deadProperties: Record<string, string>;
}

/** Credentials WebDAV requests carry, since the session cookie does not apply. */
export interface WebDavAuth {
  /** Sent as `X-mmj-appcode`. `users.get()` returns it. */
  appAuthKey?: string;
  username?: string;
  password?: string;
}

export type PropfindDepth = "0" | "1" | "infinity";

export interface WebDavRequestOptions {
  /** Extra headers, e.g. the `If: (<lock-token>)` the app adds when locked. */
  headers?: Record<string, string>;
}

export interface PropfindOptions extends WebDavRequestOptions {
  depth?: PropfindDepth;
  /** Extra XML inside `<D:propfind>`, appended after `<D:allprop/>`. */
  extra?: string;
}

export interface ProppatchOptions extends WebDavRequestOptions {
  /** Properties to set, in the MetaMoji namespace. */
  set?: Record<string, string>;
  /** Property names to remove. */
  remove?: string[];
}

export class WebDav {
  private auth: WebDavAuth = {};

  constructor(private readonly ctx: MetamojiContext) {}

  /**
   * Sets the credentials sent with every WebDAV request. Called with no
   * argument it takes `appAuthKey` from the client session, which `users.get()`
   * fills in.
   */
  authorize(auth: WebDavAuth = {}): void {
    this.auth = { appAuthKey: this.ctx.session.appAuthKey, ...auth };
  }

  /**
   * Downloads a resource.
   * `NwWebDAVRequest.get(url)` — `GET {resourceUrl}`.
   */
  async get(resourceUrl: string, options: WebDavRequestOptions = {}): Promise<Result<WebDavFileResult>> {
    const result = await this.send(resourceUrl, "GET", options, "binary");
    if (result.error) return fail(result.error);
    return ok({
      ...status(result.data.status),
      responseFile: result.data.bytes,
      mimeType: result.data.headers["content-type"],
    });
  }

  /**
   * Uploads a resource, creating or overwriting it.
   * `NwWebDAVRequest.put(url, file)` — `PUT {resourceUrl}`.
   */
  async put(
    resourceUrl: string,
    data: Uint8Array | ArrayBuffer,
    options: WebDavRequestOptions = {},
  ): Promise<Result<WebDavResult>> {
    const body = data instanceof Uint8Array ? data : new Uint8Array(data);
    const result = await this.send(resourceUrl, "PUT", options, "binary", {
      body,
      contentType: "application/octet-stream",
    });
    if (result.error) return fail(result.error);
    return ok(status(result.data.status));
  }

  /**
   * Metadata only. The app uses it to check whether a randomly generated
   * resource id is already taken — a 200 means it is.
   * `NwWebDAVRequest.head(url)` — `HEAD {resourceUrl}`.
   */
  async head(
    resourceUrl: string,
    options: WebDavRequestOptions = {},
  ): Promise<Result<WebDavHeaderResult>> {
    const result = await this.send(resourceUrl, "HEAD", options, "binary");
    if (result.error) return fail(result.error);
    return ok({ ...status(result.data.status), responseHeader: result.data.headers });
  }

  /**
   * Deletes a resource.
   * `NwWebDAVRequest.delete(url)` — `DELETE {resourceUrl}`.
   */
  async remove(
    resourceUrl: string,
    options: WebDavRequestOptions = {},
  ): Promise<Result<WebDavResult>> {
    const result = await this.send(resourceUrl, "DELETE", options, "binary");
    if (result.error) return fail(result.error);
    return ok(status(result.data.status));
  }

  /**
   * Creates a collection (a folder). No body; `Content-Type: application/xml`
   * is sent anyway, as the app does.
   * `NwWebDAVRequest.createDirectory(url)` — `MKCOL {resourceUrl}`.
   */
  async createDirectory(
    resourceUrl: string,
    options: WebDavRequestOptions = {},
  ): Promise<Result<WebDavResult>> {
    const result = await this.send(resourceUrl, "MKCOL", {
      ...options,
      headers: { "content-type": "application/xml", ...options.headers },
    }, "binary");
    if (result.error) return fail(result.error);
    return ok(status(result.data.status));
  }

  /**
   * Moves or renames a resource.
   * `NwWebDAVRequest.moveToDestinationURL(url, destUrl, overwrite)` —
   * `MOVE {resourceUrl}` with `Destination` and `Overwrite` headers.
   */
  async move(
    resourceUrl: string,
    destination: string,
    options: WebDavRequestOptions & { overwrite?: boolean } = {},
  ): Promise<Result<WebDavResult>> {
    const result = await this.send(resourceUrl, "MOVE", {
      ...options,
      headers: {
        Destination: destination,
        Overwrite: options.overwrite === false ? "F" : "T",
        ...options.headers,
      },
    }, "binary");
    if (result.error) return fail(result.error);
    return ok(status(result.data.status));
  }

  /**
   * Lists a collection and its properties.
   * `NwWebDAVRequest.propfind(url, depth, extra)` — `PROPFIND {resourceUrl}`.
   *
   * The body is the app's fixed `<D:propfind><D:allprop/>{extra}</D:propfind>`.
   */
  async propfind(
    resourceUrl: string,
    options: PropfindOptions = {},
  ): Promise<Result<WebDavPropResult>> {
    const body =
      '<?xml version="1.0" encoding="utf-8" ?>\n' +
      `<D:propfind xmlns:D="DAV:"><D:allprop/>${options.extra ?? ""}</D:propfind>`;

    const result = await this.send(
      resourceUrl,
      "PROPFIND",
      { ...options, headers: { Depth: options.depth ?? "1", ...options.headers } },
      "text",
      { body, contentType: "application/xml; charset=utf-8" },
    );
    if (result.error) return fail(result.error);
    return ok(parseMultiStatus(result.data.status, result.data.text ?? "", resourceUrl));
  }

  /**
   * Updates properties — in practice the MetaMoji dead properties
   * (`create`, `lastSyncedRevision`, `syncUpdate`).
   * `NwWebDAVRequest.proppatch(url, setProperties, removeProperties)` —
   * `PROPPATCH {resourceUrl}`.
   */
  async proppatch(
    resourceUrl: string,
    options: ProppatchOptions = {},
  ): Promise<Result<WebDavPropResult>> {
    const set = Object.entries(options.set ?? {})
      .map(([key, value]) => `<V:${key}>${escapeXml(value)}</V:${key}>`)
      .join("");
    const remove = (options.remove ?? []).map((key) => `<V:${key}/>`).join("");
    const body =
      '<?xml version="1.0" encoding="utf-8" ?>' +
      `<D:propertyupdate xmlns:D="DAV:" xmlns:V="${METAMOJI_PROP_NS}">` +
      `<D:set><D:prop>${set}</D:prop></D:set>` +
      `<D:remove><D:prop>${remove}</D:prop></D:remove>` +
      "</D:propertyupdate>";

    const result = await this.send(resourceUrl, "PROPPATCH", options, "text", {
      body,
      contentType: "application/xml; charset=utf-8",
    });
    if (result.error) return fail(result.error);
    return ok(parseMultiStatus(result.data.status, result.data.text ?? "", resourceUrl));
  }

  private send(
    resourceUrl: string,
    method: string,
    options: WebDavRequestOptions,
    parse: "binary" | "text",
    payload?: { body: Uint8Array | string; contentType: string },
  ) {
    return this.ctx.request({
      base: "absolute",
      path: resourceUrl,
      method,
      headerSet: "none",
      // Basic auth and the app code do the work here; no session cookie applies.
      scope: "cs",
      headers: { ...this.authHeaders(), ...options.headers },
      parse,
      ...(payload ? { raw: payload } : {}),
    });
  }

  private authHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    const appAuthKey = this.auth.appAuthKey ?? this.ctx.session.appAuthKey;
    if (appAuthKey) headers["x-mmj-appcode"] = appAuthKey;
    const { username, password } = this.auth;
    if (username && password) {
      headers["authorization"] = `Basic ${base64(`${username}:${password}`)}`;
    }
    return headers;
  }
}

function status(code: number): WebDavResult {
  const isSuccessful = code >= 200 && code < 300;
  return {
    responseStatusCode: code,
    isSuccessful,
    isCancelled: false,
    ...(isSuccessful ? {} : { errorString: `HTTP ${code}` }),
  };
}

/** Turns a `207 Multi-Status` body into the tree the app builds from it. */
export function parseMultiStatus(
  code: number,
  xml: string,
  requestedUrl?: string,
): WebDavPropResult {
  const base: WebDavPropResult = {
    ...status(code),
    responseString: xml,
    multiResponses: {},
    hrefs: [],
    isValidMultiResponse: false,
    liveProperties: {},
    deadProperties: {},
  };

  const root = parseXml(xml);
  if (!root || root.name !== "multistatus") return base;

  const items: WebDavItem[] = [];
  for (const response of childrenNamed(root, DAV_NS, "response")) {
    const item = toItem(response);
    if (!item.href) continue;
    items.push(item);
    base.hrefs.push(item.href);
    base.multiResponses[item.href] = item;
  }
  base.isValidMultiResponse = true;

  // Depth > 0 returns a flat list; nest it back by href prefix so callers get
  // the tree `NwWebDAVItem.children` describes.
  const root_ = pickRoot(items, requestedUrl);
  if (root_) {
    nest(items, base.multiResponses);
    base.itemTree = root_;
    base.liveProperties = root_.liveProperties;
    base.deadProperties = root_.deadProperties;
  }
  return base;
}

function toItem(response: XmlNode): WebDavItem {
  const href = childNamed(response, DAV_NS, "href")?.text.trim();
  const item: WebDavItem = {
    href,
    uriName: href ? lastSegment(href) : undefined,
    liveProperties: {},
    deadProperties: {},
    children: [],
  };

  for (const propstat of childrenNamed(response, DAV_NS, "propstat")) {
    const prop = childNamed(propstat, DAV_NS, "prop");
    if (!prop) continue;
    for (const property of prop.children) {
      if (property.ns === DAV_NS) {
        if (property.name === "resourcetype") {
          item.isCollection = childNamed(property, DAV_NS, "collection") !== undefined;
          continue;
        }
        if (property.name === "displayname") item.displayName = property.text.trim();
        item.liveProperties[property.name] = property.text.trim();
      } else if (property.ns === METAMOJI_PROP_NS) {
        item.deadProperties[property.name] = property.text.trim();
      }
    }
  }
  return item;
}

function lastSegment(href: string): string {
  const path = href.replace(/\/+$/, "");
  const segment = path.slice(path.lastIndexOf("/") + 1);
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function pickRoot(items: WebDavItem[], requestedUrl?: string): WebDavItem | undefined {
  if (items.length === 0) return undefined;
  if (requestedUrl) {
    const path = pathOf(requestedUrl).replace(/\/+$/, "");
    const match = items.find((item) => pathOf(item.href ?? "").replace(/\/+$/, "") === path);
    if (match) return match;
  }
  // Otherwise the shallowest href is the collection that was asked for.
  return items.reduce((shallowest, item) =>
    (item.href ?? "").length < (shallowest.href ?? "").length ? item : shallowest,
  );
}

function nest(items: WebDavItem[], byHref: Record<string, WebDavItem>): void {
  for (const item of items) {
    const href = item.href;
    if (!href) continue;
    const parentHref = parentOf(href);
    if (!parentHref || parentHref === href) continue;
    const parent = byHref[parentHref] ?? byHref[`${parentHref}/`];
    if (parent && parent !== item) parent.children.push(item);
  }
}

function parentOf(href: string): string | undefined {
  const trimmed = href.replace(/\/+$/, "");
  const cut = trimmed.lastIndexOf("/");
  return cut <= 0 ? undefined : `${trimmed.slice(0, cut)}/`;
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  if (typeof btoa === "function") {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }
  return Buffer.from(bytes).toString("base64");
}
