/**
 * Request and response types for class distribution and crash logs (`classroom/distribute.tsp`).
 *
 * Separated from the calls that use them; the resource is `./distribute.ts`.
 */

import type { FileUpload } from "../../core/types.js";

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
