/**
 * Live classroom rooms (`classroom/collabo.tsp`).
 *
 * This is the feature the app is named for: teacher and pupils in one room,
 * sharing a note. Everything here is the *control* side — create a room, sign
 * in to it, hand out roles, read and write its settings. The stroke-by-stroke
 * sync that happens once everyone is inside runs over a raw socket protocol
 * documented separately in `classroom/collabo-socket-protocol.md`, which is not
 * HTTP and so is not wrapped here.
 *
 * Two generations of endpoint live side by side: the older `cosmos/*` calls and
 * the newer `mmjcloud/ShareView*` ones. Both are current, and both are POSTs
 * with a `multipart/form-data` body whose parts are JSON documents.
 *
 * Unlike the cookie-authenticated `CsCloudService` calls, these re-send the
 * user's credentials in an `authInfo` part every time. The client fills that in
 * from the session `auth.login()` established.
 */

import type { MetamojiContext } from "../../core/http.js";
import { jsonPassthrough } from "../../core/envelope.js";
import { filePart, jsonPart, optionalPart, type MultipartPart } from "../../core/multipart.js";
import type { Result } from "../../core/result.js";
import type { JsonRecord } from "../../core/types.js";
import type {
  CreateRoomOptions,
  GetMemberListOptions,
  GetRoomSettingOptions,
  GetShareViewListOptions,
  LoginRoomOptions,
  ModifyRoleOptions,
  NsAuthInfo,
  NsRoomInfo,
  PostGalleryOptions,
  RoomAuthOptions,
  RoomIdListOptions,
  ToolLoginOptions,
  UpdateRoomInfoOptions,
  UpdateRoomModeOptions,
  UpdateRoomSettingOptions,
} from "./interfaces.js";

/**
 * A device code the service will accept.
 *
 * `NsCollaboBgTaskForCreateUniqueID` makes one with `Random.nextInt()` and
 * keeps the decimal digits — a UUID in this field is refused along with the id
 * issued for it.
 */
export function newDeviceCode(): string {
  return String(Math.floor(Math.random() * 0x7fff_ffff) + 1);
}

export class Rooms {
  constructor(private readonly ctx: MetamojiContext) {}

  /**
   * Creates a room.
   * `NsCollaboURLConnectionForCreateRoom` — `POST {dc}/cosmos/CreateRoom`.
   */
  async create(options: CreateRoomOptions): Promise<Result<JsonRecord>> {
    return this.post("cosmos/CreateRoom", [
      jsonPart("authInfo", this.authInfo(options.authInfo)),
      jsonPart("roomInfo", options.roomInfo),
    ]);
  }

  /**
   * Signs in to a room, with its password or secure-room password if it has one.
   * `NsCollaboURLConnectionForLoginRoom` — `POST {dc}/cosmos/LoginRoom`.
   */
  async login(options: LoginRoomOptions): Promise<Result<JsonRecord>> {
    const parts: MultipartPart[] = [
      jsonPart("authInfo", this.authInfo(options.authInfo)),
      { name: "roomID", value: options.roomID },
    ];
    optionalPart(parts, "roomPassword2", options.roomPassword2);
    optionalPart(parts, "secureRoomPassword", options.secureRoomPassword);
    parts.push({ name: "localIp", value: options.localIp ?? "" });
    return this.post("cosmos/LoginRoom", parts);
  }

