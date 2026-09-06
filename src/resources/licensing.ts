/**
 * Licences and billing (`licensing/license.tsp`).
 *
 * These six paths break the naming rule the rest of the API follows —
 * `/License`, `/Purchase`, `/GetShareInfo` and friends are capitalised and have
 * no prefix — which suggests an older subsystem reused wholesale. They are
 * documented and reachable, so they are wrapped as they are.
 *
 * Offline serial-key activation is a different host entirely; see
 * `licenseActivation.*`.
 */

import { csEnvelope } from "../core/envelope.js";
import type { MetamojiContext } from "../core/http.js";
import type { Result } from "../core/result.js";
import type {
  CsNameValuePair,
  CsRequestBase,
  CsResponseBase,
  JsonRecord,
} from "../core/types.js";

export interface InkAmountSyncOptions extends CsRequestBase {
  update?: JsonRecord;
}

export interface LicenseListResponse extends CsResponseBase {
  licenseList?: unknown[];
  result?: string;
  version?: string;
}

export interface PurchaseOptions extends CsRequestBase {
  /** Query parameters, as the field is named in the Java params class. */
  m_paramDic?: CsNameValuePair[];
}

export interface PurchaseResponse extends CsResponseBase {
  result?: string;
  version?: string;
}

export interface ProductLicenseSyncOptions extends CsRequestBase {
  update?: JsonRecord;
}

export interface ShareInfoResponse extends CsResponseBase {
  hasBaseLicense?: boolean;
  message?: string;
  result?: string;
  version?: string;
}

export class Licensing {
  constructor(private readonly ctx: MetamojiContext) {}

  /**
   * Syncs handwriting "ink" consumption with the server.
   * `executeInkAmountSyncWithParams` — `POST {rest}/License`.
   */
  async inkAmountSync(options: InkAmountSyncOptions = {}): Promise<Result<LicenseListResponse>> {
    return csEnvelope(
      await this.ctx.request({
        base: "rest",
        path: "License",
        method: "POST",
        json: this.ctx.csBody(options),
      }),
    );
  }

  /**
   * Purchases a licence.
   * `executePurchaseLicenseWithParams` — `POST {rest}/Purchase`.
   */
  async purchase(options: PurchaseOptions): Promise<Result<PurchaseResponse>> {
    return csEnvelope(
      await this.ctx.request({
        base: "rest",
        path: "Purchase",
        method: "POST",
        json: this.ctx.csBody(options),
      }),
    );
  }

  /**
   * A test purchase that charges nothing.
   * `executeDummyPurchaseLicenseWithParams` — `POST {rest}/DummyPurchase`.
   */
  async dummyPurchase(options: PurchaseOptions): Promise<Result<PurchaseResponse>> {
    return csEnvelope(
      await this.ctx.request({
        base: "rest",
        path: "DummyPurchase",
        method: "POST",
        json: this.ctx.csBody(options),
      }),
    );
  }

  /**
   * Syncs product licence state.
   * `executeProductLicenseSyncWithParams` — `POST {rest}/ProductLicense`.
   */
  async productLicenseSync(
    options: ProductLicenseSyncOptions = {},
  ): Promise<Result<LicenseListResponse>> {
    return csEnvelope(
      await this.ctx.request({
        base: "rest",
        path: "ProductLicense",
        method: "POST",
        json: this.ctx.csBody(options),
      }),
    );
  }

  /**
   * Runs a purchase simulation.
   * `executeSimulationPurchaseWithParams` — `POST {rest}/SimPurchase`.
   */
  async simulatePurchase(options: PurchaseOptions): Promise<Result<CsResponseBase>> {
    return csEnvelope(
      await this.ctx.request({
        base: "rest",
        path: "SimPurchase",
        method: "POST",
        json: this.ctx.csBody(options),
      }),
    );
  }

  /**
   * Whether sharing is available, and within what limits.
   * `executeGetShareInfoWithParams` — `POST {rest}/GetShareInfo`.
   */
  async getShareInfo(options: CsRequestBase = {}): Promise<Result<ShareInfoResponse>> {
    return csEnvelope(
      await this.ctx.request({
        base: "rest",
        path: "GetShareInfo",
        method: "POST",
        json: this.ctx.csBody(options),
      }),
    );
  }
}
