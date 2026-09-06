/**
 * Client configuration, defaults, and the several base URLs this API has.
 *
 * There is no single origin. The app talks to a bootstrap root server before
 * login, a per-tenant REST host after it, a per-drive `homeDir` for sync, a
 * per-session "Flora" host for video, a CDN for the startup manifest, and a
 * separate licensing host — plus a handful of endpoints that are handed an
 * absolute URL by an earlier response (WebDAV resources, store pages, upload
 * points). `BaseTarget` names which of those a given call uses.
 */

import type { FetchLike, Transport } from "./transport.js";
import { withTrailingSlash } from "./url.js";

/** Bootstrap host. `ModelInfo$BuildOptions.DIGITAL_CABINET_URL_ROOT`. */
export const DEFAULT_ROOT_SERVER = "https://mps.metamoji.com/";

/**
 * The context root every tenant call sits under.
 * `CsCloudServiceContext#getRestBasePath()`.
 *
 * The tenant host serves nothing at its own root: `POST {tenant}/users3/login`
 * is a 404, and `POST {tenant}/mmjeditor2/2.0/users3/login` is the endpoint.
 * The bootstrap root server is the other way round — `mpsroot/RequestServlet`
 * and `sso/requestcredential` sit directly at its root and 404 underneath this
 * prefix — which is why the two are separate bases rather than one host with a
 * switch. The `cosmos/*` and `mmjcloud/*` families are on the tenant host but
 * *not* under this prefix, and use `dc`.
 */
export const DEFAULT_REST_BASE_PATH = "mmjeditor2/2.0";
/** Startup manifest CDN (`NtSysInfoManager`, public-cloud default). */
export const DEFAULT_CDN_SERVER = "https://cdn.metamoji.com/";
/** Mazec dictionary manifest host. Hardcoded to staging in the app; not a typo here. */
export const DEFAULT_MAZEC_CDN_SERVER = "https://cdn-test.metamoji.com/";
/** Offline licence-key activation (`LicenseUtil`). */
export const DEFAULT_LICENSE_SERVER = "https://license.metamoji.com/mmjlicense/";
/** Activation host used by evaluation builds (`ModelInfo.isEvalEdition`). */
export const LICENSE_TEST_SERVER = "https://license-test.metamoji.com/mmjlicense/";

/** `ModelInfo$BuildOptions.BUILD_PRODUCT_NAME`, sent by nearly every subsystem. */
export const PRODUCT_NAME = "Android-Share-G-ClassRoom";
/** The APK this documentation was reconstructed from. */
export const PRODUCT_VERSION = "3.15.1.0";
/**
 * `LicenseUtil.getProductId()`. It really does name a different product
 * ("Note Business" 3.1.8) than the app it ships in — see
 * licensing/license-activation.tsp.
 */
export const LICENSE_PRODUCT_ID = "Android-Note-Business_3.1.8";

/** Which host a request is resolved against. */
export type BaseTarget =
  /** Bootstrap root server: login, SSO, maintenance text, crash logs. */
  | "root"
  /** Per-tenant REST host from `CsLoginResponse.restHost`; most calls after login. */
  | "rest"
  /** Digital Cabinet base for the `NsCollabo` / gallery / converter subsystems. */
  | "dc"
  /** Per-drive `homeDir` used by `SdCloudService`. */
  | "home"
  /** The dynamically assigned "Flora" video host. */
  | "flora"
  /** Startup manifest CDN. */
  | "cdn"
  /** Mazec dictionary CDN. */
  | "mazecCdn"
  /** Licence activation host. */
  | "license"
  /** The path is already an absolute URL (WebDAV, store pages, upload points). */
  | "absolute";

