/**
 * Models shared across subsystems, from `docs/typespec/common.tsp`.
 *
 * Every field is optional, as it is in the TypeSpec: the schemas were recovered
 * from smali field declarations, which do not say what the server requires. In
 * practice some of them are mandatory and omitting one produces a non-zero
 * `errorCode` rather than a client-side type error.
 */

/** An object whose shape the app treats as an untyped map. */
export type JsonRecord = Record<string, unknown>;

/**
 * Fields `CsParamBaseAbstract#stringify()` adds to every `CsCloudService`
 * request body. The client fills them from its configuration, so a caller only
 * sets one to override it for a single call.
 */
export interface CsRequestBase {
  /** `CsCloudServiceContext#getDeviceName`. */
  deviceName?: string;
  /** `CsCloudServiceContext#getProductName`. */
  productName?: string;
  productVersion?: string;
  /** e.g. `"ja_JP"`. */
  locale?: string;
  timezone?: string;
}

/** Fields on every `CsCloudService` response (`CsResponseBaseAbstract`). */
export interface CsResponseBase {
  /** 0 is success. A non-zero code is surfaced as `error`, not `data`. */
  errorCode?: number;
  errorName?: string;
  errorMessage?: string;
  errorData?: JsonRecord;
  /** The raw response JSON, including keys with no typed property. */
  bodyMessage?: JsonRecord;
  /** Copied from the HTTP response by the client, not sent by the server. */
  httpStatusCode?: number;
  isUnderMaintenance?: boolean;
  maintMessage?: string;
  currentEULAVersion?: number;
  requiredEULAVersion?: number;
}

/** One saved account, as used for automatic re-login. */
export interface CsLoginInfo {
  serverUrl?: string;
  isOnPremise?: boolean;
  isClassRoom?: boolean;
  coLoginId?: string;
  userId?: string;
  qwd?: string;
  companyName?: string;
}

/** Key/value pair used to build the billing endpoints' parameters. */
export interface CsNameValuePair {
  name?: string;
  value?: string;
}

/** `CsUpdateClassBoxParam.ClassBoxJoinStatus`. */
export type CsClassBoxJoinStatus = "ENABLED" | "DISABLED" | "NO_VALUE";

/**
 * A downloaded body the app would have written to a temporary file. This client
 * hands back the bytes instead and leaves storage to the caller.
 */
export interface BinaryPayload {
  bytes: Uint8Array;
  /** The response's `Content-Type`, when it sent one. */
  mimeType?: string;
  httpStatusCode?: number;
}

/** Bytes to upload, plus the metadata a multipart part needs. */
export interface FileUpload {
  data: Uint8Array | ArrayBuffer;
  /** Sent as the part's `filename`; the app uses the source `File.getName()`. */
  filename?: string;
  contentType?: string;
}
