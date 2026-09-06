/**
 * Request and response types for gallery media (`media/gallery-media.tsp`).
 *
 * Separated from the calls that use them; the resource is `./media.ts`.
 */

import type { FileUpload, JsonRecord } from "../../core/types.js";

/** Which field name carries an id — they are never both sent. */
export type MediaIdKind = "recordId" | "clientMediaId";

export interface MediaListItem extends JsonRecord {
  driveId?: string;
  registUserName?: string;
  recordId?: string;
  clientMediaId?: string;
  /** Epoch milliseconds, as a string. */
  createMediaTime?: string;
  /** Bytes, as a string. */
  fileSize?: string;
  url?: string;
  /** `"{note title}\t{media title}"`, per `MediaUtil.titleOnMediaServer`. */
  title?: string;
}

export interface MediaListResponse {
  statusCode: number;
  statusMessage?: string;
  mediaList?: MediaListItem[];
}

export interface MediaStatusItem extends JsonRecord {
  status?: "normal" | "deleted" | "clean" | "regist" | "uploading" | "uploadError";
  registUserId?: string;
  /** The original filename, which the app matches against its local recordings. */
  originalName?: string;
}

export interface MediaStatusResponse {
  statusCode: number;
  statusMessage?: string;
  mediaList?: MediaStatusItem[];
}

/** The shape the plain-text replies are parsed into. */
export interface MediaTextResult {
  statusCode: number;
  /** The body as received, since these formats are only partly recovered. */
  raw: string;
}

export interface MediaTentativeRegistResult extends MediaTextResult {
  /** The id the server issued for the pending upload. */
  recordId?: string;
  /** A follow-up URL whose exact purpose is not recovered. */
  url?: string;
}

export interface MediaSetTitleResult extends MediaTextResult {
  /** Ids whose title was updated, in the order the server reported them. */
  completedIds: string[];
}

/** Credential overrides accepted by every call. */
export interface MediaAuthOptions {
  userId?: string;
  password?: string;
  qwd?: string;
  companyID?: string;
  productVersion?: string;
  timeZone?: string;
}

export interface TentativeRegistOptions extends MediaAuthOptions {
  /** The id being registered. */
  id: string;
  idKind?: MediaIdKind;
  title: string;
  /** MIME type, derived by the app from the file extension. */
  contentType: string;
  /** Extension without the leading dot. */
  suffix: string;
  /** Epoch milliseconds. Defaults to now. */
  createMediaTime?: number;
  /** Attaches the media to a room. Sets `ownerType` to `"1"`. */
  roomId?: string;
  /** Attaches it to a drive. Sets `ownerType` to `"2"`. */
  driveId?: string;
  /** The uploader's display name (`MediaTentativeRegist` uses the nickname). */
  loginName?: string;
}

export interface UploadMediaOptions extends MediaAuthOptions {
  id: string;
  idKind?: MediaIdKind;
  mediaFile: FileUpload;
}

export interface SetMediaTitleOptions extends MediaAuthOptions {
  ids: string[];
  /** One per id, in the same order. */
  titles: string[];
  idKind?: MediaIdKind;
  /** `MediaSetMediaTitle` sends the user's email here, unlike registration. */
  loginName?: string;
}

export interface DeleteMediaOptions extends MediaAuthOptions {
  ids: string[];
  idKind?: MediaIdKind;
}

export interface GetMediaStatusOptions extends MediaAuthOptions {
  ids: string[];
  idKind?: MediaIdKind;
}
