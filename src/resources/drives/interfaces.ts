/**
 * Request and response types for drives, membership and share links (`drive/drive.tsp`).
 *
 * Separated from the calls that use them; the resource is `./drives.ts`.
 */

import type { CsRequestBase, CsResponseBase, JsonRecord } from "../../core/types.js";

export interface CreateDriveOptions extends CsRequestBase {
  driveName?: string;
}

export interface CreateDriveResponse extends CsResponseBase {
  driveId?: string;
}

export interface RenameDriveOptions extends CsRequestBase {
  driveId?: string;
  driveName?: string;
}

export interface DriveHomeResponse extends CsResponseBase {
  /** Base URL for this drive's data plane — `sync`'s `homeDir`. */
  homeDir?: string;
  /** Absolute URL of the maintenance text for this drive's host. */
  maintenanceText?: string;
}

export interface PrivateDriveHomeResponse extends DriveHomeResponse {
  driveId?: string;
  userId?: string;
}

export interface DriveEntryResponse extends CsResponseBase {
  list?: JsonRecord[];
  uid?: string;
}

export interface DriveEntryInfoResponse extends DriveEntryResponse {
  /** Entry id to URI map. */
  urimap?: JsonRecord;
}

export interface UpdateEntryHiddenOptions extends CsRequestBase {
  entryList?: JsonRecord[];
}

export interface ListMembersOptions extends CsRequestBase {
  driveId?: string;
  isClassMember?: boolean;
  isGet?: boolean;
}

export interface ListMembersResponse extends CsResponseBase {
  list?: JsonRecord[];
}

export interface InviteOptions extends CsRequestBase {
  driveId?: string;
  emailList?: JsonRecord[];
  message?: string;
  userIdList?: JsonRecord[];
}

export interface InviteResponse extends CsResponseBase {
  isAlreadyMember?: boolean;
}

export interface ReInviteOptions extends CsRequestBase {
  driveId?: string;
  message?: string;
}

export interface ExcludeMembersOptions extends CsRequestBase {
  driveId?: string;
  userList?: JsonRecord[];
}

export interface UpdateMemberTypeOptions extends CsRequestBase {
  driveId?: string;
  userList?: JsonRecord[];
}

export interface StorageUsageResponse extends CsResponseBase {
  amountUsage?: string;
}

export interface CreateLinkOptions extends CsRequestBase {
  docId?: string;
  driveId?: string;
  pageId?: string;
}

export interface CreateLinkResponse extends CsResponseBase {
  uri?: string;
}

export interface ReverseLinkOptions extends CsRequestBase {
  uri?: string;
}

export interface ReverseLinkResponse extends CsResponseBase {
  docId?: string;
  driveId?: string;
  pageId?: string;
}
