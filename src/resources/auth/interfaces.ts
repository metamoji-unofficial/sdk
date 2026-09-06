/**
 * Request and response types for authentication and account management (`auth/auth.tsp`).
 *
 * Separated from the calls that use them; the resource is `./auth.ts`.
 */

import type { CsLoginInfo, CsRequestBase, CsResponseBase, JsonRecord } from "../../core/types.js";

/** What the root servlet knows about one organisation. */
export interface SchoolResponse {
  /** The tenant host every later call is resolved against. */
  serverUrl: string;
  /** Echoed back from the request; the servlet does not send it. */
  coLoginId: string;
  isClassRoom: boolean;
  isOnPremise: boolean;
}

export interface LoginOptions extends CsRequestBase {
  /** The organisation's login id — the tenant code on the login screen. */
  coLoginId?: string;
  email?: string;
  loginName?: string;
  password?: string;
  /** The password surrogate the server issues; used instead of `password`. */
  qwd?: string;
  serverDeviceId?: string;
  userId?: string;
}

export interface LoginResponse extends CsResponseBase {
  coLoginId?: string;
  companyId?: string;
  companyName?: string;
  companyVersion?: number;
  email?: string;
  isClassRoom?: boolean;
  isOnPremise?: boolean;
  loginName?: string;
  /** Absolute URL of the tenant's maintenance text, when it has its own. */
  maintCheckURL?: string;
  name?: string;
  qwd?: string;
  /** The tenant host every later call is resolved against. */
  restHost?: string;
  serverDeviceId?: string;
  serverVersion?: number;
  /**
   * The account's id.
   *
   * A real ClassShare tenant answers with `uuid` and no `userId` at all, and
   * sends it as a number rather than a string. `CmUtils.toString` is what the
   * app runs every scalar through, which is why it never noticed.
   */
  userId?: string | number;
  uuid?: string | number;
  /** As the tenant spells it. Some send `maintchkurl` instead. */
  maintchkurl?: string;
}

export interface ClassroomLoginOptions extends CsRequestBase {
  classGroupId?: string;
  coLoginId?: string;
  /** The pupil's number within the class. */
  idNumber?: string;
  password?: string;
}

export interface ClassroomLoginInfoOptions extends CsRequestBase {
  coLoginId?: string;
}

export interface ClassroomLoginInfoResponse extends CsResponseBase {
  /** Schools and classes to choose from. Shape is server-defined. */
  allList?: JsonRecord;
}

export interface RegisterOptions extends CsRequestBase {
  coLoginId?: string;
  companyId?: string;
  email?: string;
  loginName?: string;
  name?: string;
  /** Invitation / sign-up code. */
  passcode?: string;
  password?: string;
}

export interface RegisterResponse extends CsResponseBase {
  email?: string;
  locale?: string;
  name?: string;
  password?: string;
  timezone?: string;
  uuid?: string;
}

export interface WithdrawOptions extends CsRequestBase {
  password?: string;
}

export interface ChangePasswordOptions extends CsRequestBase {
  passwordNew?: string;
  passwordOld?: string;
}

export interface ResetPasswordOptions extends CsRequestBase {
  email?: string;
  userId?: string;
}

export interface LockUserOptions extends CsRequestBase {
  /** Non-zero asks the server to recover rather than lock. */
  isRecover?: number;
  lockToken?: string;
}

export interface LockUserResponse extends CsResponseBase {
  needRecovery?: boolean;
}

export interface UnlockUserOptions extends CsRequestBase {
  lockToken?: string;
}

export interface AgreeEulaOptions extends CsRequestBase {
  eulaAgreeVersion?: number;
}

export interface GetCredentialOptions extends CsRequestBase {
  param1?: string;
  param2?: string;
  param3?: string;
}

export interface GetCredentialResponse extends CsResponseBase {
  loginInfo?: CsLoginInfo;
}