  /**
   * Issues an id for a guest — a participant joining without an account.
   * `NsCollaboURLConnectionForCreateUniqueID` — `POST {dc}/cosmos/CreateUniqueID`.
   */
  async createGuestId(options: RoomAuthOptions = {}): Promise<Result<JsonRecord>> {
    const c = this.ctx.config;
    // Ours to invent, and the seed for the id the service issues. Without a
    // code there is nothing to register, and an id invented locally is refused
    // with "bad device id or code".
    const deviceCode = options.authInfo?.deviceCode ?? c.deviceCode ?? newDeviceCode();
    // The guest form omits the user id and password entirely.
    const result = await this.post("cosmos/CreateUniqueID", [
      jsonPart("authInfo", {
        deviceCode,
        authType: "guest",
        productName: options.authInfo?.productName ?? c.productName,
        productVersion: options.authInfo?.productVersion ?? c.productVersion,
        locale: options.authInfo?.locale ?? c.locale,
      }),
    ]);

    // Adopted like the login response's `restHost`: every other `cosmos/*`
    // call carries the pair in its `authInfo`, and a caller that had to wire
    // it back by hand would mostly forget.
    const deviceId = result.data?.deviceID;
    if (typeof deviceId === "string" && deviceId.length > 0) {
      c.deviceId = deviceId;
      c.deviceCode = deviceCode;
    }
    return result;
  }

  /**
   * Reads a room's settings, the older way.
   * `NsCollaboURLConnectionForGetRoomInfo` — `POST {dc}/cosmos/GetRoomInfo`.
   */
  async get(options: RoomAuthOptions & { roomID: string }): Promise<Result<JsonRecord>> {
    return this.post("cosmos/GetRoomInfo", [
      jsonPart("authInfo", this.authInfo(options.authInfo)),
      { name: "roomID", value: options.roomID },
    ]);
  }

  /**
   * Grants or revokes a participant's role.
   * `NsCollaboURLConnectionForModifyRole` — `POST {dc}/cosmos/ModifyRole`.
   */
  async modifyRole(options: ModifyRoleOptions): Promise<Result<JsonRecord>> {
    const parts: MultipartPart[] = [
      jsonPart("authInfo", this.authInfo(options.authInfo)),
      { name: "roomID", value: options.roomID },
    ];
    optionalPart(parts, "addRole", options.addRole);
    optionalPart(parts, "delRole", options.delRole);
    return this.post("cosmos/ModifyRole", parts);
  }

  /**
   * Looks up who is in which room. The odd one out: it sends no `authInfo`,
   * relying on the session cookie instead.
   * `NsCollaboURLConnectionForGetMemberList` — `POST {dc}/cosmos/GetMemberList`.
   */
  async listMembers(options: GetMemberListOptions): Promise<Result<JsonRecord>> {
    return this.post("cosmos/GetMemberList", [
      jsonPart("memberList", {
        memberList: options.memberList,
        companyID: options.companyID ?? this.ctx.session.companyId ?? "",
      }),
    ]);
  }

  /**
   * Connection details for the relay server that carries the live sync socket.
   * `NsCollaboURLConnectionForGetServletInfo` —
   * `POST {dc}/cosmos/GetServletInfo?companyID={companyID}`.
   */
  async getServletInfo(options: { companyID?: string } = {}): Promise<Result<JsonRecord>> {
    return jsonPassthrough(
      await this.ctx.request({
        base: "dc",
        path: "cosmos/GetServletInfo",
        method: "POST",
        headerSet: "none",
        scope: "collabo",
        query: { companyID: options.companyID ?? this.ctx.session.companyId ?? "" },
      }),
    );
  }

  /**
   * Sets every role to the same mode at once — how the teacher freezes a room
   * or closes it. It posts to the same endpoint as `update`.
   * `NsCollaboURLConnectionForUpdateRoomMode` — `POST {dc}/cosmos/UpdateRoomInfo`.
   */
  async updateMode(options: UpdateRoomModeOptions): Promise<Result<JsonRecord>> {
    const roomInfo: NsRoomInfo = {
      ...options.roomInfo,
      role: { presenter: options.mode, speaker: options.mode, visitor: options.mode },
    };
    const parts: MultipartPart[] = [
      jsonPart("authInfo", this.authInfo(options.authInfo)),
      jsonPart("roomInfo", roomInfo),
    ];
    optionalPart(parts, "roomID", options.roomID);
    return this.post("cosmos/UpdateRoomInfo", parts);
  }

