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

import { dvmEnvelope } from "../core/envelope.js";
import type { MetamojiContext } from "../core/http.js";
import { filePart, jsonPart, optionalPart, type MultipartPart } from "../core/multipart.js";
import type { Result } from "../core/result.js";
import type { FileUpload } from "../core/types.js";

/** Credentials embedded as a JSON part (`prepareAuthInfoWithUserInfo`). */
export interface DvmAuthInfo {
  /** Always `"cabinet"`. */
  authType: "cabinet";
  /** The organisation's login id. */
  companyLoginName?: string;
  companyId?: string;
  loginName?: string;
  userId?: string;
  password?: string;
  qwd?: string;
  productName?: string;
  productVersion?: string;
  locale?: string;
}

/** Every `Dvm*` response (`DvmResultBase`). */
export interface DvmResultBase {
  /** 0 is success. */
  errorCode?: number;
  errorMessage?: string;
  /** An application-defined code that mirrors an HTTP status. */
  responseCode?: number;
}

/** One note in a distribution job (`DvmDistributeClassParams`). */
export interface DvmFileSetItem {
  title?: string;
  /** Epoch milliseconds. */
  openDate?: number;
  /** Defaults server-side to the user's private drive when omitted. */
  orgDriveId?: string;
  orgDocumentId?: string;
  secureRoom?: string;
  secureRoomPassword?: string;
  validFlag?: number;
  /** Epoch milliseconds. */
  startTime?: number;
  /** Epoch milliseconds. */
  endTime?: number;
  /** What pupils may do before the window opens. */
  beforeMode2?: number;
  /** What they may do during it. */
  testingMode2?: number;
  /** What they may do after it closes. */
  afterMode2?: number;
  reportMode2?: number;
  endReportMode2?: number;
  remandMode2?: number;
  lockMode2?: number;
  settingList?: unknown[];
  driveInfoList?: unknown[];
}

export interface DistributeClassOptions {
  /** One entry per note. The same call distributes one or many. */
  fileSetList: DvmFileSetItem[];
  /**
   * The note archive. The app builds it with
   * `DvmUtil.makeDocumentArchiveFile(driveId, docId)` and skips the request
   * entirely if a single-note archive cannot be built.
   */
  fileEntity?: FileUpload;
  authInfo?: Partial<DvmAuthInfo>;
}

export interface GetDistributeStatusOptions {
  offset?: number;
  limit?: number;
  authInfo?: Partial<DvmAuthInfo>;
}

export interface GetDistributeStatusResponse extends DvmResultBase {
  statusList?: unknown[];
}

export interface UploadCrashLogOptions {
  /** The log file. */
  fileEntity: FileUpload;
  /** `"Manual"` when the user chose to send it, `"Auto"` on a crash. */
  uploadMethod?: "Manual" | "Auto";
  keyword?: string;
  userId?: string;
  companyId?: string;
  deviceName?: string;
  productName?: string;
  productVersion?: string;
  locale?: string;
  timezone?: string;
}

export interface UploadCrashLogResponse extends DvmResultBase {
  result?: { logId?: string; requestDate?: string };
}

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
