/**
 * User and organisation information (`auth/user.tsp`).
 *
 * `get` and `getWithSystemInfo` are GET requests that carry a JSON body — see
 * `core/transport.ts` for why that needs `node:http`.
 */

import { csEnvelope } from "../core/envelope.js";
import type { MetamojiContext } from "../core/http.js";
import type { Result } from "../core/result.js";
import type { CsRequestBase, CsResponseBase, JsonRecord } from "../core/types.js";

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

export class Users {
  constructor(private readonly ctx: MetamojiContext) {}

  /**
   * The signed-in user's profile. Also the source of `appAuthKey` and the
   * WebDAV home collection.
   * `executeGetUserInfoWithParams` — `GET {rest}/users2/login/user`.
   */
  async get(options: CsRequestBase = {}): Promise<Result<UserInfo>> {
    const result = csEnvelope<UserInfo>(
      await this.ctx.request({
        base: "rest",
        path: "users2/login/user",
        method: "GET",
        json: this.ctx.csBody(options),
      }),
    );
    if (result.data?.appAuthKey) this.ctx.setSession({ appAuthKey: result.data.appAuthKey });
    return result;
  }

  /**
   * Updates the signed-in user's locale and time zone.
   * `executeUpdateUserInfoWithParams` — `PUT {rest}/users2/login/user`.
   */
  async update(options: UpdateUserOptions): Promise<Result<CsResponseBase>> {
    return csEnvelope(
      await this.ctx.request({
        base: "rest",
        path: "users2/login/user",
        method: "PUT",
        json: this.ctx.csBody(options),
      }),
    );
  }

  /**
   * Profile plus system information — licence state, service settings, server
   * time — in one call.
   * `executeGetUserAndSystemInfo2WithParams` — `GET {rest}/system2/user2`.
   */
  async getWithSystemInfo(options: CsRequestBase = {}): Promise<Result<UserAndSystemInfo>> {
    return csEnvelope(
      await this.ctx.request({
        base: "rest",
        path: "system2/user2",
        method: "GET",
        json: this.ctx.csBody(options),
      }),
    );
  }

  /**
   * Every user in the organisation.
   * `executeGetAllUsersWithParams` — `POST {rest}/users3/getallusers`.
   */
  async list(options: ListUsersOptions = {}): Promise<Result<ListUsersResponse>> {
    return csEnvelope(
      await this.ctx.request({
        base: "rest",
        path: "users3/getallusers",
        method: "POST",
        json: this.ctx.csBody(options),
      }),
    );
  }

  /**
   * Every group in the organisation.
   * `executeGetAllGroupsWithParams` — `POST {rest}/users3/getallgroups`.
   */
  async listGroups(options: CsRequestBase = {}): Promise<Result<ListGroupsResponse>> {
    return csEnvelope(
      await this.ctx.request({
        base: "rest",
        path: "users3/getallgroups",
        method: "POST",
        json: this.ctx.csBody(options),
      }),
    );
  }

  /**
   * Resolves user ids to display names in bulk.
   * `executeGetUserNamesWithParams` — `POST {rest}/users3/login/company/usernames`.
   */
  async resolveNames(options: ResolveNamesOptions): Promise<Result<ResolveNamesResponse>> {
    return csEnvelope(
      await this.ctx.request({
        base: "rest",
        path: "users3/login/company/usernames",
        method: "POST",
        json: this.ctx.csBody(options),
      }),
    );
  }
}
