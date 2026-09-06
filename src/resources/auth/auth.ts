/**
 * Authentication and account management (`auth/auth.tsp`).
 *
 * `login` is the entry point for everything else: its response carries the
 * per-tenant `restHost` that the rest of the API is addressed against, and the
 * session cookie the server sets on it authorises later calls. The client
 * records both, so a successful `login()` is all the setup a caller needs.
 */

import { csEnvelope } from "../../core/envelope.js";
import { withTrailingSlash } from "../../core/url.js";
import type { MetamojiContext } from "../../core/http.js";
import { fail, ok, type Result } from "../../core/result.js";
import type { CsRequestBase, CsResponseBase } from "../../core/types.js";
import type {
  AgreeEulaOptions,
  ChangePasswordOptions,
  ClassroomLoginInfoOptions,
  ClassroomLoginInfoResponse,
  ClassroomLoginOptions,
  GetCredentialOptions,
  GetCredentialResponse,
  LockUserOptions,
  LockUserResponse,
  LoginOptions,
  LoginResponse,
  RegisterOptions,
  RegisterResponse,
  ResetPasswordOptions,
  SchoolResponse,
  UnlockUserOptions,
  WithdrawOptions,
} from "./interfaces.js";

export class Auth {
  constructor(private readonly ctx: MetamojiContext) {}

  /**
   * Finds the tenant a school code belongs to, before there is a session.
   *
   * `ExecuteGetServerUrlWithParams` — `GET {root}/mpsroot/RequestServlet?coLoginId=…`.
   * A plain query string rather than the JSON envelope everything else uses:
   * it is served by a different servlet that predates the REST API, and it
   * answers with no `errorCode` either.
   *
   * This is the first call a school account makes. Without the host it
   * returns, `login` has nowhere to go — so on success the client adopts it as
   * `restHost`.
   */
  async resolveSchool(coLoginId: string, options: { adopt?: boolean } = {}): Promise<Result<SchoolResponse>> {
    const { adopt = true } = options;
    const response = await this.ctx.request({
      base: "root",
      path: `mpsroot/RequestServlet?coLoginId=${encodeURIComponent(coLoginId)}`,
      method: "GET",
    });
    if (response.error) return fail(response.error);

    const body = (response.data?.json ?? {}) as Record<string, unknown>;
    // `serverURL`, not `serverUrl`. The Java *field* is `serverUrl`, but
    // `ExecuteGetServerUrlWithParams` reads the JSON key by hand and the key
    // is capitalised. Reading the field name instead makes every school look
    // as though it does not exist.
    const serverUrl = body.serverURL ?? body.serverUrl;
    if (typeof serverUrl !== "string" || serverUrl.length === 0) {
      // The servlet answers 200 with an empty body for a code it does not
      // know, so "not found" has to be read from the absence of a host.
      return fail({
        name: "application_error",
        message: `No server is registered for the school id "${coLoginId}".`,
      });
    }

    const school: SchoolResponse = {
      serverUrl: withTrailingSlash(serverUrl),
      coLoginId,
      isClassRoom: body.isClassRoom === true,
      isOnPremise: body.isOnPremise === true,
    };
    if (adopt) this.ctx.setRestHost(school.serverUrl);
    return ok(school);
  }

  /**
   * Signs in with a user id or email address.
   * `CsCloudService.executeLoginWithParam` — `POST {rest}/users3/login`.
   *
   * Against the tenant, not the bootstrap root: the root server serves no
   * `users3/*` at all. So a school account calls `resolveSchool()` first, which
   * is what supplies the host this then posts to.
   *
   * On success the client stores the session cookie, the returned `restHost`
   * and the identity fields the multipart subsystems re-send on every call.
   */
  async login(options: LoginOptions): Promise<Result<LoginResponse>> {
    const result = csEnvelope<LoginResponse>(
      await this.ctx.request({
        base: "rest",
        path: "users3/login",
        method: "POST",
        json: this.ctx.csBody(options),
      }),
    );
    if (result.data) {
      this.adoptSession(result.data, options.password);
      this.rememberHowToReturn(options.password, () => this.login(options));
    }
    return result;
  }

  /**
   * Signs in as a ClassRoom account — the simplified pupil login, by class and
   * seat number rather than an email address.
   * `executeClassRoomLoginWithParam` — `POST {rest}/users3/classroomlogin`.
   */
  async classroomLogin(options: ClassroomLoginOptions): Promise<Result<LoginResponse>> {
    const result = csEnvelope<LoginResponse>(
      await this.ctx.request({
        base: "rest",
        path: "users3/classroomlogin",
        method: "POST",
        json: this.ctx.csBody(options),
      }),
    );
    if (result.data) {
      this.adoptSession(result.data, options.password);
      this.rememberHowToReturn(options.password, () => this.classroomLogin(options));
    }
    return result;
  }

  /**
   * The school and class list shown on the ClassRoom login screen.
   * `executeGetClassRoomLoginInfoWithParam` — `POST {rest}/users3/getclassroominfo`.
   */
  async getClassroomLoginInfo(
    options: ClassroomLoginInfoOptions = {},
  ): Promise<Result<ClassroomLoginInfoResponse>> {
    return csEnvelope(
      await this.ctx.request({
        base: "rest",
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
    // Signing out is deliberate. Nothing should quietly sign back in.
    this.ctx.onSessionLapsed(undefined);
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

  /**
   * Arranges for a lapsed session to be signed back in, the way
   * `executeWithAutoLoginFor` does.
   *
   * Only with a password: it is the one credential `/users3/login` accepts, and
   * a client that was handed a session rather than a login has nothing to
   * repeat. Storing the whole call rather than the fields keeps the two login
   * kinds — normal and ClassRoom — from having to be told apart again later.
   */
  private rememberHowToReturn(
    password: string | undefined,
    signIn: () => Promise<Result<LoginResponse>>,
  ): void {
    if (!password) return;
    this.ctx.onSessionLapsed(async () => (await signIn()).error === null);
  }

  /** Copies a login response into the client's host and identity state. */
  private adoptSession(response: LoginResponse, password: string | undefined): void {
    this.ctx.setRestHost(response.restHost);
    const maintenance = response.maintCheckURL ?? response.maintchkurl;
    if (maintenance) this.ctx.config.maintenanceUrl = maintenance;
    this.ctx.setSession({
      // `uuid` first: a real tenant answers with that and no `userId`, and
      // sends it as a number. Everything downstream — the drive service's
      // login, the room's `authInfo` — needs it as a string.
      userId: scalar(response.uuid ?? response.userId),
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

/**
 * `CmUtils.toString`: the app runs every scalar through it, so a field the
 * server sends as a number arrives as a string everywhere it is used.
 */
function scalar(value: string | number | boolean | undefined): string | undefined {
  if (value === undefined || value === null) return undefined;
  return typeof value === "string" ? value : String(value);
}