export interface MetamojiConfig {
  /** Bootstrap host. Default `https://mps.metamoji.com/`. */
  rootServer?: string;
  /**
   * Per-tenant REST host. Normally left unset: `auth.login()` fills it in from
   * the login response's `restHost`.
   */
  restHost?: string;
  /**
   * Base for the `NsCollabo` (rooms), gallery-media, gradebook and remote
   * converter subsystems. These use `DIGITAL_CABINET_URL_BASE()`, which is the
   * root server on a production build; defaults to `rootServer`.
   */
  dcServer?: string;
  /** A drive's `homeDir`, the base for every `sync.*` call. */
  homeDir?: string;
  /**
   * The Flora video host (`VfVideoFileManager.getServerName()`). A value with no
   * scheme is treated as plain `http://`, matching `makeFloraCommandUrl`.
   */
  floraServer?: string;
  /** Startup manifest CDN. Default `https://cdn.metamoji.com/`. */
  cdnServer?: string;
  /** Mazec dictionary CDN. Default `https://cdn-test.metamoji.com/`. */
  mazecCdnServer?: string;
  /**
   * Context root for tenant calls, appended to `restHost`. Default
   * `mmjeditor2/2.0`; set `""` for a deployment that serves them at the root.
   */
  restBasePath?: string;

  /** Licence activation host. Default `https://license.metamoji.com/mmjlicense/`. */
  licenseServer?: string;
  /**
   * Absolute URL of the maintenance text, when the server supplied one
   * (`CsDCUserInfo.maintenanceCheckURL`). Falls back to
   * `{rootServer}maintenance2_common.txt`.
   */
  maintenanceUrl?: string;
  /**
   * Absolute URL of a drive's maintenance notice, from
   * `SdMODrive.maintenanceText`. A different value from `maintenanceUrl`:
   * `sync.getMaintenanceInfo()` uses this one, `system.getMaintenanceInfo()`
   * the other. `drives.getHome()` records it.
   */
  syncMaintenanceUrl?: string;

  /** `X-DM-ProductName` and the `productName` field/part. */
  productName?: string;
  /** `X-DM-ProductVersion` and the `productVersion` field/part. */
  productVersion?: string;
  /** `X-DM-AppVersion`. Defaults to `productVersion`. */
  appVersion?: string;
  /** `deviceName` on every `CsCloudService` request body. */
  deviceName?: string;
  /** `X-DM-Locale` and the `locale` field. Default `ja_JP`. */
  locale?: string;
  /** The `timezone` field. Defaults to the host's zone, else `Asia/Tokyo`. */
  timezone?: string;
  /**
   * `X-DM-Device`, sent only by `SdHttpClient`. Format:
   * `"{Build.MODEL};Android;{Build.VERSION.SDK_INT}"`.
   */
  device?: string;
  /** `deviceID` in a room's `authInfo`, and `tt_deviceid` for licence activation. */
  deviceId?: string;
  /** `deviceCode` in a room's `authInfo`. */
  deviceCode?: string;

  /** Identity used to fill in request fields that repeat on every call. */
  session?: MetamojiSession;

  /** Headers merged into every request. Explicit per-call headers win. */
  headers?: Record<string, string>;
  /** Client-side deadline in milliseconds. Default 30000; 0 disables it. */
  timeout?: number;
  /** Replacement `fetch`, e.g. Tauri's. Ignored when `transport` is set. */
  fetch?: FetchLike;
  /** Full transport replacement, for tests or an exotic runtime. */
  transport?: Transport;
  /** Persist session cookies between calls. Default true. */
  cookies?: boolean;
  /**
   * Send the handful of GET endpoints that carry a JSON body without one,
   * rather than reaching for `node:http`. The requests become standards-
   * compliant but lose their parameters, so the server may reject them.
   */
  dropBodyOnGet?: boolean;
  /**
   * Re-authenticate and retry once when a subsystem reports the session has
   * expired. Only the three cases the app itself implements are covered:
   * `SdCloudService` error `0x2af9`, a gallery-media `403`, and a legacy store
   * `result: "1"`. Default true.
   */
  autoLogin?: boolean;
}

