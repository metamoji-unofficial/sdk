/**
 * Server-side client settings (`system/settings.tsp`).
 *
 * Two pairs of calls: key/value settings stored as JSON, and settings *files*,
 * where the server holds a URL and the bytes live wherever that points.
 */

import { csEnvelope } from "../core/envelope.js";
import type { MetamojiContext } from "../core/http.js";
import type { Result } from "../core/result.js";
import type { CsRequestBase, CsResponseBase, JsonRecord } from "../core/types.js";

export interface GetClientSettingsOptions extends CsRequestBase {
  /** Keys to read. */
  key?: string[];
}

export interface GetClientSettingsResponse extends CsResponseBase {
  keyValue?: JsonRecord;
}

export interface SetClientSettingsOptions extends CsRequestBase {
  keyValue?: JsonRecord;
}

export interface GetClientFileOptions extends CsRequestBase {
  key?: string;
}

export interface GetClientFileResponse extends CsResponseBase {
  /** Where the file actually is; fetch it separately. */
  url?: string;
}

export interface SetClientFileOptions extends CsRequestBase {
  key?: string;
  url?: string;
}

export class ClientSettings {
  constructor(private readonly ctx: MetamojiContext) {}

  /**
   * Reads stored settings.
   * `executeGetClientSettingsWithParams` — `POST {rest}/users2/login/getclientsettings`.
   */
  async get(options: GetClientSettingsOptions = {}): Promise<Result<GetClientSettingsResponse>> {
    return csEnvelope(
      await this.ctx.request({
        base: "rest",
        path: "users2/login/getclientsettings",
        method: "POST",
        json: this.ctx.csBody(options),
      }),
    );
  }

  /**
   * Writes settings.
   * `executeSetClientSettingsWithParams` — `POST {rest}/users2/login/setclientsettings`.
   */
  async set(options: SetClientSettingsOptions): Promise<Result<CsResponseBase>> {
    return csEnvelope(
      await this.ctx.request({
        base: "rest",
        path: "users2/login/setclientsettings",
        method: "POST",
        json: this.ctx.csBody(options),
      }),
    );
  }

  /**
   * Reads a stored settings file's location.
   * `executeGetClientFileWithParams` — `POST {rest}/users2/login/getclientfile`.
   */
  async getFile(options: GetClientFileOptions): Promise<Result<GetClientFileResponse>> {
    return csEnvelope(
      await this.ctx.request({
        base: "rest",
        path: "users2/login/getclientfile",
        method: "POST",
        json: this.ctx.csBody(options),
      }),
    );
  }

  /**
   * Records a settings file's location.
   * `executeSetClientFileWithParams` — `POST {rest}/users2/login/setclientfile`.
   */
  async setFile(options: SetClientFileOptions): Promise<Result<CsResponseBase>> {
    return csEnvelope(
      await this.ctx.request({
        base: "rest",
        path: "users2/login/setclientfile",
        method: "POST",
        json: this.ctx.csBody(options),
      }),
    );
  }
}
