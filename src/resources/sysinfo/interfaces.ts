/**
 * Request and response types for the startup manifest (`system/sysinfo.tsp` and `licensing/mazec-purchase.tsp`).
 *
 * Separated from the calls that use them; the resource is `./sysinfo.ts`.
 */

import type { JsonRecord } from "../../core/types.js";

/** Version -> locale -> value. Either key may be `"*"`. */
export type NtSysInfoVersionMap<T = string> = Record<string, Record<string, T>>;

/** The one entry whose resolved value is an object rather than a URL. */
export interface NtSysInfoNotifyEntry {
  serial?: string;
  url?: string;
}

export interface NtSysInfoResponse extends JsonRecord {
  "WebSite.support"?: NtSysInfoVersionMap;
  "WebSite.supen"?: NtSysInfoVersionMap;
  "WebSite.tos"?: NtSysInfoVersionMap;
  "WebSite.privacy"?: NtSysInfoVersionMap;
  "WebSite.about"?: NtSysInfoVersionMap;
  "WebSite.about_cabinet"?: NtSysInfoVersionMap;
  "WebSite.help_DCLogin"?: NtSysInfoVersionMap;
  /** Nested by version only, with no locale level. */
  "DigitalCabinet.supported_locale"?: Record<string, unknown>;
  "sample.note"?: NtSysInfoVersionMap;
  "WebSite.manual"?: NtSysInfoVersionMap;
  "WebSite.manual.hinthelp"?: NtSysInfoVersionMap;
  "GooglePlay.mazec2"?: NtSysInfoVersionMap;
  "Share.WebSite.EULA"?: NtSysInfoVersionMap;
  /** A version string, not a URL, despite sharing the resolution path. */
  "Share.WebSite.EULA.version"?: NtSysInfoVersionMap;
  "WebSite.promo.SAFree"?: NtSysInfoVersionMap;
  "WebSite.promo.NA"?: NtSysInfoVersionMap;
  "WebSite.promo.SharedDrive"?: NtSysInfoVersionMap;
  /** Not nested; copied through as-is, and unexamined by the app. */
  "mazec.dic"?: JsonRecord;
  "font.cr"?: NtSysInfoVersionMap;
  "WebSite.notify"?: NtSysInfoVersionMap<NtSysInfoNotifyEntry>;
}

export interface MazecSysInfoResponse extends JsonRecord {
  "mazec.dic"?: JsonRecord;
}

export interface GetSysInfoOptions {
  /**
   * `last` — when the manifest was last fetched, as UTC ISO 8601. The app sends
   * the literal string `"null"` on a first run, and so does this by default.
   */
  last?: string | Date;
  /** Fetch from the root server instead of the CDN, as on-premise builds do. */
  onPremise?: boolean;
}
