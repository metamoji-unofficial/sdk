/**
 * The `{ data, error }` result every call resolves to.
 *
 * Like Resend's client, nothing here throws for an API-level failure: a
 * transport error, a non-2xx status and an application error code all come back
 * as `error`, so a caller can branch on one shape instead of wrapping every call
 * in a try/catch. Programmer errors (a missing required argument) still throw.
 */

export interface MetamojiError {
  /**
   * Error identifier. Either the server's own name (`errorName` on a
   * `CsCloudService` response) or one of this client's names — see
   * `ClientErrorName`.
   */
  name: string;

  /** Human-readable message, safe to show to a user when the server supplied it. */
  message: string;

  /** HTTP status, when the failure got as far as a response. */
  statusCode?: number;

  /**
   * The subsystem's own result code, verbatim. Numeric for `CsCloudService` /
   * `SdCloudService` / `DvmCloudService`, a string for the remote converter and
   * the legacy store, absent when the failure never reached the application
   * layer.
   */
  code?: number | string;

  /** Extra payload the server attached (`errorData`, or the raw body). */
  data?: unknown;
}

/** Names this client produces itself, as opposed to ones relayed from a server. */
export type ClientErrorName =
  | "network_error"
  | "timeout"
  | "invalid_response"
  | "http_error"
  | "application_error"
  | "login_required"
  | "not_configured"
  | "unsupported_environment"
  | "hash_mismatch";

export type Result<T> = { data: T; error: null } | { data: null; error: MetamojiError };

export function ok<T>(data: T): Result<T> {
  return { data, error: null };
}

export function fail<T = never>(error: MetamojiError): Result<T> {
  return { data: null, error };
}

/** Wraps a thrown value as a result, so a resource method never rejects. */
export function failFrom<T = never>(name: ClientErrorName, cause: unknown): Result<T> {
  const message = cause instanceof Error ? cause.message : String(cause);
  return fail<T>({ name, message, data: cause });
}
