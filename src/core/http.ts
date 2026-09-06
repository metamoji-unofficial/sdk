/**
 * The request pipeline shared by every resource.
 *
 * `MetamojiContext` owns what outlives a single call — configuration, the
 * session identity, the cookie jars — and turns a resource's description of a
 * request into bytes on the wire and a `Result` back. Resources above it only
 * describe *what* to send; header sets, base-URL resolution, cookies, parsing
 * and error mapping all live here.
 */

import {
  resolveConfig,
  type BaseTarget,
  type MetamojiConfig,
  type MetamojiSession,
  type ResolvedConfig,
} from "./config.js";
import { joinUrl, withQuery, withTrailingSlash } from "./url.js";
import { CookieJar, type SessionScope } from "./cookies.js";
import { buildMultipart, type MultipartPart } from "./multipart.js";
import { fail, failFrom, ok, type Result } from "./result.js";
import type { CsRequestBase } from "./types.js";
import {
  createDefaultTransport,
  needsNodeTransport,
  type Transport,
  type TransportResponse,
} from "./transport.js";

export type QueryValue = string | number | boolean | undefined | null;
export type QueryRecord = Record<string, QueryValue>;

/**
 * Which set of custom headers to attach.
 *
 * `cs` is `CsHttpClient`'s four `X-DM-*` headers. `sd` is `SdHttpClient`'s,
 * which swap `X-DM-AppVersion` for `X-DM-Device` and add a `User-Agent`.
 * `none` is for the static-file and third-party hosts, which get neither.
 */
export type HeaderSet = "cs" | "sd" | "none";

export interface RequestSpec {
  base: BaseTarget;
  /** Path relative to the base, or an absolute URL when `base` is `"absolute"`. */
  path: string;
  method: string;
  query?: QueryRecord;
  headers?: Record<string, string>;
  headerSet?: HeaderSet;
  /** Cookie scope. Defaults to `"cs"`. */
  scope?: SessionScope;
  /** Serialised as a JSON body. Sent even on GET/DELETE, as the app does. */
  json?: unknown;
  /** Parts for a `multipart/form-data` body. */
  multipart?: MultipartPart[];
  /** A pre-encoded body, for the binary uploads. */
  raw?: { body: Uint8Array | string; contentType?: string };
  /** How to decode the response. `auto` picks by `Content-Type`. */
  parse?: "json" | "text" | "binary" | "auto";
  timeout?: number;
}

export interface HttpResult {
  status: number;
  headers: Record<string, string>;
  /** Present when the body parsed as JSON. */
  json?: unknown;
  /** Present for text and JSON responses. */
  text?: string;
  bytes: Uint8Array;
}

export class MetamojiContext {
  config: ResolvedConfig;
  session: MetamojiSession;
  readonly cookies = new CookieJar();
  private readonly transport: Transport;

  constructor(config: MetamojiConfig = {}) {
    this.config = resolveConfig(config);
    this.session = { ...config.session };
    this.transport = this.config.transport ?? createDefaultTransport(this.config.fetch);
  }

  /**
   * Merges new configuration in, keeping anything not mentioned. The transport
   * is fixed at construction, so `fetch` and `transport` are not re-read here.
   */
  configure(config: Partial<MetamojiConfig>): void {
    this.config = resolveConfig({ ...this.rawConfig(), ...config });
  }

  /** Merges identity fields into the stored session. */
  setSession(session: MetamojiSession): void {
    this.session = { ...this.session, ...session };
  }

  private rawConfig(): MetamojiConfig {
    // `resolveConfig` is idempotent over its own output, so the resolved values
    // can be fed straight back in as the base for an update.
    return this.config as MetamojiConfig;
  }

  /** The absolute URL a spec resolves to, or an error when its host is unknown. */
  resolveUrl(base: BaseTarget, path: string): Result<string> {
    if (base === "absolute") {
      if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(path)) {
        return fail({
          name: "not_configured",
          message: `Expected an absolute URL but got "${path}".`,
        });
      }
      return ok(path);
    }

