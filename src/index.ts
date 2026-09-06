/**
 * metamoji-api — a TypeScript client for the MetaMoji ClassShare cloud API.
 *
 * Built from `docs/typespec`, itself reconstructed by reverse-engineering
 * `com.metamoji.share_classroom` 3.15.1.0. Unofficial, and not a MetaMoji
 * specification: some of it is inferred, and none of it is guaranteed to match
 * a live server.
 */

export { Metamoji } from "./client.js";
export { newDeviceCode } from "./resources/rooms/rooms.js";

export type {
  BaseTarget,
  MetamojiConfig,
  MetamojiSession,
} from "./core/config.js";
export {
  DEFAULT_CDN_SERVER,
  DEFAULT_LICENSE_SERVER,
  DEFAULT_MAZEC_CDN_SERVER,
  DEFAULT_ROOT_SERVER,
  LICENSE_PRODUCT_ID,
  LICENSE_TEST_SERVER,
  PRODUCT_NAME,
  PRODUCT_VERSION,
} from "./core/config.js";

export type { ClientErrorName, MetamojiError, Result } from "./core/result.js";
export type { SessionScope } from "./core/cookies.js";
export type {
  FetchLike,
  Transport,
  TransportRequest,
  TransportResponse,
} from "./core/transport.js";
export { createFetchTransport, createNodeTransport } from "./core/transport.js";

export {
  GALLERY_DELETE_ALREADY_GONE,
  SD_NOT_LOGIN,
  SD_REVISION_CONFLICT,
  STORE_LOGIN_REQUIRED,
} from "./core/envelope.js";

export type {
  BinaryPayload,
  CsClassBoxJoinStatus,
  CsLoginInfo,
  CsNameValuePair,
  CsRequestBase,
  CsResponseBase,
  FileUpload,
  JsonRecord,
} from "./core/types.js";

export { md5 } from "./core/md5.js";

// Resource classes, for wiring one up against a context of your own.
export { Auth } from "./resources/auth/auth.js";
export { ClassBoxes } from "./resources/classbox/classbox.js";
export { ClientSettings } from "./resources/settings/settings.js";
export { Distribute } from "./resources/distribute/distribute.js";
export { DirectMessages } from "./resources/messages/messages.js";
export { Drives, Links } from "./resources/drives/drives.js";
export { GalleryMedia } from "./resources/media/media.js";
export { Gradebook } from "./resources/gradebook/gradebook.js";
export { LibraryStore } from "./resources/library-store/library-store.js";
export { LicenseActivation } from "./resources/license-activation/license-activation.js";
export { Licensing } from "./resources/licensing/licensing.js";
export { RC_CONVERTING, RC_NO_LICENSE, RemoteConverter } from "./resources/converter/converter.js";
export { Rooms } from "./resources/rooms/rooms.js";
export { Sync } from "./resources/sync/sync.js";
export { SysInfo } from "./resources/sysinfo/sysinfo.js";
export { System } from "./resources/system/system.js";
export { Users } from "./resources/users/users.js";
export { VideoNotes } from "./resources/video/video.js";
export { METAMOJI_PROP_NS, WebDav } from "./resources/webdav/webdav.js";

export type * from "./resources/auth/interfaces.js";
export type * from "./resources/classbox/interfaces.js";
export type * from "./resources/converter/interfaces.js";
export type * from "./resources/distribute/interfaces.js";
export type * from "./resources/drives/interfaces.js";
export type * from "./resources/gradebook/interfaces.js";
export type * from "./resources/library-store/interfaces.js";
export type * from "./resources/license-activation/interfaces.js";
export type * from "./resources/licensing/interfaces.js";
export type * from "./resources/media/interfaces.js";
export type * from "./resources/messages/interfaces.js";
export type * from "./resources/rooms/interfaces.js";
export type * from "./resources/settings/interfaces.js";
export type * from "./resources/sync/interfaces.js";
export type * from "./resources/sysinfo/interfaces.js";
export type * from "./resources/system/interfaces.js";
export type * from "./resources/users/interfaces.js";
export type * from "./resources/video/interfaces.js";
export type * from "./resources/webdav/interfaces.js";