/**
 * The identity carried across calls. `auth.login()` populates it; every field
 * can also be set by hand, or overridden per call.
 *
 * It exists because the multipart subsystems do not use the session cookie —
 * `NsCollabo`, gallery-media, video and the remote converter each re-send the
 * user's credentials as form parts on every request.
 */
export interface MetamojiSession {
  userId?: string;
  /** The login name, when it differs from `userId`. */
  loginName?: string;
  email?: string;
  /** Cleartext password. Prefer `qwd`, which is what the app stores. */
  password?: string;
  /** The password surrogate the server issues at login. */
  qwd?: string;
  companyId?: string;
  companyName?: string;
  /** The organisation's login id, i.e. the tenant code typed on the login screen. */
  coLoginId?: string;
  /** Set from the login response; also copied into `restHost`. */
  serverDeviceId?: string;
  /** `appAuthKey` from `users.get()`, used as WebDAV's `X-mmj-appcode`. */
  appAuthKey?: string;
}

export interface ResolvedConfig extends Required<Omit<MetamojiConfig,
  "restHost" | "homeDir" | "floraServer" | "maintenanceUrl" | "syncMaintenanceUrl" | "fetch" | "transport" | "session" | "device" | "deviceId" | "deviceCode" | "dcServer">> {
  restHost?: string;
  /** Unset until the caller names one; `dc` then follows `restHost`. */
  dcServer?: string;
  homeDir?: string;
  floraServer?: string;
  maintenanceUrl?: string;
  syncMaintenanceUrl?: string;
  device?: string;
  deviceId?: string;
  deviceCode?: string;
  fetch?: FetchLike;
  transport?: Transport;
}

function hostTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Tokyo";
  } catch {
    return "Asia/Tokyo";
  }
}

export function resolveConfig(config: MetamojiConfig = {}): ResolvedConfig {
  const productVersion = config.productVersion ?? PRODUCT_VERSION;
  return {
    rootServer: withTrailingSlash(config.rootServer ?? DEFAULT_ROOT_SERVER),
    restHost: config.restHost ? withTrailingSlash(config.restHost) : undefined,
    restBasePath: config.restBasePath ?? DEFAULT_REST_BASE_PATH,
    // Left unset unless the caller names one: `dc` resolves to the tenant's
    // REST host once login has provided it. Defaulting it to the root server
    // here would fix it there for the life of the client, and `cosmos/*` on
    // the root server is a 404.
    dcServer: config.dcServer ? withTrailingSlash(config.dcServer) : undefined,
    homeDir: config.homeDir ? withTrailingSlash(config.homeDir) : undefined,
    floraServer: config.floraServer,
    cdnServer: withTrailingSlash(config.cdnServer ?? DEFAULT_CDN_SERVER),
    mazecCdnServer: withTrailingSlash(config.mazecCdnServer ?? DEFAULT_MAZEC_CDN_SERVER),
    licenseServer: withTrailingSlash(config.licenseServer ?? DEFAULT_LICENSE_SERVER),
    maintenanceUrl: config.maintenanceUrl,
    syncMaintenanceUrl: config.syncMaintenanceUrl,
    productName: config.productName ?? PRODUCT_NAME,
    productVersion,
    appVersion: config.appVersion ?? productVersion,
    deviceName: config.deviceName ?? "metamoji-api",
    locale: config.locale ?? "ja_JP",
    timezone: config.timezone ?? hostTimezone(),
    device: config.device,
    deviceId: config.deviceId,
    deviceCode: config.deviceCode,
    headers: config.headers ?? {},
    timeout: config.timeout ?? 30_000,
    fetch: config.fetch,
    transport: config.transport,
    cookies: config.cookies ?? true,
    dropBodyOnGet: config.dropBodyOnGet ?? false,
    autoLogin: config.autoLogin ?? true,
  };
}
