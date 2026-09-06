/**
 * Gallery media — voice recordings and photos attached to notes
 * (`media/gallery-media.tsp`).
 *
 * An older subsystem with its own conventions, all of which are reproduced here
 * rather than smoothed over:
 *
 * - Credentials go in plain form fields, not a JSON `authInfo` part, and the
 *   password field is named `password` or `qwd` depending on what is available.
 * - A media item is identified by either a client-generated `clientMediaId` or
 *   a server-issued `recordId`. The *field name itself* switches between the
 *   two, so every call taking ids also takes an `idKind`.
 * - Multiple ids are not an array: they are sent as `recordId0`, `recordId1`,
 *   ... as separate parts. `setTitles` numbers its titles the same way.
 * - Only two endpoints answer JSON. The rest reply with line- and
 *   comma-delimited text, which is parsed here into the same result shapes the
 *   app derives from it.
 *
 * On a 403 the app re-runs `login` and retries once; so does this client, when
 * `autoLogin` is on.
 */

import { galleryJsonEnvelope } from "../core/envelope.js";
import type { HttpResult, MetamojiContext } from "../core/http.js";
import { filePart, optionalPart, type MultipartPart } from "../core/multipart.js";
import { fail, ok, type Result } from "../core/result.js";
import type { BinaryPayload, FileUpload, JsonRecord } from "../core/types.js";

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

export class GalleryMedia {
  constructor(private readonly ctx: MetamojiContext) {}

  /**
   * Signs in to the gallery server. Its session is separate from the main one,
   * and the other calls re-run this on a 403.
   * `MediaLogin` — `POST {dc}/gallery/LoginMedia`.
   */
  async login(options: MediaAuthOptions = {}): Promise<Result<MediaTextResult>> {
    const parts = this.credentialParts(options);
    const result = await this.ctx.request({
      base: "dc",
      path: "gallery/LoginMedia",
      method: "POST",
      headerSet: "none",
      scope: "media",
      multipart: parts,
      parse: "text",
    });
    return parseTextResult(result, (text) => ({ statusCode: leadingCode(text), raw: text }));
  }

  /**
   * Everything the user has uploaded. Answers JSON, and — alone among these
   * calls — sends no `companyID`.
   * `MediaGetList` — `GET {dc}/gallery/GetMediaList`.
   */
  async list(options: MediaAuthOptions = {}): Promise<Result<MediaListResponse>> {
    return this.withReauth(options, async () =>
      galleryJsonEnvelope<MediaListResponse>(
        await this.ctx.request({
          base: "dc",
          path: "gallery/GetMediaList",
          method: "GET",
          headerSet: "none",
          scope: "media",
          query: {
            userId: options.userId ?? this.ctx.session.userId ?? "",
            productName: this.ctx.config.productName,
            productVersion: options.productVersion ?? this.ctx.config.productVersion,
            timeZone: options.timeZone ?? this.ctx.config.timezone,
          },
        }),
      ),
    );
  }

  /**
   * Upload state for specific media. Answers JSON.
   * `MediaGetStatus` — `GET {dc}/gallery/GetMediaStatus`.
   */
  async getStatus(options: GetMediaStatusOptions): Promise<Result<MediaStatusResponse>> {
    const kind = options.idKind ?? "recordId";
    const query: Record<string, string> = {
      userId: options.userId ?? this.ctx.session.userId ?? "",
      productName: this.ctx.config.productName,
      productVersion: options.productVersion ?? this.ctx.config.productVersion,
      timeZone: options.timeZone ?? this.ctx.config.timezone,
      companyID: options.companyID ?? this.ctx.session.companyId ?? "",
    };
    // Indexed parameters, not an array: recordId0, recordId1, ...
    options.ids.forEach((id, index) => {
      query[`${kind}${index}`] = id;
    });

    return this.withReauth(options, async () =>
      galleryJsonEnvelope<MediaStatusResponse>(
        await this.ctx.request({
          base: "dc",
          path: "gallery/GetMediaStatus",
          method: "GET",
          headerSet: "none",
          scope: "media",
          query,
        }),
      ),
    );
  }

