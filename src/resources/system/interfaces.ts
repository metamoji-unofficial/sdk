/**
 * Request and response types for maintenance notices and log upload (`system/misc.tsp`).
 *
 * Separated from the calls that use them; the resource is `./system.ts`.
 */

import type { CsRequestBase, CsResponseBase } from "../../core/types.js";

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
