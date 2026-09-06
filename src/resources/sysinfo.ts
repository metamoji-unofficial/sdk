/**
 * The startup manifest (`system/sysinfo.tsp` and `licensing/mazec-purchase.tsp`).
 *
 * A static JSON file the app fetches at launch for its EULA version, help and
 * policy links, in-app notice, and the download URLs for the handwriting
 * dictionary and fonts. There is no error envelope — it is a plain document.
 *
 * Most values are nested twice, by app version and then by locale, with `"*"`
 * as a wildcard at each level. `resolve()` implements the same fallback the app
 * does: exact version, then `"*"`; exact locale, then `"*"`, then `"en"`.
 *
 * `getMazecDictionary()` fetches what is, on the wire, the same filename from a
 * *different host*, and returns only the dictionary section. The host is
 * hardcoded to a staging CDN in the app; that is reproduced, not corrected.
 */

import { jsonPassthrough } from "../core/envelope.js";
import type { MetamojiContext } from "../core/http.js";
import type { Result } from "../core/result.js";
import type { JsonRecord } from "../core/types.js";

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

export class SysInfo {
  constructor(private readonly ctx: MetamojiContext) {}

  /**
   * Fetches the manifest.
   * `NtSysInfoManager.updateStateExec` —
   * `GET {cdn}/sysinfo_Android-Share-G-ClassRoom.json?last=...`.
   */
  async get(options: GetSysInfoOptions = {}): Promise<Result<NtSysInfoResponse>> {
    const last = options.last instanceof Date
      ? options.last.toISOString()
      : (options.last ?? "null");

    return jsonPassthrough(
      await this.ctx.request({
        base: options.onPremise ? "root" : "cdn",
        path: `sysinfo_${this.ctx.config.productName}.json`,
        method: "GET",
        headerSet: "none",
        query: { last },
      }),
    );
  }

  /**
   * Fetches the Mazec handwriting-dictionary manifest. Same filename, different
   * host, no `last` parameter.
   * `NtSysInfoManager.downloadSysInfo` (the `mazec.purchase` one) —
   * `GET {mazecCdn}/sysinfo_Android-Share-G-ClassRoom.json`.
   */
  async getMazecDictionary(): Promise<Result<MazecSysInfoResponse>> {
    return jsonPassthrough(
      await this.ctx.request({
        base: "mazecCdn",
        path: `sysinfo_${this.ctx.config.productName}.json`,
        method: "GET",
        headerSet: "none",
      }),
    );
  }

  /**
   * Picks one value out of a version/locale map, the way the app does: the
   * exact app version or `"*"`, then the exact locale, `"*"`, or `"en"`.
   */
  resolve<T>(
    map: NtSysInfoVersionMap<T> | undefined,
    options: { version?: string; locale?: string } = {},
  ): T | undefined {
    if (!map) return undefined;
    // The app matches on major.minor only — "3.15", not "3.15.1.0".
    const version = options.version ?? majorMinor(this.ctx.config.productVersion);
    const locale = options.locale ?? this.ctx.config.locale.split(/[_-]/)[0];

    const byLocale = map[version] ?? map["*"];
    if (!byLocale) return undefined;
    return byLocale[locale] ?? byLocale["*"] ?? byLocale["en"];
  }
}

function majorMinor(version: string): string {
  const parts = version.split(".");
  return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : version;
}