  /**
   * Updates a room's title, type, secure-room settings or per-role permissions.
   * `NsCollaboURLConnectionForUpdateRoomInfo` — `POST {dc}/cosmos/UpdateRoomInfo`.
   */
  async update(options: UpdateRoomInfoOptions): Promise<Result<JsonRecord>> {
    const parts: MultipartPart[] = [
      jsonPart("authInfo", this.authInfo(options.authInfo)),
      jsonPart("roomInfo", options.roomInfo),
    ];
    optionalPart(parts, "secureRoomPassword", options.secureRoomPassword);
    optionalPart(parts, "roomID", options.roomID);
    return this.post("cosmos/UpdateRoomInfo", parts);
  }

  /**
   * The signed-in user's role in each of the given rooms.
   * `NsCollaboURLConnectionForCheckRole` — `POST {dc}/mmjcloud/ShareViewGetMyRole`.
   */
  async checkRole(options: RoomIdListOptions): Promise<Result<JsonRecord>> {
    return this.post("mmjcloud/ShareViewGetMyRole", [
      jsonPart("authInfo", this.authInfo(options.authInfo)),
      jsonPart("roomIdList", options.roomIdList),
    ]);
  }

  /**
   * Titles and scheduled dates for the given rooms.
   * `NsCollaboURLConnectionForGetRoomTitleDate` — `POST {dc}/mmjcloud/ShareViewGetRoomInfo`.
   */
  async getTitleDate(options: RoomIdListOptions): Promise<Result<JsonRecord>> {
    return this.post("mmjcloud/ShareViewGetRoomInfo", [
      jsonPart("authInfo", this.authInfo(options.authInfo)),
      jsonPart("roomIdList", options.roomIdList),
    ]);
  }

  /**
   * Updates a room's title and scheduled date.
   * `NsCollaboURLConnectionForUpdateRoomTitleDate` — `POST {dc}/mmjcloud/ShareViewSetRoomInfo`.
   */
  async updateTitleDate(
    options: RoomAuthOptions & { roomInfo: NsRoomInfo },
  ): Promise<Result<JsonRecord>> {
    return this.post("mmjcloud/ShareViewSetRoomInfo", [
      jsonPart("authInfo", this.authInfo(options.authInfo)),
      jsonPart("roomInfo", options.roomInfo),
    ]);
  }

  /**
   * A room's detailed settings — publication window, role permissions.
   * `NsCollaboURLConnectionForGetRoomSetting` — `POST {dc}/mmjcloud/ShareViewGetRoomSetting`.
   */
  async getSetting(options: GetRoomSettingOptions): Promise<Result<JsonRecord>> {
    return this.post("mmjcloud/ShareViewGetRoomSetting", [
      jsonPart("authInfo", this.authInfo(options.authInfo)),
      { name: "roomId", value: options.roomId },
      { name: "key1", value: options.key1 ?? "#ClassRoom" },
    ]);
  }

  /**
   * Updates a room's detailed settings.
   * `NsCollaboURLConnectionForUpdateRoomSetting` — `POST {dc}/mmjcloud/ShareViewSetRoomSetting`.
   */
  async updateSetting(options: UpdateRoomSettingOptions): Promise<Result<JsonRecord>> {
    return this.post("mmjcloud/ShareViewSetRoomSetting", [
      jsonPart("authInfo", this.authInfo(options.authInfo)),
      jsonPart("roomSettingList", options.roomSettingList),
    ]);
  }

  /**
   * Lists the rooms the user owns or has joined, with filtering and sorting.
   * `NsCollaboURLConnectionForGetShareViewList` — `POST {dc}/mmjcloud/ShareViewGetList`.
   */
  async list(options: GetShareViewListOptions = {}): Promise<Result<JsonRecord>> {
    const parts: MultipartPart[] = [jsonPart("authInfo", this.authInfo(options.authInfo))];
    if (options.narrowCond) parts.push(jsonPart("narrowCond", options.narrowCond));
    if (options.shareDocList) parts.push(jsonPart("shareDocList", options.shareDocList));
    if (options.sortCond) parts.push(jsonPart("sortCond", options.sortCond));
    return this.post("mmjcloud/ShareViewGetList", parts);
  }