    const c = this.config;
    switch (base) {
      case "root":
        return ok(joinUrl(c.rootServer, path));
      case "dc":
        // `ModelInfo$BuildOptions.DIGITAL_CABINET_URL_BASE()` returns
        // `CsCloudServiceContext.getRestHost()` — the *tenant's* host, not the
        // bootstrap root. Sent to the root server, `cosmos/*` answers 404.
        // Before login there is no tenant yet, and the configured default is
        // the only address there is.
        return ok(joinUrl(c.dcServer ?? c.restHost ?? c.rootServer, path));
      case "cdn":
        return ok(joinUrl(c.cdnServer, path));
      case "mazecCdn":
        return ok(joinUrl(c.mazecCdnServer, path));
      case "license":
        return ok(joinUrl(c.licenseServer, path));
      case "rest":
        if (!c.restHost) {
          return fail({
            name: "not_configured",
            message:
              "No REST host. It comes from the login response — call auth.login() first, " +
              "or set `restHost` in the client options.",
          });
        }
        return ok(joinUrl(c.restHost, path));
      case "home":
        if (!c.homeDir) {
          return fail({
            name: "not_configured",
            message:
              "No drive homeDir. Set `homeDir` in the client options, or pass one per call — " +
              "it is per-drive and comes from the cached SdMODrive entity.",
          });
        }
        return ok(joinUrl(c.homeDir, path));
      case "flora": {
        if (!c.floraServer) {
          return fail({
            name: "not_configured",
            message:
              "No Flora server. Set `floraServer` in the client options; the app gets it from " +
              "VfVideoFileManager.getServerName().",
          });
        }
        // `makeFloraCommandUrl` treats a bare hostname as plain http.
        const host = /^https?:\/\//i.test(c.floraServer)
          ? c.floraServer
          : `http://${c.floraServer}`;
        return ok(joinUrl(host, path));
      }
    }
  }

  /** Builds, sends and decodes one request. Never rejects. */
  async request(spec: RequestSpec): Promise<Result<HttpResult>> {
    const resolved = this.resolveUrl(spec.base, spec.path);
    if (resolved.error) return fail(resolved.error);
    const url = withQuery(resolved.data, spec.query);

    const scope = spec.scope ?? "cs";
    const method = spec.method.toUpperCase();
    const headers: Record<string, string> = {
      ...this.commonHeaders(spec.headerSet ?? "cs"),
      ...this.config.headers,
      ...spec.headers,
    };

    let body: Uint8Array | string | undefined;
    if (spec.multipart) {
      const built = buildMultipart(spec.multipart);
      body = built.body;
      headers["content-type"] = built.contentType;
    } else if (spec.raw) {
      body = spec.raw.body;
      if (spec.raw.contentType) headers["content-type"] = spec.raw.contentType;
    } else if (spec.json !== undefined) {
      body = JSON.stringify(spec.json);
      headers["content-type"] = "application/json";
    }

    if (this.config.cookies) {
      const cookie = this.cookies.header(scope, url);
      if (cookie) headers["cookie"] = cookie;
    }

    const request = { url, method, headers, body, timeout: this.config.timeout };
    if (this.config.dropBodyOnGet && needsNodeTransport(request)) {
      delete request.body;
      delete headers["content-type"];
    }

    let response: TransportResponse;
    try {
      response = await this.transport(request);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      return failFrom(/timed out/i.test(message) ? "timeout" : "network_error", cause);
    }

    if (this.config.cookies && response.setCookie.length > 0) {
      this.cookies.save(scope, url, response.setCookie);
    }

    const result = decode(response, spec.parse ?? "auto");
    if (response.status < 200 || response.status >= 300) {
      return fail({
        name: "http_error",
        message: httpMessage(response, result),
        statusCode: response.status,
        data: result.json ?? result.text,
      });
    }
    return ok(result);
  }

  /**
   * `CsHttpClient` / `SdHttpClient` header sets. Both read their values from the
   * same `CsCloudServiceContext`, which is why they share the config fields.
   */
  private commonHeaders(set: HeaderSet): Record<string, string> {
    const c = this.config;
    if (set === "none") return {};
    if (set === "sd") {
      const headers: Record<string, string> = {
        "user-agent": "MMJSdCloudService/1.0",
        "x-dm-locale": c.locale,
        "x-dm-productname": c.productName,
        "x-dm-productversion": c.productVersion,
      };
      if (c.device) headers["x-dm-device"] = c.device;
      return headers;
    }
    return {
      "x-dm-appversion": c.appVersion,
      "x-dm-locale": c.locale,
      "x-dm-productname": c.productName,
      "x-dm-productversion": c.productVersion,
    };
  }

  /**
   * A `CsCloudService` request body: the caller's fields on top of the five
   * `CsParamBaseAbstract` adds to every request.
   */
  csBody<T extends CsRequestBase>(params: T = {} as T): T & Required<CsRequestBase> {
    const c = this.config;
    return {
      deviceName: c.deviceName,
      productName: c.productName,
      productVersion: c.productVersion,
      locale: c.locale,
      timezone: c.timezone,
      ...params,
    } as T & Required<CsRequestBase>;
  }

  /** Records the tenant host a login response points at. */
  setRestHost(restHost: string | undefined): void {
    if (restHost) this.config.restHost = withTrailingSlash(restHost);
  }

  /** Records the drive `homeDir` every `sync.*` call is resolved against. */
  setHomeDir(homeDir: string | undefined): void {
    if (homeDir) this.config.homeDir = withTrailingSlash(homeDir);
  }
}

function decode(response: TransportResponse, parse: NonNullable<RequestSpec["parse"]>): HttpResult {
  const result: HttpResult = {
    status: response.status,
    headers: response.headers,
    bytes: response.body,
  };
  if (parse === "binary") return result;

  const contentType = response.headers["content-type"] ?? "";
  const looksJson = /\bjson\b/i.test(contentType);
  if (parse === "auto" && !looksJson && response.body.byteLength > 0) {
    // Several endpoints answer JSON without saying so (the `Media*` family) and
    // several answer text while the schema calls it a response object, so `auto`
    // decodes text either way and only *tries* JSON.
    result.text = new TextDecoder().decode(response.body);
    result.json = tryParseJson(result.text);
    return result;
  }

  result.text = new TextDecoder().decode(response.body);
  if (parse === "text") return result;
  result.json = tryParseJson(result.text);
  return result;
}

function tryParseJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed || !/^[[{]/.test(trimmed)) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function httpMessage(response: TransportResponse, result: HttpResult): string {
  const body = result.json as { errorMessage?: string; message?: string } | undefined;
  const detail = body?.errorMessage ?? body?.message ?? result.text?.slice(0, 200).trim();
  const status = `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`;
  return detail ? `${status}: ${detail}` : status;
}
