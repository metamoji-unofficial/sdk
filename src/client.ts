/**
 * The client.
 *
 * ```ts
 * const metamoji = new Metamoji({ locale: "ja_JP" });
 *
 * const { data, error } = await metamoji.auth.login({
 *   coLoginId: "school",
 *   loginName: "teacher",
 *   password: "…",
 * });
 * if (error) return console.error(error);
 *
 * // The login response's restHost and session cookie are now in place.
 * const drives = await metamoji.drives.getPrivateHome();
 * ```
 *
 * Every method resolves to `{ data, error }` and never rejects for an API-level
 * failure. Resources are grouped by subsystem; the mapping from each one back
 * to its TypeSpec operation is in the README's coverage table, and each method's
 * doc comment names the Java or Kotlin method it came from.
 */

import type { MetamojiConfig, MetamojiSession } from "./core/config.js";
import { MetamojiContext } from "./core/http.js";
import type { SessionScope } from "./core/cookies.js";

import { Auth } from "./resources/auth.js";
import { ClassBoxes } from "./resources/classbox.js";
import { ClientSettings } from "./resources/settings.js";
import { Distribute } from "./resources/distribute.js";
import { Drives, Links } from "./resources/drives.js";
import { DirectMessages } from "./resources/messages.js";
import { GalleryMedia } from "./resources/media.js";
import { Gradebook } from "./resources/gradebook.js";
import { LibraryStore } from "./resources/library-store.js";
import { LicenseActivation } from "./resources/license-activation.js";
import { Licensing } from "./resources/licensing.js";
import { RemoteConverter } from "./resources/converter.js";
import { Rooms } from "./resources/rooms.js";
import { Sync } from "./resources/sync.js";
import { SysInfo } from "./resources/sysinfo.js";
import { System } from "./resources/system.js";
import { Users } from "./resources/users.js";
import { VideoNotes } from "./resources/video.js";
import { WebDav } from "./resources/webdav.js";

export class Metamoji {
  /** Shared configuration, session identity, cookies and transport. */
  readonly context: MetamojiContext;

  /** Sign in and out, register, passwords, EULA, SSO. */
  readonly auth: Auth;
  /** Profiles, the organisation's users and groups. */
  readonly users: Users;
  /** Shared folders and their membership. */
  readonly drives: Drives;
  /** Share links to a document or page. */
  readonly links: Links;
  /** The newer REST sync data plane (`SdCloudService`). */
  readonly sync: Sync;
  /** The WebDAV data plane, for note bodies. */
  readonly webdav: WebDav;
  /** Class boxes — online classrooms with a join code. */
  readonly classBoxes: ClassBoxes;
  /** Live classroom rooms (`NsCollabo`). */
  readonly rooms: Rooms;
  /** Distributing notes to a class, and multipart crash logs. */
  readonly distribute: Distribute;
  /** Test logs and marks. */
  readonly gradebook: Gradebook;
  /** Voice and photo attachments. */
  readonly media: GalleryMedia;
  /** Video clips on the Flora servers. */
  readonly video: VideoNotes;
  /** Direct messages. */
  readonly messages: DirectMessages;
  /** Licences, ink usage and billing. */
  readonly licensing: Licensing;
  /** Offline serial-key activation, on its own host. */
  readonly licenseActivation: LicenseActivation;
  /** Server-side client settings. */
  readonly settings: ClientSettings;
  /** The startup manifest and the Mazec dictionary manifest. */
  readonly sysInfo: SysInfo;
  /** Maintenance notices and log upload. */
  readonly system: System;
  /** The legacy stationery store. */
  readonly libraryStore: LibraryStore;
  /** Remote file conversion. Unreachable in the shipped app; see the resource. */
  readonly converter: RemoteConverter;

  constructor(config: MetamojiConfig = {}) {
    this.context = new MetamojiContext(config);

    this.auth = new Auth(this.context);
    this.users = new Users(this.context);
    this.drives = new Drives(this.context);
    this.links = new Links(this.context);
    this.sync = new Sync(this.context);
    this.webdav = new WebDav(this.context);
    this.classBoxes = new ClassBoxes(this.context);
    this.rooms = new Rooms(this.context);
    this.distribute = new Distribute(this.context);
    this.gradebook = new Gradebook(this.context, this.rooms);
    this.media = new GalleryMedia(this.context);
    this.video = new VideoNotes(this.context);
    this.messages = new DirectMessages(this.context);
    this.licensing = new Licensing(this.context);
    this.licenseActivation = new LicenseActivation(this.context);
    this.settings = new ClientSettings(this.context);
    this.sysInfo = new SysInfo(this.context);
    this.system = new System(this.context);
    this.libraryStore = new LibraryStore(this.context);
    this.converter = new RemoteConverter(this.context);
  }

  /** The identity used to fill in repeated request fields. */
  get session(): MetamojiSession {
    return this.context.session;
  }

  /**
   * Sets identity fields directly, for resuming a session or driving the
   * multipart subsystems without a `login()` round trip.
   */
  setSession(session: MetamojiSession): void {
    this.context.setSession(session);
  }

  /** Updates configuration — a `restHost`, a drive's `homeDir`, a Flora server. */
  configure(config: Partial<MetamojiConfig>): void {
    this.context.configure(config);
  }

  /**
   * Forgets stored cookies, for one subsystem or all of them. This is the
   * client-side half only; `auth.logout()` ends the session on the server.
   */
  clearSession(scope?: SessionScope): void {
    this.context.cookies.clear(scope);
  }
}
