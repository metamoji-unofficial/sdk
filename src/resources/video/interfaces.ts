/**
 * Request and response types for video clips on the Flora servers (`media/video.tsp`).
 *
 * Separated from the calls that use them; the resource is `./video.ts`.
 */

import type { JsonRecord } from "../../core/types.js";

/** One clip's metadata (`VfClipInfo`). */
export interface VfClipInfo {
  clipid?: number;
  clipsize?: number;
  comment?: string;
  invalidinfo?: number;
  playback_time?: string;
  playback_url?: string;
  posterframe?: string;
  registdate?: string;
  serverID?: string;
  timestamp?: string;
  title?: string;
}

export interface VideoAuthOptions {
  /** `loginUser`. Defaults to the session's login name or email. */
  loginUser?: string;
  /** `loginCompany`. Defaults to the organisation's login id. */
  loginCompany?: string;
  password?: string;
  qwd?: string;
  userId?: string;
  companyId?: string;
  productVersion?: string;
  /** `rootServer`; defaults to the client's configured root. */
  rootServer?: string;
}

export type ClipListOrder =
  | "timestamp"
  | "registdate"
  | "duration"
  | "size"
  | "title"
  | "comment"
  | "index";

export interface ListClipsOptions extends VideoAuthOptions {
  /** `off` — how many to skip. */
  offset?: number;
  /** `c` — how many to return. */
  limit?: number;
  order?: ClipListOrder;
  orderDir?: "ASC" | "DESC";
  /** `filter` — a search keyword. */
  keyword?: string;
  /** `fu`; the app's use of it is not recovered. */
  fu?: string;
}

export interface ClipCountResponse extends JsonRecord {
  count?: number;
}

export interface ServerStatusResponse extends JsonRecord {
  current_status?: string;
  /** Largest file the server will accept, in megabytes. */
  max_filesize_mb?: number;
}

export interface UploadPointResponse extends JsonRecord {
  /** The signed URL `uploadFile` posts to. */
  upload_url?: string;
}

export interface ReserveResponse extends JsonRecord {
  /** Sent back as the `mmj.ms.ticket` header on each upload. */
  ticket?: string;
}

export interface UploadFileOptions {
  /** The `upload_url` from `getUploadPoint`. */
  uploadUrl: string;
  /** The ticket from `reserve`. */
  ticket: string;
  data: Uint8Array | ArrayBuffer;
  /** XML for the metadata, JPEG for the poster frame, octet-stream for the video. */
  contentType: "application/xml" | "image/jpeg" | "application/octet-stream";
  companyId?: string;
  userId?: string;
}
