/**
 * Authentication and account management (`auth/auth.tsp`).
 *
 * `login` is the entry point for everything else: its response carries the
 * per-tenant `restHost` that the rest of the API is addressed against, and the
 * session cookie the server sets on it authorises later calls. The client
 * records both, so a successful `login()` is all the setup a caller needs.
 */

import { csEnvelope } from "../core/envelope.js";
import type { MetamojiContext } from "../core/http.js";
import type { Result } from "../core/result.js";
import type { CsLoginInfo, CsRequestBase, CsResponseBase, JsonRecord } from "../core/types.js";

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
  userId?: string;
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

export class Auth {
  constructor(private readonly ctx: MetamojiContext) {}

  /**
   * Signs in with a user id or email address.
   * `CsCloudService.executeLoginWithParam` — `POST {root}/users3/login`.
   *
   * On success the client stores the session cookie, the returned `restHost`
   * and the identity fields the multipart subsystems re-send on every call.
   */
  async login(options: LoginOptions): Promise<Result<LoginResponse>> {
    const result = csEnvelope<LoginResponse>(
      await this.ctx.request({
        base: "root",
        path: "users3/login",
        method: "POST",
        json: this.ctx.csBody(options),
      }),
    );
    if (result.data) this.adoptSession(result.data, options.password);
    return result;
  }

  /**
   * Signs in as a ClassRoom account — the simplified pupil login, by class and
   * seat number rather than an email address.
   * `executeClassRoomLoginWithParam` — `POST {root}/users3/classroomlogin`.
   */
  async classroomLogin(options: ClassroomLoginOptions): Promise<Result<LoginResponse>> {
    const result = csEnvelope<LoginResponse>(
      await this.ctx.request({
        base: "root",
        path: "users3/classroomlogin",
        method: "POST",
        json: this.ctx.csBody(options),
      }),
    );
    if (result.data) this.adoptSession(result.data, options.password);
    return result;
  }

  /**
   * The school and class list shown on the ClassRoom login screen.
   * `executeGetClassRoomLoginInfoWithParam` — `POST {root}/users3/getclassroominfo`.
   */
  async getClassroomLoginInfo(
    options: ClassroomLoginInfoOptions = {},
  ): Promise<Result<ClassroomLoginInfoResponse>> {
    return csEnvelope(
      await this.ctx.request({
        base: "root",
        path: "users3/getclassroominfo",
        method: "POST",
        json: this.ctx.csBody(options),
      }),
    );
  }

  /**
   * Ends the server-side session. The client's own cookie for the scope is
   * dropped too, which is what `CsHttpClient#clearSession()` does separately.
   * `executeLogoutWithParams` — `POST {rest}/users3/logout`.
   */
  async logout(options: CsRequestBase = {}): Promise<Result<CsResponseBase>> {
    const result = csEnvelope<CsResponseBase>(
      await this.ctx.request({
        base: "rest",
        path: "users3/logout",
        method: "POST",
        json: this.ctx.csBody(options),
      }),
    );
    this.ctx.cookies.clear("cs");
    return result;
  }

  /**
   * Registers a new account.
   * `executeRegisterWithParams` — `POST {rest}/users2/register`.
   */
  async register(options: RegisterOptions): Promise<Result<RegisterResponse>> {
    return csEnvelope(
      await this.ctx.request({
        base: "rest",
        path: "users2/register",
        method: "POST",
        json: this.ctx.csBody(options),
      }),
    );
  }

  /**
   * Closes the signed-in account.
   * `executeWithdrawWithParams` — `POST {rest}/users2/withdraw/`.
   */
  async withdraw(options: WithdrawOptions): Promise<Result<CsResponseBase>> {
    return csEnvelope(
      await this.ctx.request({
        base: "rest",
        path: "users2/withdraw/",
        method: "POST",
        json: this.ctx.csBody(options),
      }),
    );
  }

  /**
   * Changes the signed-in user's password.
   * `executeChangePasswordWithParams` — `PUT {rest}/users2/change/password`.
   */
  async changePassword(options: ChangePasswordOptions): Promise<Result<CsResponseBase>> {
    return csEnvelope(
      await this.ctx.request({
        base: "rest",
        path: "users2/change/password",
        method: "PUT",
        json: this.ctx.csBody(options),
      }),
    );
  }

  /**
   * Requests a password reset (the server sends the mail).
   * `executeResetPasswordWithParams` — `POST {rest}/users2/reissue/password`.
   */
  async resetPassword(options: ResetPasswordOptions): Promise<Result<CsResponseBase>> {
    return csEnvelope(
      await this.ctx.request({
        base: "rest",
        path: "users2/reissue/password",
        method: "POST",
        json: this.ctx.csBody(options),
      }),
    );
  }

  /**
   * Locks a user, an administrator action.
   * `executeLockUserWithParams` — `POST {rest}/users2/lock`.
   */
  async lockUser(options: LockUserOptions): Promise<Result<LockUserResponse>> {
    return csEnvelope(
      await this.ctx.request({
        base: "rest",
        path: "users2/lock",
        method: "POST",
        json: this.ctx.csBody(options),
      }),
    );
  }

  /**
   * Unlocks a user, an administrator action.
   * `executeUnlockUserWithParams` — `POST {rest}/users2/unlock`.
   */
  async unlockUser(options: UnlockUserOptions): Promise<Result<CsResponseBase>> {
    return csEnvelope(
      await this.ctx.request({
        base: "rest",
        path: "users2/unlock",
        method: "POST",
        json: this.ctx.csBody(options),
      }),
    );
  }

  /**
   * Records agreement to a version of the EULA. The version to send is the
   * `requiredEULAVersion` any response can carry.
   * `executeAgreeEULAWithParams` — `POST {rest}/users2/eula/agree`.
   */
  async agreeEula(options: AgreeEulaOptions): Promise<Result<CsResponseBase>> {
    return csEnvelope(
      await this.ctx.request({
        base: "rest",
        path: "users2/eula/agree",
        method: "POST",
        json: this.ctx.csBody(options),
      }),
    );
  }

  /**
   * Fetches a single sign-on credential. Unusually for a signed-in call this
   * one goes to the root server, not the tenant host.
   * `executeGetCredentialWithParams` — `POST {root}/sso/requestcredential`.
   */
  async getCredential(options: GetCredentialOptions = {}): Promise<Result<GetCredentialResponse>> {
    return csEnvelope(
      await this.ctx.request({
        base: "root",
        path: "sso/requestcredential",
        method: "POST",
        json: this.ctx.csBody(options),
      }),
    );
  }

  /** Copies a login response into the client's host and identity state. */
  private adoptSession(response: LoginResponse, password: string | undefined): void {
    this.ctx.setRestHost(response.restHost);
    if (response.maintCheckURL) this.ctx.config.maintenanceUrl = response.maintCheckURL;
    this.ctx.setSession({
      userId: response.userId,
      loginName: response.loginName,
      email: response.email,
      qwd: response.qwd,
      companyId: response.companyId,
      companyName: response.companyName,
      coLoginId: response.coLoginId,
      serverDeviceId: response.serverDeviceId,
      ...(password ? { password } : {}),
    });
  }
}
