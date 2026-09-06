/**
 * Class distribution and crash logs (`classroom/distribute.tsp`).
 *
 * `DvmCloudService` is how a teacher pushes a note out to a class: the note is
 * registered as a conversion job with a distribution window and a set of modes
 * governing what pupils may do before, during and after it.
 *
 * The crash-log upload here is the *second* of two. This one is a multipart
 * POST to `{root}/crashlogs/upload`; the other is `system.postCrashLogs()`, a
 * GET to `{root}/mpsroot/crashlog/upload`. They are different implementations
 * of the same idea and both exist in the app.
 */

import { dvmEnvelope } from "../../core/envelope.js";
import type { MetamojiContext } from "../../core/http.js";
import { filePart, jsonPart, optionalPart, type MultipartPart } from "../../core/multipart.js";
import type { Result } from "../../core/result.js";
import type {
  DistributeClassOptions,
  DvmAuthInfo,
  DvmResultBase,
  GetDistributeStatusOptions,
  GetDistributeStatusResponse,
  UploadCrashLogOptions,
  UploadCrashLogResponse,
} from "./interfaces.js";

export class Distribute {
  constructor(private readonly ctx: MetamojiContext) {}

  /**
   * Registers a conversion job and distributes the notes to a class.
   * `executeDistributeClassWithParams` / `executeDistributeMultipleNotesWithParams` —
   * `POST {rest}/convert/DistributeClass`.
   */
  async distributeClass(options: DistributeClassOptions): Promise<Result<DvmResultBase>> {
    const parts: MultipartPart[] = [
      jsonPart("authInfo", this.authInfo(options.authInfo)),
      jsonPart("convertParam", { fileSetList: options.fileSetList }),
    ];
    if (options.fileEntity) parts.push(filePart("fileEntity", options.fileEntity));

    return dvmEnvelope(
      await this.ctx.request({
        base: "rest",
        path: "convert/DistributeClass",
        method: "POST",
        headerSet: "none",
        multipart: parts,
      }),
    );
  }

  /**
   * Lists distribution jobs and their state. Unlike its neighbours this one
   * sends a plain JSON body, not multipart.
   * `executeGetDistributeStatusWithParams` — `POST {rest}/convert/GetDistributeStatus`.
   */
  async getStatus(
    options: GetDistributeStatusOptions = {},
  ): Promise<Result<GetDistributeStatusResponse>> {
    return dvmEnvelope(
      await this.ctx.request({
        base: "rest",
        path: "convert/GetDistributeStatus",
        method: "POST",
        headerSet: "none",
        json: {
          authInfo: this.authInfo(options.authInfo),
          offset: options.offset ?? 0,
          limit: options.limit ?? 100,
        },
      }),
    );
  }

  /**
   * Uploads a crash log to the root server as multipart.
   * `DvmCloudService.executePostCrashLogsWithParams` — `POST {root}/crashlogs/upload`.
   */
  async postCrashLogs(options: UploadCrashLogOptions): Promise<Result<UploadCrashLogResponse>> {
    const c = this.ctx.config;
    const s = this.ctx.session;
    const parts: MultipartPart[] = [
      { name: "userId", value: options.userId ?? s.userId ?? "" },
      { name: "companyId", value: options.companyId ?? s.companyId ?? "" },
      { name: "deviceName", value: options.deviceName ?? c.deviceName },
      { name: "productName", value: options.productName ?? c.productName },
      { name: "productVersion", value: options.productVersion ?? c.productVersion },
      { name: "locale", value: options.locale ?? c.locale },
      { name: "timezone", value: options.timezone ?? c.timezone },
    ];
    optionalPart(parts, "keyword", options.keyword);
    parts.push(
      { name: "uploadMethod", value: options.uploadMethod ?? "Manual" },
      filePart("fileEntity", options.fileEntity, "text/plain"),
    );

    return dvmEnvelope(
      await this.ctx.request({
        base: "root",
        path: "crashlogs/upload",
        method: "POST",
        headerSet: "none",
        multipart: parts,
      }),
    );
  }

  /** The `authInfo` JSON part, from the client session. */
  authInfo(overrides: Partial<DvmAuthInfo> = {}): DvmAuthInfo {
    const c = this.ctx.config;
    const s = this.ctx.session;
    return {
      authType: "cabinet",
      companyLoginName: overrides.companyLoginName ?? s.coLoginId,
      companyId: overrides.companyId ?? s.companyId,
      loginName: overrides.loginName ?? s.loginName ?? s.email,
      userId: overrides.userId ?? s.userId,
      password: overrides.password ?? s.password,
      qwd: overrides.qwd ?? s.qwd,
      productName: overrides.productName ?? c.productName,
      productVersion: overrides.productVersion ?? c.productVersion,
      locale: overrides.locale ?? c.locale,
    };
  }
}
