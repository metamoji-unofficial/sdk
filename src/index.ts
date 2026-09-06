/**
 * metamoji-api — a TypeScript client for the MetaMoji ClassShare cloud API.
 *
 * Built from `docs/typespec`, itself reconstructed by reverse-engineering
 * `com.metamoji.share_classroom` 3.15.1.0. Unofficial, and not a MetaMoji
 * specification: some of it is inferred, and none of it is guaranteed to match
 * a live server.
 */

export { Metamoji } from "./client.js";

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
export { Auth } from "./resources/auth.js";
export { ClassBoxes } from "./resources/classbox.js";
export { ClientSettings } from "./resources/settings.js";
export { Distribute } from "./resources/distribute.js";
export { DirectMessages } from "./resources/messages.js";
export { Drives, Links } from "./resources/drives.js";
export { GalleryMedia } from "./resources/media.js";
export { Gradebook } from "./resources/gradebook.js";
export { LibraryStore } from "./resources/library-store.js";
export { LicenseActivation } from "./resources/license-activation.js";
export { Licensing } from "./resources/licensing.js";
export { RC_CONVERTING, RC_NO_LICENSE, RemoteConverter } from "./resources/converter.js";
export { Rooms } from "./resources/rooms.js";
export { Sync } from "./resources/sync.js";
export { SysInfo } from "./resources/sysinfo.js";
export { System } from "./resources/system.js";
export { Users } from "./resources/users.js";
export { VideoNotes } from "./resources/video.js";
export { METAMOJI_PROP_NS, WebDav } from "./resources/webdav.js";

export type * from "./resources/auth.js";
export type * from "./resources/classbox.js";
export type * from "./resources/converter.js";
export type * from "./resources/distribute.js";
export type * from "./resources/drives.js";
export type * from "./resources/gradebook.js";
export type * from "./resources/library-store.js";
export type * from "./resources/license-activation.js";
export type * from "./resources/licensing.js";
export type * from "./resources/media.js";
export type * from "./resources/messages.js";
export type * from "./resources/rooms.js";
export type * from "./resources/settings.js";
export type * from "./resources/sync.js";
export type * from "./resources/sysinfo.js";
export type * from "./resources/system.js";
export type * from "./resources/users.js";
export type * from "./resources/video.js";
export type * from "./resources/webdav.js";
