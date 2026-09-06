/**
 * Request and response types for direct messages (`messaging/messaging.tsp`).
 *
 * Separated from the calls that use them; the resource is `./messages.ts`.
 */

import type { CsResponseBase } from "../../core/types.js";

export interface DirectMessageResponse extends CsResponseBase {
  message?: string;
}
