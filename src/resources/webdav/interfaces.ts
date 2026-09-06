/**
 * Request and response types for the WebDAV data plane (`drive/webdav.tsp`).
 *
 * Separated from the calls that use them; the resource is `./webdav.ts`.
 */

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
