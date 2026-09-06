/**
 * Request and response types for test logs and marks (`classroom/gradebook.tsp`).
 *
 * Separated from the calls that use them; the resource is `./gradebook.ts`.
 */

import type { RoomAuthOptions } from "../rooms/interfaces.js";

export interface GetScoreListOptions extends RoomAuthOptions {
  roomIdList: string[];
  /** Asks the server to record the query. Default false. */
  needLog?: boolean;
}

export interface GetTestingLogListOptions extends RoomAuthOptions {
  roomID: string;
}

export interface SetReportOptions extends RoomAuthOptions {
  roomID: string;
  userID: string;
  /** Submission status code. The meanings are not recovered. */
  report: number;
}

export interface SetScoreOptions extends RoomAuthOptions {
  roomID: string;
  userID: string;
  score: number;
  /**
   * Clears the mark instead of setting it. Sends the base64 of `"ClearScore"`
   * in `scoreString`, which is the signal the server looks for.
   */
  clearScore?: boolean;
}