  /**
   * Reserves an upload slot, which is where a server-issued `recordId` comes
   * from. Always precedes `upload`.
   * `MediaTentativeRegist` — `POST {dc}/gallery/TentativeRegistMedia`.
   */
  async register(options: TentativeRegistOptions): Promise<Result<MediaTentativeRegistResult>> {
    const kind = options.idKind ?? "clientMediaId";
    const ownerType = options.roomId ? "1" : options.driveId ? "2" : "0";

    const parts: MultipartPart[] = [];
    optionalPart(parts, "loginName", options.loginName);
    optionalPart(parts, "userId", options.userId ?? this.ctx.session.userId);
    this.appendPassword(parts, options);
    parts.push({ name: "ownerType", value: ownerType });
    optionalPart(parts, "roomId", options.roomId);
    optionalPart(parts, "driveId", options.driveId);
    parts.push(
      { name: "productName", value: this.ctx.config.productName },
      { name: "productVersion", value: options.productVersion ?? this.ctx.config.productVersion },
      // Formatted with "%.0f" in the app, i.e. integer milliseconds.
      { name: "createMediaTime", value: String(Math.round(options.createMediaTime ?? Date.now())) },
      { name: "timeZone", value: options.timeZone ?? this.ctx.config.timezone },
      { name: "contentType", value: options.contentType },
      { name: "suffix", value: options.suffix.replace(/^\./, "") },
      { name: "title", value: options.title },
      { name: kind, value: options.id },
      { name: "companyID", value: options.companyID ?? this.ctx.session.companyId ?? "" },
    );

    return this.withReauth(options, async () =>
      parseTextResult(
        await this.ctx.request({
          base: "dc",
          path: "gallery/TentativeRegistMedia",
          method: "POST",
          headerSet: "none",
          scope: "media",
          multipart: parts,
          parse: "text",
        }),
        parseTentativeRegist,
      ),
    );
  }

  /**
   * Uploads the file itself, after `register`.
   * `MediaUpload` — `POST {dc}/gallery/UploadMedia`.
   */
  async upload(options: UploadMediaOptions): Promise<Result<MediaTextResult>> {
    const kind = options.idKind ?? "clientMediaId";
    const parts = this.credentialParts(options, { withCompany: false });
    parts.push({ name: kind, value: options.id });
    parts.push(filePart("mediaFile", options.mediaFile));
    parts.push({
      name: "companyID",
      value: options.companyID ?? this.ctx.session.companyId ?? "",
    });

    return this.withReauth(options, async () =>
      parseTextResult(
        await this.ctx.request({
          base: "dc",
          path: "gallery/UploadMedia",
          method: "POST",
          headerSet: "none",
          scope: "media",
          multipart: parts,
          parse: "text",
        }),
        parseUploadResult,
      ),
    );
  }

  /**
   * Downloads the media itself. Sends no credentials — it relies on the gallery
   * session cookie.
   * `MediaGetMediaFile` — `GET {dc}/gallery/GetMediaFile/`.
   *
   * The app discards anything whose `Content-Type` does not begin `audio/`;
   * this client returns the bytes and the type and leaves that call to you.
   */
  async download(
    options: { id: string; idKind?: MediaIdKind },
  ): Promise<Result<BinaryPayload>> {
    const kind = options.idKind ?? "recordId";
    const result = await this.ctx.request({
      base: "dc",
      path: "gallery/GetMediaFile/",
      method: "GET",
      headerSet: "none",
      scope: "media",
      query: { [kind]: options.id },
      parse: "binary",
    });
    if (result.error) return fail(result.error);
    return ok({
      bytes: result.data.bytes,
      mimeType: result.data.headers["content-type"],
      httpStatusCode: result.data.status,
    });
  }

  /**
   * Renames one or more items.
   * `MediaSetMediaTitle` — `POST {dc}/gallery/SetMediaTitle`.
   */
  async setTitles(options: SetMediaTitleOptions): Promise<Result<MediaSetTitleResult>> {
    if (options.ids.length !== options.titles.length) {
      throw new TypeError("setTitles: `ids` and `titles` must be the same length.");
    }
    const kind = options.idKind ?? "recordId";
    const parts: MultipartPart[] = [];
    optionalPart(parts, "loginName", options.loginName ?? this.ctx.session.email);
    optionalPart(parts, "userId", options.userId ?? this.ctx.session.userId);
    this.appendPassword(parts, options);
    parts.push(
      { name: "productName", value: this.ctx.config.productName },
      { name: "productVersion", value: options.productVersion ?? this.ctx.config.productVersion },
      { name: "timeZone", value: options.timeZone ?? this.ctx.config.timezone },
    );
    options.ids.forEach((id, index) => parts.push({ name: `${kind}${index}`, value: id }));
    options.titles.forEach((title, index) =>
      parts.push({ name: `title${index}`, value: title }),
    );
    parts.push({
      name: "companyID",
      value: options.companyID ?? this.ctx.session.companyId ?? "",
    });

    return this.withReauth(options, async () =>
      parseTextResult(
        await this.ctx.request({
          base: "dc",
          path: "gallery/SetMediaTitle",
          method: "POST",
          headerSet: "none",
          scope: "media",
          multipart: parts,
          parse: "text",
        }),
        parseSetTitleResult,
      ),
    );
  }

