/**
 * Request and response types for the REST sync data plane (`drive/sync-drive.tsp`).
 *
 * Separated from the calls that use them; the resource is `./sync.ts`.
 */

import type { JsonRecord } from "../../core/types.js";

/** Every sync response carries these (`SdResponseResult`). */
export interface SdResponseBase {
  /** 0 is success. `0x2af9` is "not logged in", `0x2afa` a revision conflict. */
  errorCode?: number;
  errorName?: string;
  errorMessage?: string;
  errorData?: JsonRecord;
  bodyMessage?: JsonRecord;
  httpStatusCode?: number;
  isUnderMaintenance?: boolean;
  maintMessage?: string;
}

/** Options accepted by every call: which drive host to talk to. */
export interface SyncScope {
  /** Overrides the client's `homeDir` for this call. */
  homeDir?: string;
}

export interface SyncLoginOptions extends SyncScope {
  userId?: string;
  password?: string;
  qwd?: string;
}

export interface SyncLoginResponse extends SdResponseBase {
  userId?: string;
}

export interface SyncStartResponse extends SdResponseBase {
  driveId?: string;
  entryType?: number;
}

export interface DriveLastUpdateRevisionResponse extends SdResponseBase {
  driveId?: string;
  lastUpdateRevision?: string;
}

export interface DrivePropertiesResponse extends SdResponseBase {
  driveId?: string;
  /** Bytes used, as a string. The unit is server-defined and unverified. */
  amountUsed?: string;
}

export interface PutDriveDataResponse extends SdResponseBase {
  driveId?: string;
  revision?: string;
}

export interface DocumentMetaResponse extends SdResponseBase {
  documentId?: string;
  driveId?: string;
  meta?: JsonRecord;
}

export interface PutDocumentDataResponse extends SdResponseBase {
  documentId?: string;
  driveId?: string;
  revision?: string;
  /** Whether the server treated the upload as coming from a v2 client. */
  registeredFromV2?: boolean;
}

export interface DeleteDocumentDataResponse extends SdResponseBase {
  documentId?: string;
  driveId?: string;
}

export interface TurnOnEditFlagOptions extends SyncScope {
  locationId?: string;
  contentsRevision?: string;
  /** Takes the flag even when someone else holds it. */
  force?: boolean;
}

export interface TurnOnEditFlagResponse extends SdResponseBase {
  userId?: string;
  locationId?: string;
  editFlag?: boolean;
  hasEditFlag?: boolean;
}

export interface TurnOffEditFlagOptions extends SyncScope {
  locationId?: string;
  contentsRevision?: string;
  /** Releases every flag the user holds, not just this document's. */
  isAll?: boolean;
}

export interface GetDocumentDataOptions extends SyncScope {
  revision?: string;
  /**
   * Adds `caching=1`. The app sets it when no user is signed in; left unset it
   * follows that rule using the client's own session.
   */
  caching?: boolean;
}

export interface PutDocumentDataOptions extends SyncScope {
  /** Concurrency check token. */
  check?: string;
  /** Marks the upload as coming from a v2 client. */
  fromV2?: boolean;
}

export interface DeleteDocumentDataOptions extends SyncScope {
  check?: string;
  /** Update time. A `Date` is converted to the epoch milliseconds the app sends. */
  update?: string | number | Date;
}
