/**
 * Request and response types for remote file conversion (`legacy/remote-converter.tsp`).
 *
 * Separated from the calls that use them; the resource is `./converter.ts`.
 */

import type { FileUpload } from "../../core/types.js";

export interface RcResponseBase {
  /** `"0"` is success. Note the string, not a number. */
  errorCode?: string;
  errorMessage?: string;
  [key: string]: unknown;
}

export interface RcRegisterResponse extends RcResponseBase {
  jobId1?: string;
  jobId2?: string;
}

export interface RegisterJobOptions {
  userId?: string;
  password?: string;
  productVersion?: string;
  timeZone?: string;
}

export interface ConvertRequestOptions {
  jobId1: string;
  jobId2: string;
  /** Source MIME type; also the file part's `Content-Type`. */
  fromMime: string;
  /** Source extension. */
  fromSuffix: string;
  /** Target MIME type. The app always asks for `application/pdf`. */
  toMime: string;
  toSuffix: string;
  file: FileUpload;
}

export interface ConvertedFile {
  /** True once the conversion finished and `bytes` holds the output. */
  done: boolean;
  bytes?: Uint8Array;
  mimeType?: string;
  /** The status envelope, present while the job is still running. */
  status?: RcResponseBase;
}
