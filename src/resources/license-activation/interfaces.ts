/**
 * Request and response types for offline licence-key activation (`licensing/license-activation.tsp`).
 *
 * Separated from the calls that use them; the resource is `./license-activation.ts`.
 */

export interface ActivateOptions {
  /** `tt_deviceid` — the random UUID generated at first launch. */
  deviceId?: string;
  /** `tt_licensekey` — the key the user typed in. */
  licenseKey: string;
  /** `tt_devicename` — `"{Build.BRAND} {Build.MODEL}"` in the app. */
  deviceName?: string;
  /** `tt_productid`. Defaults to the app's hardcoded value. */
  productId?: string;
  /** Overrides the computed request hash. */
  tt_hash?: string;
  /** Check the response's own hash. Default true. */
  verifyHash?: boolean;
}

export interface ActivateResponse {
  tt_hash?: string;
  /** 0 is success. A negative value means a network or format problem. */
  i_status?: number;
  /** Activation result. 0 means the licence is valid. */
  i_result?: number;
}

export interface RemainingDaysResponse extends ActivateResponse {
  /** Days left from today. */
  i_days?: number;
}
