/**
 * Request and response types for live classroom rooms (`classroom/collabo.tsp`).
 *
 * Separated from the calls that use them; the resource is `./rooms.ts`.
 */

import type { FileUpload, JsonRecord } from "../../core/types.js";

/** Device and user credentials (`NsCollaboURLConnection.createAuthInfoParam`). */
export interface NsAuthInfo {
  deviceID?: string;
  deviceCode?: string;
  /** `cabinet` for a signed-in user, `guest` for an anonymous participant. */
  authType: "cabinet" | "guest";
  userID?: string;
  /** Only one of `userPassword` and `qwd` is ever sent. */
  userPassword?: string;
  qwd?: string;
  productName?: string;
  productVersion?: string;
  locale?: string;
  companyID?: string;
}

/** Per-role permission: may act, or may only watch. */
export type RolePermission = "FREE" | "READONLY";

/** A whole-room mode. `DELETE` closes the room. */
export type RoomMode = "FREE" | "READONLY" | "DELETE";

export interface NsRoomRolePermissions {
  presenter?: RolePermission | RoomMode;
  speaker?: RolePermission | RoomMode;
  visitor?: RolePermission | RoomMode;
}

/**
 * Room settings, shared by `create`, `update`, `updateMode` and
 * `updateTitleDate`; each uses a different subset.
 *
 * The index signature is deliberate: `ScCollaboURLConnectionForUpdateDeadlineInfo`
 * sends a completely different key set (`validFlag`, `startTime`, `endTime`,
 * `beforeMode2` and the rest — see `classroom/gradebook.tsp`) through this same
 * part, and those keys have no recovered schema.
 */
export interface NsRoomInfo {
  ownerID?: string;
  title?: string;
  roomType?: "casual" | "formal" | "limited";
  secureRoom?: string;
  secureRoomPassword?: string;
  roomPassword2?: string;
  role?: NsRoomRolePermissions;
  /** Epoch milliseconds. */
  openDate?: number;
  [key: string]: unknown;
}

/** Credentials override, accepted by every room call. */
export interface RoomAuthOptions {
  authInfo?: Partial<NsAuthInfo>;
}

export interface CreateRoomOptions extends RoomAuthOptions {
  roomInfo: NsRoomInfo;
}

export interface LoginRoomOptions extends RoomAuthOptions {
  roomID: string;
  roomPassword2?: string;
  secureRoomPassword?: string;
  /** The device's LAN address, used to pair participants on the same network. */
  localIp?: string;
}

export interface ModifyRoleOptions extends RoomAuthOptions {
  roomID: string;
  addRole?: string;
  delRole?: string;
}

export interface GetMemberListOptions {
  /** The `{roomID, userID}` pairs to look up. */
  memberList: { roomID: string; userID: string }[];
  companyID?: string;
}

export interface UpdateRoomModeOptions extends RoomAuthOptions {
  /** Applied to all three roles at once, which is what this endpoint is for. */
  mode: RoomMode;
  /** Merged into the `roomInfo` part, for anything else that needs to go with it. */
  roomInfo?: NsRoomInfo;
  /** Sent as a bare form part when given, as the deadline variant does. */
  roomID?: string;
}

export interface UpdateRoomInfoOptions extends RoomAuthOptions {
  roomInfo: NsRoomInfo;
  secureRoomPassword?: string;
  roomID?: string;
}

export interface RoomIdListOptions extends RoomAuthOptions {
  roomIdList: string[];
}

export interface GetRoomSettingOptions extends RoomAuthOptions {
  roomId: string;
  /** Fixed `"#ClassRoom"` in the app; overridable in case another value exists. */
  key1?: string;
}

export interface UpdateRoomSettingOptions extends RoomAuthOptions {
  roomSettingList: unknown[];
}

export interface GetShareViewListOptions extends RoomAuthOptions {
  /** Filter, e.g. by publication window. */
  narrowCond?: JsonRecord;
  /** Restricts the search to these documents. */
  shareDocList?: unknown[];
  sortCond?: JsonRecord;
}

export interface ToolLoginOptions {
  email: string;
  password?: string;
  qwd?: string;
  companyID?: string;
  locale?: string;
  timezone?: string;
}

export interface PostGalleryOptions {
  roomId: string;
  title: string;
  text?: string;
  encryptedHash: string;
  /** The note page itself, as `application/vnd.metamoji.btshare`. */
  document: FileUpload;
  /** Its thumbnail, as JPEG. */
  image: FileUpload;
  timezone?: string;
  productName?: string;
  productVersion?: string;
}
