/**
 * Request and response types for licences and billing (`licensing/license.tsp`).
 *
 * Separated from the calls that use them; the resource is `./licensing.ts`.
 */

import type {
  CsNameValuePair,
  CsRequestBase,
  CsResponseBase,
  JsonRecord,
} from "../../core/types.js";

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
