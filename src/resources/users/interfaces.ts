/**
 * Request and response types for user and organisation information (`auth/user.tsp`).
 *
 * Separated from the calls that use them; the resource is `./users.ts`.
 */

import type { CsRequestBase, CsResponseBase, JsonRecord } from "../../core/types.js";

export interface UserInfo extends CsResponseBase {
  /** Used as WebDAV's `X-mmj-appcode` header. */
  appAuthKey?: string;
  email?: string;
  /** The user's home collection URL — the WebDAV data plane's root. */
  homeDir?: string;
  isAdmin?: boolean;
  key?: number;
  locale?: string;
  name?: string;
  timezone?: string;
  userId?: string;
}

export interface UpdateUserOptions extends CsRequestBase {
  updateLocale?: string;
  updateTimezone?: string;
}

/**
 * The `systemInfo` half of `getWithSystemInfo`. The class name keeps the
 * misspelling from the Java source (`CsGetUserAndSystemInfoResopnse`); the
 * type is spelled correctly here.
 */
export interface SystemInfo extends CsResponseBase {
  currentGroupId?: string;
  dcplan?: string;
  hasCRLicense?: boolean;
  licenseInfo?: JsonRecord;
  readOnlyUser?: boolean;
  serverTime?: number;
  serviceSettings?: JsonRecord;
  userActionInfo?: JsonRecord;
  userTransfer?: string;
  userUsageDiskSpace?: string;
}

export interface UserAndSystemInfo extends CsResponseBase {
  systemInfo?: SystemInfo;
  userInfo?: UserInfo;
}

export interface ListUsersOptions extends CsRequestBase {
  group?: string;
  groupId?: string;
}

export interface ListUsersResponse extends CsResponseBase {
  users?: JsonRecord[];
}

export interface ListGroupsResponse extends CsResponseBase {
  groups?: JsonRecord[];
}

export interface ResolveNamesOptions extends CsRequestBase {
  userIds?: string[];
}

export interface ResolveNamesResponse extends CsResponseBase {
  users?: JsonRecord[];
}
