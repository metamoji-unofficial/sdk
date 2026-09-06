/**
 * Video clips embedded in notes — the "Flora" API (`media/video.tsp`).
 *
 * A subsystem apart from everything else: its own server, assigned per session
 * rather than fixed, and its own convention of putting the login in multipart
 * parts. Set `floraServer` on the client (the app reads it from
 * `VfVideoFileManager.getServerName()`); a bare hostname is addressed over
 * plain `http`, which is what `makeFloraCommandUrl` does.
 *
 * Command paths all end in `2` — `getlist` becomes `flora/api/v1/getlist2`.
 *
 * Uploading a clip is a three-step dance: `reserve` for a ticket,
 * `getUploadPoint` for a signed URL, then `uploadFile` three times against that
 * URL — metadata XML, then the poster frame, then the video.
 */

import { jsonPassthrough } from "../../core/envelope.js";
import type { MetamojiContext } from "../../core/http.js";
import { optionalPart, type MultipartPart } from "../../core/multipart.js";
import type { Result } from "../../core/result.js";
import type { JsonRecord } from "../../core/types.js";
import type {
  ClipCountResponse,
  ListClipsOptions,
  ReserveResponse,
  ServerStatusResponse,
  UploadFileOptions,
  UploadPointResponse,
  VfClipInfo,
  VideoAuthOptions,
} from "./interfaces.js";

export class VideoNotes {
  constructor(private readonly ctx: MetamojiContext) {}

  /**
   * Lists clips. The response is a bare JSON array, not an object.
   * `NwServerAccessor.getClipList` — `POST {flora}/flora/api/v1/getlist2`.
   */
  async list(options: ListClipsOptions = {}): Promise<Result<VfClipInfo[]>> {
    return this.command<VfClipInfo[]>("getlist", options, {
      off: options.offset,
      c: options.limit,
      order: options.order,
      dir: options.orderDir,
      filter: options.keyword,
      fu: options.fu,
      type: "MOVIE",
    });
  }

  /**
   * How many clips the server holds for this user.
   * `NwServerAccessor.getClipCount` — `POST {flora}/flora/api/v1/getclipcount2`.
   */
  async count(options: VideoAuthOptions & { fu?: string } = {}): Promise<Result<ClipCountResponse>> {
    return this.command<ClipCountResponse>("getclipcount", options, {
      fu: options.fu,
      type: "MOVIE",
    });
  }

  /**
   * One clip's details.
   * `NwServerAccessor.getClipInfo` — `POST {flora}/flora/api/v1/getclipinfo2`.
   */
  async get(serverId: string, options: VideoAuthOptions = {}): Promise<Result<VfClipInfo>> {
    return this.command<VfClipInfo>("getclipinfo", options, undefined, [
      { name: "serverId", value: serverId },
    ]);
  }

  /**
   * A clip's poster frame (its thumbnail).
   * `NwServerAccessor.getPosterFrame` — `POST {flora}/flora/api/v1/getposterframe2`.
   */
  async getPosterFrame(
    serverId: string,
    options: VideoAuthOptions = {},
  ): Promise<Result<JsonRecord>> {
    return this.command<JsonRecord>("getposterframe", options, undefined, [
      { name: "serverId", value: serverId },
    ]);
  }

  /**
   * Deletes a clip.
   * `NwServerAccessor.deleteClip` — `POST {flora}/flora/api/v1/deleteclip2`.
   */
  async remove(serverId: string, options: VideoAuthOptions = {}): Promise<Result<JsonRecord>> {
    return this.command<JsonRecord>("deleteclip", options, undefined, [
      { name: "serverId", value: serverId },
    ]);
  }

  /**
   * Export information for a clip. What the app does with it is not recovered;
   * writing it out to a drive is the likely purpose.
   * `NwServerAccessor.exportClip` — `POST {flora}/flora/api/v1/exportclipinfo2`.
   */
  async exportClip(serverId: string, options: VideoAuthOptions = {}): Promise<Result<JsonRecord>> {
    return this.command<JsonRecord>("exportclipinfo", options, undefined, [
      { name: "serverId", value: serverId },
    ]);
  }