  /**
   * Deletes one or more items.
   * `MediaDelete` — `POST {dc}/gallery/DeleteMediaFile`.
   */
  async remove(options: DeleteMediaOptions): Promise<Result<MediaTextResult>> {
    const kind = options.idKind ?? "recordId";
    const parts = this.credentialParts(options, { withCompany: false });
    options.ids.forEach((id, index) => parts.push({ name: `${kind}${index}`, value: id }));
    parts.push({
      name: "companyID",
      value: options.companyID ?? this.ctx.session.companyId ?? "",
    });

    return this.withReauth(options, async () =>
      parseTextResult(
        await this.ctx.request({
          base: "dc",
          path: "gallery/DeleteMediaFile",
          method: "POST",
          headerSet: "none",
          scope: "media",
          multipart: parts,
          parse: "text",
        }),
        parseDeleteResult,
      ),
    );
  }

  /** userId, one of password/qwd, product identifiers, time zone, company. */
  private credentialParts(
    options: MediaAuthOptions,
    { withCompany = true }: { withCompany?: boolean } = {},
  ): MultipartPart[] {
    const parts: MultipartPart[] = [
      { name: "userId", value: options.userId ?? this.ctx.session.userId ?? "" },
    ];
    this.appendPassword(parts, options);
    parts.push(
      { name: "productName", value: this.ctx.config.productName },
      { name: "productVersion", value: options.productVersion ?? this.ctx.config.productVersion },
      { name: "timeZone", value: options.timeZone ?? this.ctx.config.timezone },
    );
    if (withCompany) {
      parts.push({
        name: "companyID",
        value: options.companyID ?? this.ctx.session.companyId ?? "",
      });
    }
    return parts;
  }

  /**
   * `MediaUtil.getPasswordParamName` picks the field name from what it has:
   * a `qwd` is preferred over a cleartext password, and only one is ever sent.
   */
  private appendPassword(parts: MultipartPart[], options: MediaAuthOptions): void {
    const qwd = options.qwd ?? this.ctx.session.qwd;
    const password = options.password ?? this.ctx.session.password;
    if (qwd) parts.push({ name: "qwd", value: qwd });
    else if (password) parts.push({ name: "password", value: password });
  }

  /** Re-runs `login` once on a 403, as each `MediaBgTaskForXxx` does. */
  private async withReauth<T>(
    options: MediaAuthOptions,
    run: () => Promise<Result<T>>,
  ): Promise<Result<T>> {
    const first = await run();
    if (!this.ctx.config.autoLogin || first.error?.statusCode !== 403) return first;
    const relogin = await this.login(options);
    if (relogin.error) return first;
    return run();
  }
}

function parseTextResult<T>(
  result: Result<HttpResult>,
  parse: (text: string) => T,
): Result<T> {
  if (result.error) return fail(result.error);
  return ok(parse(result.data.text ?? ""));
}

/** The integer before the first comma, which every reply leads with. */
function leadingCode(text: string): number {
  const head = text.trim().split(",", 1)[0] ?? "";
  const code = Number.parseInt(head, 10);
  return Number.isNaN(code) ? -1 : code;
}

function lines(text: string): string[] {
  return text.split(/\r\n|\r|\n/);
}

/** Status on the first line, then `recordId`, then a follow-up URL. */
function parseTentativeRegist(text: string): MediaTentativeRegistResult {
  const parts = lines(text);
  return {
    statusCode: leadingCode(text),
    recordId: parts[1]?.trim() || undefined,
    url: parts[2]?.trim() || undefined,
    raw: text,
  };
}

/** Progress lines, a bare `finish`, then the status line. */
function parseUploadResult(text: string): MediaTextResult {
  const parts = lines(text);
  const finish = parts.findIndex((line) => line.trim() === "finish");
  const statusLine = finish === -1 ? parts[parts.length - 1] : parts[finish + 1];
  return { statusCode: leadingCode(statusLine ?? ""), raw: text };
}

/** One line per renamed item, then `finish`, then the overall status. */
function parseSetTitleResult(text: string): MediaSetTitleResult {
  const parts = lines(text);
  const finish = parts.findIndex((line) => line.startsWith("finish"));
  const head = finish === -1 ? [] : parts.slice(0, finish);
  const tail = finish === -1 ? parts.slice(-1) : parts.slice(finish + 1);
  return {
    completedIds: head
      .map((line) => (line.split(",", 1)[0] ?? "").trim())
      .filter((id) => id.length > 0),
    statusCode: leadingCode(tail.find((line) => line.trim().length > 0) ?? ""),
    raw: text,
  };
}

/**
 * Everything after the `finish` line is a status line; the app keeps the last
 * one. 0 and 899 (already gone) both count as success.
 */
function parseDeleteResult(text: string): MediaTextResult {
  const parts = lines(text);
  const finish = parts.findIndex((line) => line.startsWith("finish"));
  const after = finish === -1 ? [] : parts.slice(finish + 1).filter((line) => line.trim());
  const last = after[after.length - 1];
  return { statusCode: last === undefined ? leadingCode(text) : leadingCode(last), raw: text };
}
