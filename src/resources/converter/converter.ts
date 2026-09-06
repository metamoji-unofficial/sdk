/**
 * Remote file conversion (`legacy/remote-converter.tsp`).
 *
 * A three-step asynchronous job: register to get a pair of job tokens, submit
 * the file, then poll for the result. The tokens double as the job's
 * authorisation — only the first step sends credentials.
 *
 * **Nothing in the shipped app calls this.** The implementation is complete and
 * the endpoints presumably still answer, but the one caller
 * (`ImportActivity.importFileWithConvertingByRemoteConverter`, which converts
 * unsupported formats to PDF) has no callers of its own in v3.15.1.0. It is
 * wrapped for completeness; treat it as unverified.
 *
 * `errorCode` is a *string* in this subsystem, not a number. `"100"` from
 * `getConvertedFile` means "still converting" and is returned as data rather
 * than an error, since it is the expected answer while polling.
 */

import { rcEnvelope } from "../../core/envelope.js";
import type { MetamojiContext } from "../../core/http.js";
import { filePart, type MultipartPart } from "../../core/multipart.js";
import { fail, ok, type Result } from "../../core/result.js";
import type {
  ConvertRequestOptions,
  ConvertedFile,
  RcRegisterResponse,
  RcResponseBase,
  RegisterJobOptions,
} from "./interfaces.js";

/** `"100"`: the job is queued or running. */
export const RC_CONVERTING = "100";
/** `"14"` from `register`: the account has no licence for conversion. */
export const RC_NO_LICENSE = "14";

export class RemoteConverter {
  constructor(private readonly ctx: MetamojiContext) {}

  /**
   * Step 1 — registers a job and returns its two tokens.
   * `RcTentativeRegistURLConnection` — `POST {dc}/convert/TentativeRegist`.
   *
   * The app refuses to send this at all without both a user id and a password.
   */
  async register(options: RegisterJobOptions = {}): Promise<Result<RcRegisterResponse>> {
    const c = this.ctx.config;
    const s = this.ctx.session;
    const userId = options.userId ?? s.userId;
    const password = options.password ?? s.password;
    if (!userId || !password) {
      return fail({
        name: "not_configured",
        message:
          "Remote conversion needs a user id and a cleartext password; the app does not send " +
          "this request without both. A `qwd` is not accepted here.",
      });
    }

    return rcEnvelope(
      await this.ctx.request({
        base: "dc",
        path: "convert/TentativeRegist",
        method: "POST",
        headerSet: "none",
        multipart: [
          { name: "userId", value: userId },
          { name: "password", value: password },
          { name: "productName", value: c.productName },
          { name: "productVersion", value: options.productVersion ?? c.productVersion },
          { name: "timeZone", value: options.timeZone ?? c.timezone },
        ],
      }),
    );
  }

  /**
   * Step 2 — submits the file. Carries no credentials: the job tokens stand in.
   * `RcConvertRequestURLConnection` — `POST {dc}/convert/ConvertRequest`.
   */
  async convert(options: ConvertRequestOptions): Promise<Result<RcResponseBase>> {
    const parts: MultipartPart[] = [
      { name: "jobId1", value: options.jobId1 },
      { name: "jobId2", value: options.jobId2 },
      { name: "fromMime", value: options.fromMime },
      { name: "fromSuffix", value: options.fromSuffix },
      { name: "toMime", value: options.toMime },
      { name: "toSuffix", value: options.toSuffix },
      filePart("fileEntity", options.file, options.fromMime),
    ];

    return rcEnvelope(
      await this.ctx.request({
        base: "dc",
        path: "convert/ConvertRequest",
        method: "POST",
        headerSet: "none",
        multipart: parts,
      }),
    );
  }

  /**
   * Step 3 — polls for the result. Returns `done: false` while the job is still
   * running, which the app handles by retrying every two seconds.
   * `RcGetConvertedFileURLConnection` — `POST {dc}/convert/GetConvertedFile`.
   */
  async getConvertedFile(options: {
    jobId1: string;
    jobId2: string;
    /** The `toMime` that was requested; the reply is the file only if it matches. */
    toMime?: string;
  }): Promise<Result<ConvertedFile>> {
    const result = await this.ctx.request({
      base: "dc",
      path: "convert/GetConvertedFile",
      method: "POST",
      headerSet: "none",
      multipart: [
        { name: "jobId1", value: options.jobId1 },
        { name: "jobId2", value: options.jobId2 },
      ],
      parse: "auto",
    });
    if (result.error) return fail(result.error);

    const contentType = result.data.headers["content-type"];
    const isFile = options.toMime
      ? contentType === options.toMime
      : result.data.json === undefined;

    if (isFile) {
      return ok({ done: true, bytes: result.data.bytes, mimeType: contentType });
    }

    const status = (result.data.json ?? {}) as RcResponseBase;
    // "Still converting" is the expected answer while polling, not a failure.
    if (status.errorCode === RC_CONVERTING || status.errorCode === "0") {
      return ok({ done: false, status });
    }
    return rcEnvelope<ConvertedFile>(result);
  }
}
