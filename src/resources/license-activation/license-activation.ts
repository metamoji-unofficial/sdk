/**
 * Offline licence-key activation (`licensing/license-activation.tsp`).
 *
 * A wholly separate service on `license.metamoji.com`, unrelated to the
 * `licensing.*` billing endpoints: it activates a typed-in serial key and
 * reports how many days it has left.
 *
 * Both directions are signed with an MD5 of the fields in a fixed order, and
 * the app rejects a response whose hash does not match. This client computes
 * the request hash and verifies the response one by default; pass `tt_hash`
 * explicitly to override the first, or `verifyHash: false` to skip the second.
 *
 * A caveat worth knowing before wiring this up: the product id the app sends is
 * hardcoded to `"Android-Note-Business_3.1.8"`, which is a *different product*
 * from ClassShare. Whether this path is reachable in a shipped ClassShare build
 * is not established — see the notes in the TypeSpec.
 */

import { LICENSE_PRODUCT_ID } from "../../core/config.js";
import { jsonPassthrough } from "../../core/envelope.js";
import type { MetamojiContext } from "../../core/http.js";
import { md5 } from "../../core/md5.js";
import { fail, type Result } from "../../core/result.js";
import type {
  ActivateOptions,
  ActivateResponse,
  RemainingDaysResponse,
} from "./interfaces.js";

export class LicenseActivation {
  constructor(private readonly ctx: MetamojiContext) {}

  /**
   * Activates a licence key.
   * `LicenseUtil.onlineActivate` — `POST {license}/license/activate2/`.
   */
  async activate(options: ActivateOptions): Promise<Result<ActivateResponse>> {
    const body = this.buildRequest(options);
    const result = await jsonPassthrough<ActivateResponse>(
      await this.ctx.request({
        base: "license",
        path: "license/activate2/",
        method: "POST",
        headerSet: "none",
        json: body,
      }),
    );
    if (result.error || options.verifyHash === false) return result;
    return this.verify(result, [
      body.tt_deviceid,
      body.tt_productid,
      String(result.data.i_result),
      String(result.data.i_status),
    ]);
  }

  /**
   * Asks how long an activated licence has left.
   * `LicenseUtil.queryRestDays` — `POST {license}/license/getremainingdays/`.
   */
  async getRemainingDays(options: ActivateOptions): Promise<Result<RemainingDaysResponse>> {
    const body = this.buildRequest(options);
    const result = await jsonPassthrough<RemainingDaysResponse>(
      await this.ctx.request({
        base: "license",
        path: "license/getremainingdays/",
        method: "POST",
        headerSet: "none",
        json: body,
      }),
    );
    if (result.error || options.verifyHash === false) return result;
    return this.verify(result, [
      body.tt_deviceid,
      body.tt_productid,
      String(result.data.i_result),
      String(result.data.i_days),
      String(result.data.i_status),
    ]);
  }

  /** `MD5("mmj:" + parts.join(":"))`, the app's `createHash`. */
  static hash(parts: string[]): string {
    return md5(["mmj", ...parts].join(":"));
  }

  private buildRequest(options: ActivateOptions) {
    const deviceId = options.deviceId ?? this.ctx.config.deviceId ?? "";
    const productId = options.productId ?? LICENSE_PRODUCT_ID;
    const deviceName = options.deviceName ?? this.ctx.config.deviceName;
    return {
      tt_deviceid: deviceId,
      tt_productid: productId,
      tt_licensekey: options.licenseKey,
      tt_devicename: deviceName,
      tt_hash:
        options.tt_hash ??
        LicenseActivation.hash([deviceId, productId, options.licenseKey, deviceName]),
    };
  }

  private verify<T extends ActivateResponse>(
    result: Result<T> & { data: T },
    parts: string[],
  ): Result<T> {
    const expected = LicenseActivation.hash(parts);
    if (result.data.tt_hash && result.data.tt_hash !== expected) {
      return fail({
        name: "hash_mismatch",
        message:
          "The activation server's response hash did not match. The app treats this as a " +
          "failure; pass `verifyHash: false` to accept it anyway.",
        data: result.data,
      });
    }
    return result;
  }
}
