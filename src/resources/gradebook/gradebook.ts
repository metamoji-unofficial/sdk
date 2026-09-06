/**
 * Test logs and marks (`classroom/gradebook.tsp`).
 *
 * `com.metamoji.forSchool.service` extends the room connection classes, so the
 * wire format is the same: a POST with a multipart body and an `authInfo` part.
 * The one difference is that everything else goes in a single `param` part
 * rather than being split across several.
 *
 * `ScCollaboURLConnectionForUpdateDeadlineInfo` is not here, deliberately: it
 * posts to `cosmos/UpdateRoomInfo`, which is `rooms.update()` / `rooms.updateMode()`.
 * Its deadline keys (`validFlag`, `startTime`, `beforeMode2`, ...) can be passed
 * through `NsRoomInfo`, which allows extra keys for exactly that reason.
 */

import { jsonPassthrough } from "../../core/envelope.js";
import type { MetamojiContext } from "../../core/http.js";
import { jsonPart, type MultipartPart } from "../../core/multipart.js";
import type { Result } from "../../core/result.js";
import type { JsonRecord } from "../../core/types.js";
import type { RoomAuthOptions } from "../rooms/interfaces.js";
import type { Rooms } from "../rooms/rooms.js";
import type {
  GetScoreListOptions,
  GetTestingLogListOptions,
  SetReportOptions,
  SetScoreOptions,
} from "./interfaces.js";

export class Gradebook {
  constructor(
    private readonly ctx: MetamojiContext,
    private readonly rooms: Rooms,
  ) {}

  /**
   * Marks for the given rooms.
   * `ScCollaboURLConnectionForGetScoreList` — `POST {dc}/cosmos/GetScoreList`.
   */
  async getScores(options: GetScoreListOptions): Promise<Result<JsonRecord>> {
    return this.post("cosmos/GetScoreList", options, {
      roomIdList: options.roomIdList,
      needLog: options.needLog ?? false,
    });
  }

  /**
   * The log of test attempts in a room.
   * `ScCollaboURLConnectionForGetTestingLogList` — `POST {dc}/cosmos/GetTestingLogList`.
   */
  async getTestingLog(options: GetTestingLogListOptions): Promise<Result<JsonRecord>> {
    return this.post("cosmos/GetTestingLogList", options, { roomID: options.roomID });
  }

  /**
   * Records whether a pupil has handed their report in.
   * `ScCollaboURLConnectionForSetReport` — `POST {dc}/cosmos/SetReport`.
   */
  async setReport(options: SetReportOptions): Promise<Result<JsonRecord>> {
    return this.post("cosmos/SetReport", options, {
      roomID: options.roomID,
      userID: options.userID,
      report: options.report,
    });
  }

  /**
   * Sets a pupil's mark, or clears it.
   * `ScCollaboURLConnectionForSetScore` — `POST {dc}/cosmos/SetScore`.
   */
  async setScore(options: SetScoreOptions): Promise<Result<JsonRecord>> {
    const param: JsonRecord = {
      roomID: options.roomID,
      userID: options.userID,
      score: options.score,
    };
    if (options.clearScore) param.scoreString = base64("ClearScore");
    return this.post("cosmos/SetScore", options, param);
  }

  private async post(
    path: string,
    options: RoomAuthOptions,
    param: JsonRecord,
  ): Promise<Result<JsonRecord>> {
    const parts: MultipartPart[] = [
      jsonPart("authInfo", this.rooms.authInfo(options.authInfo)),
      jsonPart("param", param),
    ];
    return jsonPassthrough(
      await this.ctx.request({
        base: "dc",
        path,
        method: "POST",
        headerSet: "none",
        scope: "collabo",
        multipart: parts,
      }),
    );
  }
}

function base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  if (typeof btoa === "function") {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }
  return Buffer.from(bytes).toString("base64");
}