  /**
   * Gets a single sign-on token for mmjeditor2, the browser-based editor.
   * `NsCollaboURLConnectionForToolLogin` — `POST {dc}/mmjeditor2/CosmosToolLogin`.
   */
  async toolLogin(options: ToolLoginOptions): Promise<Result<JsonRecord>> {
    const session = this.ctx.session;
    const parts: MultipartPart[] = [{ name: "email", value: options.email }];
    optionalPart(parts, "password", options.password ?? session.password);
    optionalPart(parts, "qwd", options.qwd ?? session.qwd);
    parts.push(
      { name: "companyID", value: options.companyID ?? session.companyId ?? "" },
      { name: "locale", value: options.locale ?? this.ctx.config.locale },
      { name: "timezone", value: options.timezone ?? this.ctx.config.timezone },
    );
    return this.post("mmjeditor2/CosmosToolLogin", parts);
  }

  /**
   * Posts a note page to the room's gallery — how a teacher hands the current
   * screen to the class. The only room call that carries binary parts.
   * `NsCollaboURLConnectionForPostGallery` — `POST {dc}/gallery/PostForShareAnytime`.
   */
  async postToGallery(options: PostGalleryOptions): Promise<Result<JsonRecord>> {
    const c = this.ctx.config;
    const parts: MultipartPart[] = [
      { name: "cmd", value: "post" },
      { name: "roomId", value: options.roomId },
      { name: "productName", value: options.productName ?? c.productName },
      { name: "productVersion", value: options.productVersion ?? c.productVersion },
      { name: "encryptedHash", value: options.encryptedHash },
      { name: "title", value: options.title },
    ];
    optionalPart(parts, "text", options.text);
    parts.push(
      { name: "timezone", value: options.timezone ?? c.timezone },
      filePart("document", options.document, "application/vnd.metamoji.btshare"),
      filePart("image", options.image, "image/jpeg"),
    );
    return this.post("gallery/PostForShareAnytime", parts);
  }

  /**
   * The `authInfo` part, built from the client session. `password` wins over
   * `qwd` when both are known, and only one is ever sent — matching
   * `createAuthInfoParam`.
   */
  authInfo(overrides: Partial<NsAuthInfo> = {}): NsAuthInfo {
    const c = this.ctx.config;
    const s = this.ctx.session;
    const info: NsAuthInfo = {
      deviceID: overrides.deviceID ?? c.deviceId ?? "",
      deviceCode: overrides.deviceCode ?? c.deviceCode ?? "",
      authType: overrides.authType ?? "cabinet",
      // The account's *email*, not its numeric id. Every caller of
      // `createAuthInfoParam` passes its `email` field in this position
      // (`ScCollaboURLConnectionForSetScore` and siblings), and a school
      // account's email is its login name. The numeric id is refused with
      // "bad user", which reads like a wrong password and is not.
      userID: overrides.userID ?? s.email ?? s.loginName ?? s.userId,
      productName: overrides.productName ?? c.productName,
      productVersion: overrides.productVersion ?? c.productVersion,
      locale: overrides.locale ?? c.locale,
      companyID: overrides.companyID ?? s.companyId,
    };
    const password = overrides.userPassword ?? s.password;
    const qwd = overrides.qwd ?? s.qwd;
    if (password) info.userPassword = password;
    else if (qwd) info.qwd = qwd;
    return info;
  }

  private async post(path: string, multipart: MultipartPart[]): Promise<Result<JsonRecord>> {
    return jsonPassthrough(
      await this.ctx.request({
        base: "dc",
        path,
        method: "POST",
        headerSet: "none",
        scope: "collabo",
        multipart,
      }),
    );
  }
}
