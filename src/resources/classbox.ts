/**
 * Class boxes — the online classroom container (`classroom/classbox.tsp`).
 *
 * A class box is a drive with a join code attached: creating one returns both
 * `groupId` and the `driveId` its notes live in, so anything under `drives.*`
 * works against it afterwards.
 */

import { csEnvelope } from "../core/envelope.js";
import type { MetamojiContext } from "../core/http.js";
import type { Result } from "../core/result.js";
import type { CsClassBoxJoinStatus, CsRequestBase, CsResponseBase } from "../core/types.js";

export interface CreateClassBoxOptions extends CsRequestBase {
  groupName?: string;
}

export interface CreateClassBoxResponse extends CsResponseBase {
  driveId?: string;
  groupId?: string;
}

export interface JoinClassBoxOptions extends CsRequestBase {
  joinCode?: string;
}

export interface JoinClassBoxResponse extends CsResponseBase {
  driveId?: string;
}

export interface UpdateClassBoxOptions extends CsRequestBase {
  driveId?: string;
  /** `NO_VALUE` leaves the current setting alone. */
  joinEnabled?: CsClassBoxJoinStatus;
  name?: string;
}

export interface GetClassCodeOptions extends CsRequestBase {
  driveId?: string;
  /** Rotates the code, invalidating the previous one. */
  updateJoinCode?: boolean;
}

export interface GetClassCodeResponse extends CsResponseBase {
  joinCode?: string;
  joinEnabled?: boolean;
}

export class ClassBoxes {
  constructor(private readonly ctx: MetamojiContext) {}

  /**
   * Creates a class box.
   * `executeCreateClassBoxWithParams` — `POST {rest}/users3/crbox/create`.
   */
  async create(options: CreateClassBoxOptions): Promise<Result<CreateClassBoxResponse>> {
    return csEnvelope(
      await this.ctx.request({
        base: "rest",
        path: "users3/crbox/create",
        method: "POST",
        json: this.ctx.csBody(options),
      }),
    );
  }

  /**
   * Joins a class box with its code.
   * `executeJoinClassBoxWithParams` — `POST {rest}/users3/crbox/join`.
   */
  async join(options: JoinClassBoxOptions): Promise<Result<JoinClassBoxResponse>> {
    return csEnvelope(
      await this.ctx.request({
        base: "rest",
        path: "users3/crbox/join",
        method: "POST",
        json: this.ctx.csBody(options),
      }),
    );
  }

  /**
   * Renames a class box or opens/closes it to new members.
   * `executeUpdateClassBoxInfoWithParams` — `POST {rest}/users3/crbox/update`.
   */
  async update(options: UpdateClassBoxOptions): Promise<Result<CsResponseBase>> {
    return csEnvelope(
      await this.ctx.request({
        base: "rest",
        path: "users3/crbox/update",
        method: "POST",
        json: this.ctx.csBody(options),
      }),
    );
  }

  /**
   * Reads the join code, optionally issuing a fresh one.
   * `executeGetClassCodeWithParams` — `POST {rest}/users3/crbox/get/joincode`.
   */
  async getJoinCode(options: GetClassCodeOptions): Promise<Result<GetClassCodeResponse>> {
    return csEnvelope(
      await this.ctx.request({
        base: "rest",
        path: "users3/crbox/get/joincode",
        method: "POST",
        json: this.ctx.csBody(options),
      }),
    );
  }
}
