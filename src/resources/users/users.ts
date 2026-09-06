/**
 * User and organisation information (`auth/user.tsp`).
 *
 * `get` and `getWithSystemInfo` are GET requests that carry a JSON body — see
 * `core/transport.ts` for why that needs `node:http`.
 */

import { csEnvelope } from "../../core/envelope.js";
import type { MetamojiContext } from "../../core/http.js";
import type { Result } from "../../core/result.js";
import type { CsRequestBase, CsResponseBase } from "../../core/types.js";
import type {
  ListGroupsResponse,
  ListUsersOptions,
  ListUsersResponse,
  ResolveNamesOptions,
  ResolveNamesResponse,
  UpdateUserOptions,
  UserAndSystemInfo,
  UserInfo,
} from "./interfaces.js";

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