  /**
   * The organisation's usage of the video service.
   * `NwServerAccessor.getServerCoInfo` — `POST {flora}/flora/api/v1/getcoinfo2`.
   */
  async getCompanyInfo(options: VideoAuthOptions = {}): Promise<Result<JsonRecord>> {
    return this.command<JsonRecord>("getcoinfo", options);
  }

  /**
   * Server health and the upload size limit. Worth checking before a long
   * recording — `max_filesize_mb` is the server's own ceiling.
   * `NwServerAccessor.getServerStatus` — `POST {flora}/flora/api/v1/getserverstatus2`.
   */
  async getServerStatus(options: VideoAuthOptions = {}): Promise<Result<ServerStatusResponse>> {
    return this.command<ServerStatusResponse>("getserverstatus", options);
  }

  /**
   * A signed URL to upload to. Step two of the upload sequence.
   * `NwServerAccessor.getUploadPoint` — `POST {flora}/flora/api/v1/getuploadpoint2`.
   */
  async getUploadPoint(options: VideoAuthOptions = {}): Promise<Result<UploadPointResponse>> {
    return this.command<UploadPointResponse>("getuploadpoint", options, { type: "MOVIE" });
  }

  /**
   * Reserves a ticket for a new clip. Step one of the upload sequence.
   * `NwServerAccessor.reserve` — `POST {flora}/flora/api/v1/reserve2`.
   */
  async reserve(options: VideoAuthOptions = {}): Promise<Result<ReserveResponse>> {
    return this.command<ReserveResponse>("reserve", options);
  }

  /**
   * Uploads one part of a clip to the signed URL from `getUploadPoint`. Not a
   * Flora command — it posts straight to that URL, with the ticket in a header.
   * `NwUpload.uploadFile`.
   *
   * Call it three times per clip, in order: the metadata XML, the poster frame
   * JPEG, then the video itself. A successful reply has `status: "OK"`.
   */
  async uploadFile(options: UploadFileOptions): Promise<Result<JsonRecord>> {
    const body = options.data instanceof Uint8Array
      ? options.data
      : new Uint8Array(options.data);

    return jsonPassthrough(
      await this.ctx.request({
        base: "absolute",
        path: options.uploadUrl,
        method: "POST",
        headerSet: "none",
        scope: "flora",
        headers: {
          "mmj.ms.ticket": options.ticket,
          "mmj.ms.coid": options.companyId ?? this.ctx.session.companyId ?? "",
          "mmj.ms.userid": options.userId ?? this.ctx.session.userId ?? "",
        },
        raw: { body, contentType: options.contentType },
      }),
    );
  }

  private async command<T>(
    command: string,
    options: VideoAuthOptions,
    query?: Record<string, string | number | undefined>,
    extraParts: MultipartPart[] = [],
  ): Promise<Result<T>> {
    return jsonPassthrough<T>(
      await this.ctx.request({
        base: "flora",
        path: `flora/api/v1/${command}2`,
        method: "POST",
        headerSet: "none",
        scope: "flora",
        query,
        multipart: [...this.authParts(options), ...extraParts],
      }),
    );
  }

  /** The login parts every Flora command carries (`setAuthData`). */
  private authParts(options: VideoAuthOptions): MultipartPart[] {
    const c = this.ctx.config;
    const s = this.ctx.session;
    const parts: MultipartPart[] = [
      { name: "loginUser", value: options.loginUser ?? s.loginName ?? s.email ?? s.userId ?? "" },
      { name: "loginCompany", value: options.loginCompany ?? s.coLoginId ?? s.companyName ?? "" },
    ];
    optionalPart(parts, "password", options.password ?? s.password);
    optionalPart(parts, "qwd", options.qwd ?? s.qwd);
    parts.push(
      { name: "userId", value: options.userId ?? s.userId ?? "" },
      { name: "companyId", value: options.companyId ?? s.companyId ?? "" },
      { name: "productName", value: c.productName },
      { name: "productVersion", value: options.productVersion ?? c.productVersion },
      { name: "rootServer", value: options.rootServer ?? c.rootServer },
    );
    return parts;
  }
}
