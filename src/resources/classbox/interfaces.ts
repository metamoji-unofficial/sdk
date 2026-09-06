/**
 * Request and response types for class boxes (`classroom/classbox.tsp`).
 *
 * Separated from the calls that use them; the resource is `./classbox.ts`.
 */

import type { CsClassBoxJoinStatus, CsRequestBase, CsResponseBase } from "../../core/types.js";

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
