/**
 * The legacy content store (`legacy/library-store.tsp`).
 *
 * Where the app's stationery comes from: stickers, backgrounds and sheet
 * templates, browsed as pages of products and downloaded as archives.
 *
 * Its session is a *guest* session — `id=guest` with an empty password, always,
 * regardless of who is signed in. When a call returns `result: "1"` the session
 * has lapsed and the app logs back in and retries; with `autoLogin` on, so does
 * this client.
 *
 * The flow is: `listPages()` for the categories, then `getPage(pageURL)` with
 * the absolute URL each category carries, then `downloadProduct(url)` with a
 * product's `p_URL` or a part's `productURL`. Only the first two steps have
 * fixed paths — the rest are URLs the server hands out.
 *
 * Note that the *catalogue initialisation* paths under `init/library/` are not
 * here, and are not endpoints: they are asset paths inside the APK.
 */

import { storeEnvelope } from "../core/envelope.js";
import type { MetamojiContext } from "../core/http.js";
import { fail, ok, type Result } from "../core/result.js";
import type { BinaryPayload } from "../core/types.js";

/** Every store response carries this (`LbStoreStatusResponse`). */
export interface StoreStatusResponse {
  /** `"0"` succeeded, `"1"` means log in again. */
  result?: string;
  message?: string;
}

export interface StorePage {
  pageID?: string;
  pageTitle?: string;
  pageFormat?: string;
  /** Absolute URL to pass to `getPage`. */
  pageURL?: string;
}

export interface ListPagesResponse extends StoreStatusResponse {
  /** Anything other than `"1.0"` and the app ignores the page list. */
  version?: string;
  pages?: StorePage[];
}

export interface StoreProductPart {
  entityId?: string;
  thumbnailURL?: string;
  /** This part's own download URL, when it has one. */
  productURL?: string;
  title?: string;
}

/** Ties a product to a Google Play billing item. */
export interface StoreMarketEntry {
  /** The only value the app checks for is `"GooglePlay"`. */
  m_storeID?: string;
  m_itemID?: string;
}

export interface StoreProduct {
  p_id?: string;
  p_title?: string;
  p_comment?: string;
  /** Whole-product download URL, used when a part has none of its own. */
  p_URL?: string;
  /** A string flag; how the server spells true here is not recovered. */
  p_isFree?: string;
  p_creatorId?: string;
  p_creatorName?: string;
  p_parts?: StoreProductPart[];
  p_market?: StoreMarketEntry[];
}

export interface GetPageResponse extends StoreStatusResponse {
  version?: string;
  products?: StoreProduct[];
}

/** `1` for library items, `2` for note and sheet templates. */
export type StorePageType = 1 | 2;

export interface StoreLoginOptions {
  /** Device details the store records. All have app-shaped defaults. */
  clientLocale?: string;
  osLocale1?: string;
  osLocale2?: string;
  timezone?: string;
  osVersion?: string;
  device?: string;
  /** `"{width}*{height}"` in pixels. */
  resolution?: string;
}

export class LibraryStore {
  constructor(private readonly ctx: MetamojiContext) {}

  /**
   * Opens a guest session. The id and password are fixed; only the device
   * details vary.
   * `LibraryURLConnectionForLogin` — `POST {rest}/store/Login` (no body).
   */
  async login(options: StoreLoginOptions = {}): Promise<Result<StoreStatusResponse>> {
    const c = this.ctx.config;
    const language = c.locale.split(/[_-]/)[0];
    return storeEnvelope(
      await this.ctx.request({
        base: "rest",
        path: "store/Login",
        method: "POST",
        headerSet: "none",
        scope: "store",
        query: {
          id: "guest",
          pass: "",
          product: c.productName,
          version: c.productVersion,
          clientLocale: options.clientLocale ?? language,
          osLocale1: options.osLocale1 ?? c.locale,
          osLocale2: options.osLocale2 ?? language,
          timezone: options.timezone ?? c.timezone,
          os: "Android",
          osVersion: options.osVersion ?? "",
          device: options.device ?? c.deviceName,
          // Hardcoded in the app; it does not look at the real connection.
          network: "wifi",
          resolution: options.resolution ?? "",
        },
      }),
    );
  }

  /**
   * Lists the store's pages (its categories).
   * `LibraryURLConnectionForGetAllPages` — `GET {rest}/store/GetAllPages`.
   */
  async listPages(pageType: StorePageType = 1): Promise<Result<ListPagesResponse>> {
    return this.withGuestLogin(() =>
      this.request<ListPagesResponse>({
        base: "rest",
        path: "store/GetAllPages",
        query: { pageType },
      }),
    );
  }

  /**
   * Lists the products on a page. Takes the absolute `pageURL` from
   * `listPages`, not a path.
   * `LibraryURLConnectionForGetPage` — `GET {pageURL}`.
   */
  async getPage(pageUrl: string): Promise<Result<GetPageResponse>> {
    return this.withGuestLogin(() =>
      this.request<GetPageResponse>({ base: "absolute", path: pageUrl }),
    );
  }

  /**
   * Downloads a product archive from its `p_URL` or a part's `productURL`.
   * `LbDownloadUtil.downloadWithProgressDialog` — `GET {productURL}`.
   *
   * A JSON body here means the session lapsed rather than that the download
   * succeeded, which is how the retry is triggered.
   */
  async downloadProduct(productUrl: string): Promise<Result<BinaryPayload>> {
    const run = async (): Promise<Result<BinaryPayload>> => {
      const result = await this.ctx.request({
        base: "absolute",
        path: productUrl,
        method: "GET",
        headerSet: "none",
        scope: "store",
        parse: "auto",
      });
      if (result.error) return fail(result.error);

      const contentType = result.data.headers["content-type"] ?? "";
      if (/\bjson\b/i.test(contentType)) return storeEnvelope<BinaryPayload>(result);
      return ok({
        bytes: result.data.bytes,
        mimeType: contentType || undefined,
        httpStatusCode: result.data.status,
      });
    };
    return this.withGuestLogin(run);
  }

  private async request<T>(spec: {
    base: "rest" | "absolute";
    path: string;
    query?: Record<string, string | number>;
  }): Promise<Result<T>> {
    return storeEnvelope<T>(
      await this.ctx.request({
        base: spec.base,
        path: spec.path,
        method: "GET",
        headerSet: "none",
        scope: "store",
        query: spec.query,
      }),
    );
  }

  /** Logs in as a guest and retries once when the server asks for a session. */
  private async withGuestLogin<T>(run: () => Promise<Result<T>>): Promise<Result<T>> {
    const first = await run();
    if (!this.ctx.config.autoLogin || first.error?.name !== "login_required") return first;
    const relogin = await this.login();
    if (relogin.error) return first;
    return run();
  }
}
