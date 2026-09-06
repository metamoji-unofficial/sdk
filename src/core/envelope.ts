/**
 * Turning each subsystem's own idea of "did that work" into a `Result`.
 *
 * There is no shared envelope. `CsCloudService` and `SdCloudService` report a
 * numeric `errorCode` where 0 means success; the remote converter uses the same
 * field name with a *string* value; the gallery-media JSON endpoints use
 * `statusCode`; the legacy store uses `result`; the room and video subsystems
 * document no envelope at all and their bodies are passed through untouched.
 *
 * Each family gets one function here, so a resource method is a description of
 * the request plus the name of its envelope.
 */

import type { HttpResult } from "./http.js";
import { fail, ok, type MetamojiError, type Result } from "./result.js";

/** `SdCloudServiceErrorCode.NOT_LOGIN_EXCEPTION`; triggers the sync auto-login. */
export const SD_NOT_LOGIN = 0x2af9;
/** `SdCloudServiceErrorCode` revision conflict — the caller's revision is stale. */
export const SD_REVISION_CONFLICT = 0x2afa;
/** The legacy store's "you need a session" code; triggers a guest login. */
export const STORE_LOGIN_REQUIRED = "1";
/** `MediaBgTaskForDelete` treats 899 as success alongside 0. */
export const GALLERY_DELETE_ALREADY_GONE = 899;

/** Fields `CsResponseBaseAbstract` fills in on the client side, not the wire. */
interface ClientSideFields {
  httpStatusCode?: number;
  bodyMessage?: Record<string, unknown>;
}

function withClientFields<T>(payload: unknown, http: HttpResult): T {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return payload as T;
  }
  const extras: ClientSideFields = { httpStatusCode: http.status };
  // `bodyMessage` is the raw JSON, including keys with no typed property.
  if (http.json && typeof http.json === "object" && !Array.isArray(http.json)) {
    extras.bodyMessage = http.json as Record<string, unknown>;
  }
  return { ...extras, ...(payload as object) } as T;
}

function missingBody(http: HttpResult): MetamojiError {
  return {
    name: "invalid_response",
    message: `Expected a JSON body but got ${http.headers["content-type"] ?? "no content type"}.`,
    statusCode: http.status,
    data: http.text,
  };
}

/**
 * `CsCloudService` and `SdCloudService`: `errorCode` 0 (or absent) is success,
 * anything else is an error carrying `errorName` / `errorMessage` / `errorData`.
 */
export function csEnvelope<T>(result: Result<HttpResult>): Result<T> {
  if (result.error) return fail(result.error);
  const http = result.data;
  const body = http.json;
  if (body === undefined) return fail(missingBody(http));

  const envelope = body as {
    errorCode?: number;
    errorName?: string;
    errorMessage?: string;
    errorData?: unknown;
  };
  if (typeof envelope.errorCode === "number" && envelope.errorCode !== 0) {
    return fail({
      name: envelope.errorName ?? "application_error",
      message: envelope.errorMessage ?? `Request failed with errorCode ${envelope.errorCode}.`,
      statusCode: http.status,
      code: envelope.errorCode,
      data: envelope.errorData ?? body,
    });
  }
  return ok(withClientFields<T>(body, http));
}

/** Same shape as `csEnvelope`; named separately so `sync.*` reads honestly. */
export const sdEnvelope = csEnvelope;

/** `DvmResultBase`: numeric `errorCode`, plus an app-defined `responseCode`. */
export function dvmEnvelope<T>(result: Result<HttpResult>): Result<T> {
  if (result.error) return fail(result.error);
  const http = result.data;
  const body = http.json;
  if (body === undefined) return fail(missingBody(http));

  const envelope = body as { errorCode?: number; errorMessage?: string };
  if (typeof envelope.errorCode === "number" && envelope.errorCode !== 0) {
    return fail({
      name: "application_error",
      message: envelope.errorMessage ?? `Request failed with errorCode ${envelope.errorCode}.`,
      statusCode: http.status,
      code: envelope.errorCode,
      data: body,
    });
  }
  return ok(body as T);
}

/** `RcResponseBase`: `errorCode` is a string, `"0"` is success. */
export function rcEnvelope<T>(result: Result<HttpResult>): Result<T> {
  if (result.error) return fail(result.error);
  const http = result.data;
  const body = http.json;
  if (body === undefined) return fail(missingBody(http));

  const envelope = body as { errorCode?: string; errorMessage?: string };
  if (envelope.errorCode !== undefined && envelope.errorCode !== "0") {
    return fail({
      name: "application_error",
      message: envelope.errorMessage ?? `Conversion failed with errorCode ${envelope.errorCode}.`,
      statusCode: http.status,
      code: envelope.errorCode,
      data: body,
    });
  }
  return ok(body as T);
}

/** The two gallery-media endpoints that answer JSON: `statusCode` 0 is success. */
export function galleryJsonEnvelope<T>(result: Result<HttpResult>): Result<T> {
  if (result.error) return fail(result.error);
  const http = result.data;
  const body = http.json;
  if (body === undefined) return fail(missingBody(http));

  const envelope = body as { statusCode?: number; statusMessage?: string };
  if (typeof envelope.statusCode === "number" && envelope.statusCode !== 0) {
    return fail({
      name: "application_error",
      message: envelope.statusMessage ?? `Request failed with statusCode ${envelope.statusCode}.`,
      statusCode: http.status,
      code: envelope.statusCode,
      data: body,
    });
  }
  return ok(body as T);
}

/**
 * `LbStoreStatusResponse`: `result` is `"0"` on success and `"1"` when the
 * guest session has lapsed. The caller re-logs in and retries on `"1"`, so this
 * reports it as an error with the code intact rather than swallowing it.
 */
export function storeEnvelope<T>(result: Result<HttpResult>): Result<T> {
  if (result.error) return fail(result.error);
  const http = result.data;
  const body = http.json;
  if (body === undefined) return fail(missingBody(http));

  const envelope = body as { result?: string; message?: string };
  if (envelope.result !== undefined && envelope.result !== "0") {
    return fail({
      name: envelope.result === STORE_LOGIN_REQUIRED ? "login_required" : "application_error",
      message: envelope.message ?? `Store request failed with result ${envelope.result}.`,
      statusCode: http.status,
      code: envelope.result,
      data: body,
    });
  }
  return ok(body as T);
}

/** For the subsystems with no envelope: hand back whatever JSON arrived. */
export function jsonPassthrough<T>(result: Result<HttpResult>): Result<T> {
  if (result.error) return fail(result.error);
  const http = result.data;
  if (http.json === undefined) return fail(missingBody(http));
  return ok(http.json as T);
}

/** For endpoints whose body is the payload itself. */
export function textPassthrough(result: Result<HttpResult>): Result<string> {
  if (result.error) return fail(result.error);
  return ok(result.data.text ?? "");
}
