/**
 * Request and response types for the legacy content store (`legacy/library-store.tsp`).
 *
 * Separated from the calls that use them; the resource is `./library-store.ts`.
 */

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
