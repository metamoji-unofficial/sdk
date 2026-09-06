/**
 * Request and response types for server-side client settings (`system/settings.tsp`).
 *
 * Separated from the calls that use them; the resource is `./settings.ts`.
 */

import type { CsRequestBase, CsResponseBase, JsonRecord } from "../../core/types.js";

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
