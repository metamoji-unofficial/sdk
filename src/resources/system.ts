/**
 * Maintenance notices and log upload (`system/misc.tsp`).
 *
 * All three go to the bootstrap root server rather than the tenant host, and
 * all three are odd in some way: the maintenance notice is a static text file
 * behind a JSON-shaped API, and the crash-log upload is a **GET** carrying the
 * log in its body. That is not a documentation slip — `CsCloudService` builds a
 * body for every verb. The second, unrelated crash-log endpoint is under
 * `distribute.postCrashLogs`.
 */

import { csEnvelope } from "../core/envelope.js";
import type { MetamojiContext } from "../core/http.js";
import { fail, ok, type Result } from "../core/result.js";
import type { CsRequestBase, CsResponseBase } from "../core/types.js";

export interface MaintenanceInfo extends CsResponseBase {
  /** The notice text, verbatim. The response is text, not JSON. */
  maintMessage?: string;
  isUnderMaintenance?: boolean;
}

export interface AddApiLogOptions extends CsRequestBase {
  logList?: unknown[];
}

export interface PostCrashLogsOptions extends CsRequestBase {
  companyId?: string;
  /** The log itself, as a string. The app sends a file's contents here. */
  fileEntity?: string;
  keyword?: string;
  userId?: string;
}

export class System {
  constructor(private readonly ctx: MetamojiContext) {}

  /**
   * Fetches the maintenance notice from the root server (or from
   * `maintCheckURL`, when the login response named a tenant-specific one).
   * `executeGetMaitenanceInfoWitParams` — `GET {root}/maintenance2_common.txt`.
   *
   * The response is plain text, so a non-empty body is the notice and an empty
   * one means no maintenance is scheduled.
   */
  async getMaintenanceInfo(options: CsRequestBase = {}): Promise<Result<MaintenanceInfo>> {
    const override = this.ctx.config.maintenanceUrl;
    const result = await this.ctx.request({
      ...(override
        ? { base: "absolute" as const, path: override }
        : { base: "root" as const, path: "maintenance2_common.txt" }),
      method: "GET",
      json: this.ctx.csBody(options),
      parse: "auto",
    });
    if (result.error) return fail(result.error);

    // A JSON body would be a real error envelope; text is the notice itself.
    if (result.data.json !== undefined) return csEnvelope<MaintenanceInfo>(result);
    const text = result.data.text?.trim() ?? "";
    return ok({
      httpStatusCode: result.data.status,
      isUnderMaintenance: text.length > 0,
      maintMessage: text || undefined,
    });
  }

  /**
   * Uploads a batch of client operation logs.
   * `executeAddApiLogWithParams` — `POST {rest}/users3/apilog/register`.
   */
  async addApiLog(options: AddApiLogOptions): Promise<Result<CsResponseBase>> {
    return csEnvelope(
      await this.ctx.request({
        base: "rest",
        path: "users3/apilog/register",
        method: "POST",
        json: this.ctx.csBody(options),
      }),
    );
  }

  /**
   * Uploads a crash log to the root server. A GET with a body, as the app sends
   * it. For the multipart variant see `distribute.postCrashLogs`.
   * `executePostCrashLogsWithParams` — `GET {root}/mpsroot/crashlog/upload`.
   */
  async postCrashLogs(options: PostCrashLogsOptions): Promise<Result<CsResponseBase>> {
    return csEnvelope(
      await this.ctx.request({
        base: "root",
        path: "mpsroot/crashlog/upload",
        method: "GET",
        json: this.ctx.csBody({
          userId: this.ctx.session.userId,
          companyId: this.ctx.session.companyId,
          ...options,
        }),
      }),
    );
  }
}
