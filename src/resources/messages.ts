/**
 * Direct messages (`messaging/messaging.tsp`).
 *
 * A one-way channel: the server posts a message to a user and the client reads
 * it, then deletes it to mark it seen. Both calls send a JSON body on a verb
 * that normally has none — see `core/transport.ts`.
 */

import { csEnvelope } from "../core/envelope.js";
import type { MetamojiContext } from "../core/http.js";
import type { Result } from "../core/result.js";
import type { CsRequestBase, CsResponseBase } from "../core/types.js";

export interface DirectMessageResponse extends CsResponseBase {
  message?: string;
}

export class DirectMessages {
  constructor(private readonly ctx: MetamojiContext) {}

  /**
   * Reads the message waiting for the signed-in user.
   * `executeGetDirectMessageWithParams` — `GET {rest}/system2/user/directmessage2/`.
   */
  async get(options: CsRequestBase = {}): Promise<Result<DirectMessageResponse>> {
    return csEnvelope(
      await this.ctx.request({
        base: "rest",
        path: "system2/user/directmessage2/",
        method: "GET",
        json: this.ctx.csBody(options),
      }),
    );
  }

  /**
   * Deletes it, which is how the app marks it read. Note the path differs from
   * `get`'s by more than the verb: `directmessage/`, not `directmessage2/`.
   * `executeDeleteDirectMessageWithParams` — `DELETE {rest}/system2/user/directmessage/`.
   */
  async remove(options: CsRequestBase = {}): Promise<Result<CsResponseBase>> {
    return csEnvelope(
      await this.ctx.request({
        base: "rest",
        path: "system2/user/directmessage/",
        method: "DELETE",
        json: this.ctx.csBody(options),
      }),
    );
  }
}
