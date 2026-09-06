/**
 * Drive and document sync — the newer REST data plane (`drive/sync-drive.tsp`).
 *
 * `SdCloudService` runs alongside the WebDAV data plane rather than replacing
 * it, and it is deliberately its own world: a separate cookie jar, a separate
 * header set, and a base URL that is not a constant but the `homeDir` of the
 * drive being synced. Set `homeDir` on the client (or let `drives.getHome()`
 * do it), or pass one per call.
 *
 * Two details that surprise people are faithful to the app, not mistakes here:
 * GET and DELETE send no body at all — unlike every `CsCloudService` call — and
 * the booleans that do get sent go on the wire as the *strings* `"true"` and
 * `"false"`, because `toMap()` stores them as `String`.
 */

import { joinUrl } from "../../core/url.js";
import { SD_NOT_LOGIN, sdEnvelope } from "../../core/envelope.js";
import type { HttpResult, MetamojiContext, RequestSpec } from "../../core/http.js";
import { fail, ok, type Result } from "../../core/result.js";
import type { BinaryPayload, JsonRecord } from "../../core/types.js";
import type {
  DeleteDocumentDataOptions,
  DeleteDocumentDataResponse,
  DocumentMetaResponse,
  DriveLastUpdateRevisionResponse,
  DrivePropertiesResponse,
  GetDocumentDataOptions,
  PutDocumentDataOptions,
  PutDocumentDataResponse,
  PutDriveDataResponse,
  SdResponseBase,
  SyncLoginOptions,
  SyncLoginResponse,
  SyncScope,
  SyncStartResponse,
  TurnOffEditFlagOptions,
  TurnOnEditFlagOptions,
  TurnOnEditFlagResponse,
} from "./interfaces.js";

export class Sync {
  constructor(private readonly ctx: MetamojiContext) {}

  /**
   * Signs in to a drive's host. This is a different session from
   * `auth.login()` — a separate cookie jar against, usually, the same server.
   * `SdCloudService.executeLoginWithParams` — `POST {homeDir}/rest/users/login`.
   *
   * The app discards any existing cookie for the host first, so this does too.
   */
  async login(options: SyncLoginOptions = {}): Promise<Result<SyncLoginResponse>> {
    const { homeDir, ...body } = options;
    const session = this.ctx.session;
    // All three keys, always. `SdLoginParams.toMap()` puts `userId`,
    // `password` and `qwd` in unconditionally, and `CmJson.createJsonValue`
    // turns a null into `JSONObject.NULL` rather than dropping the key — so
    // the wire always carries three fields, one of them null. Omitting the
    // unused one is not equivalent: the server answers 500.
    const payload = {
      userId: body.userId ?? session.userId ?? null,
      password: body.password ?? session.password ?? null,
      qwd: body.qwd ?? session.qwd ?? null,
    };
    this.ctx.cookies.clear("sd");
    return sdEnvelope(
      await this.ctx.request(this.spec(homeDir, "rest/users/login", "POST", { json: payload })),
    );
  }

  /**
   * Opens a sync session for a drive.
   * `executeSyncStartWithParams` — `GET {homeDir}/rest/drives/{driveId}/syncstart`.
   */
  async syncStart(driveId: string, options: SyncScope = {}): Promise<Result<SyncStartResponse>> {
    return this.send((o) =>
      this.ctx.request(this.spec(o.homeDir, `rest/drives/${enc(driveId)}/syncstart`, "GET")),
      options,
      sdEnvelope<SyncStartResponse>,
    );
  }

  /**
   * Downloads a drive's whole payload (an archive) since a revision.
   * `executeGetDriveDataWithParams` — `GET {homeDir}/rest/drives/{driveId}/data`.
   */
  async getDriveData(
    driveId: string,
    options: SyncScope & { lastSyncRevision?: string } = {},
  ): Promise<Result<BinaryPayload>> {
    return this.download((o) =>
      this.ctx.request(
        this.spec(o.homeDir, `rest/drives/${enc(driveId)}/data`, "GET", {
          // A missing revision is sent as an empty value, not omitted.
          query: { lastsyncrev: options.lastSyncRevision ?? "" },
        }),
      ),
      options,
    );
  }

  /**
   * The drive's latest revision, for deciding whether a sync is needed at all.
   * `executeGetDriveLastUpdateRevisionWithParams` —
   * `GET {homeDir}/rest/drives/{driveId}/lastupdaterevision`.
   */
  async getDriveLastUpdateRevision(
    driveId: string,
    options: SyncScope = {},
  ): Promise<Result<DriveLastUpdateRevisionResponse>> {
    return this.send((o) =>
      this.ctx.request(
        this.spec(o.homeDir, `rest/drives/${enc(driveId)}/lastupdaterevision`, "GET"),
      ),
      options,
      sdEnvelope<DriveLastUpdateRevisionResponse>,
    );
  }

  /**
   * Drive properties, currently just storage used.
   * `executeGetDrivePropertiesWithParams` — `GET {homeDir}/rest/drives/{driveId}/properties`.
   */
  async getDriveProperties(
    driveId: string,
    options: SyncScope = {},
  ): Promise<Result<DrivePropertiesResponse>> {
    return this.send((o) =>
      this.ctx.request(this.spec(o.homeDir, `rest/drives/${enc(driveId)}/properties`, "GET")),
      options,
      sdEnvelope<DrivePropertiesResponse>,
    );
  }

  /**
   * Uploads a drive's whole payload, overwriting it. The body is the archive's
   * bytes as `application/zip`, not JSON.
   * `executePutDriveDataWithParams` — `PUT {homeDir}/rest/drives/{driveId}/data`.
   */
  async putDriveData(
    driveId: string,
    data: Uint8Array | ArrayBuffer,
    options: SyncScope = {},
  ): Promise<Result<PutDriveDataResponse>> {
    return this.send((o) =>
      this.ctx.request(
        this.spec(o.homeDir, `rest/drives/${enc(driveId)}/data`, "PUT", {
          raw: { body: bytes(data), contentType: "application/zip" },
        }),
      ),
      options,
      sdEnvelope<PutDriveDataResponse>,
    );
  }

  /**
   * Downloads a document's payload.
   * `executeGetDocumentDataWithParams` —
   * `GET {homeDir}/rest/drives/{driveId}/documents/{documentId}/data`.
   */
  async getDocumentData(
    driveId: string,
    documentId: string,
    options: GetDocumentDataOptions = {},
  ): Promise<Result<BinaryPayload>> {
    // The app appends `caching=1` when it has no signed-in user.
    const caching = options.caching ?? !this.ctx.session.userId;
    return this.download((o) =>
      this.ctx.request(
        this.spec(o.homeDir, `rest/drives/${enc(driveId)}/documents/${enc(documentId)}/data`, "GET", {
          query: { revision: options.revision ?? "", ...(caching ? { caching: 1 } : {}) },
        }),
      ),
      options,
    );
  }

  /**
   * A document's metadata.
   * `executeGetDocumentMetaWithParams` —
   * `GET {homeDir}/rest/drives/{driveId}/documents/{documentId}/meta`.
   */
  async getDocumentMeta(
    driveId: string,
    documentId: string,
    options: SyncScope = {},
  ): Promise<Result<DocumentMetaResponse>> {
    return this.send((o) =>
      this.ctx.request(
        this.spec(o.homeDir, `rest/drives/${enc(driveId)}/documents/${enc(documentId)}/meta`, "GET"),
      ),
      options,
      sdEnvelope<DocumentMetaResponse>,
    );
  }

  /**
   * A document's search data (its full-text index).
   * `executeGetDocumentSearchDataWithParams` —
   * `GET {homeDir}/rest/drives/{driveId}/documents/{documentId}/searchdata`.
   */
  async getDocumentSearchData(
    driveId: string,
    documentId: string,
    options: SyncScope & { revision?: string } = {},
  ): Promise<Result<BinaryPayload>> {
    return this.download((o) =>
      this.ctx.request(
        this.spec(
          o.homeDir,
          `rest/drives/${enc(driveId)}/documents/${enc(documentId)}/searchdata`,
          "GET",
          { query: { revision: options.revision ?? "" } },
        ),
      ),
      options,
    );
  }

  /**
   * A document's thumbnail image.
   * `executeGetDocumentThumbnailWithParams` —
   * `GET {homeDir}/rest/drives/{driveId}/documents/{documentId}/thumbnail`.
   */
  async getDocumentThumbnail(
    driveId: string,
    documentId: string,
    options: SyncScope & { revision?: string } = {},
  ): Promise<Result<BinaryPayload>> {
    return this.download((o) =>
      this.ctx.request(
        this.spec(
          o.homeDir,
          `rest/drives/${enc(driveId)}/documents/${enc(documentId)}/thumbnail`,
          "GET",
          { query: { revision: options.revision ?? "" } },
        ),
      ),
      options,
    );
  }

  /**
   * Uploads a document, creating or overwriting it.
   * `executePutDocumentDataWithParams` —
   * `PUT {homeDir}/rest/drives/{driveId}/documents/{documentId}/data`.
   *
   * The trailing `cnechk=1` is a fixed literal the app always appends; it looks
   * like a transposition of "cnechk"/"cncheck" but is reproduced as-is.
   */
  async putDocumentData(
    driveId: string,
    documentId: string,
    data: Uint8Array | ArrayBuffer,
    options: PutDocumentDataOptions = {},
  ): Promise<Result<PutDocumentDataResponse>> {
    return this.send((o) =>
      this.ctx.request(
        this.spec(
          o.homeDir,
          `rest/drives/${enc(driveId)}/documents/${enc(documentId)}/data`,
          "PUT",
          {
            query: {
              check: options.check,
              fromv2: options.fromV2 === undefined ? undefined : boolString(options.fromV2),
              cnechk: 1,
            },
            raw: { body: bytes(data), contentType: "application/zip" },
          },
        ),
      ),
      options,
      sdEnvelope<PutDocumentDataResponse>,
    );
  }

  /**
   * Deletes a document.
   * `executeDeleteDocumentDataWithParams` —
   * `DELETE {homeDir}/rest/drives/{driveId}/documents/{documentId}/data`.
   */
  async deleteDocumentData(
    driveId: string,
    documentId: string,
    options: DeleteDocumentDataOptions = {},
  ): Promise<Result<DeleteDocumentDataResponse>> {
    const update = options.update instanceof Date
      ? String(options.update.getTime())
      : options.update === undefined
        ? undefined
        : String(options.update);

    return this.send((o) =>
      this.ctx.request(
        this.spec(
          o.homeDir,
          `rest/drives/${enc(driveId)}/documents/${enc(documentId)}/data`,
          "DELETE",
          { query: { check: options.check, update } },
        ),
      ),
      options,
      sdEnvelope<DeleteDocumentDataResponse>,
    );
  }

  /**
   * Takes the edit flag — the app's exclusive lock on a document.
   * `executeTurnOnEditFlagWithParams` —
   * `POST {homeDir}/rest/drives/{driveId}/documents/{documentId}/editflag/turnon`.
   *
   * `documentId` is used only in the path; it is not part of the JSON body.
   */
  async turnOnEditFlag(
    driveId: string,
    documentId: string,
    options: TurnOnEditFlagOptions = {},
  ): Promise<Result<TurnOnEditFlagResponse>> {
    const body: JsonRecord = {};
    if (options.locationId !== undefined) body.locationId = options.locationId;
    if (options.contentsRevision !== undefined) body.contentsRevision = options.contentsRevision;
    if (options.force !== undefined) body.force = boolString(options.force);

    return this.send((o) =>
      this.ctx.request(
        this.spec(
          o.homeDir,
          `rest/drives/${enc(driveId)}/documents/${enc(documentId)}/editflag/turnon`,
          "POST",
          { json: body },
        ),
      ),
      options,
      sdEnvelope<TurnOnEditFlagResponse>,
    );
  }

  /**
   * Releases the edit flag.
   * `executeTurnOffEditFlagWithParams` —
   * `POST {homeDir}/rest/drives/{driveId}/documents/{documentId}/editflag/turnoff`.
   *
   * `documentId` and `contentsRevision` both default to the string `"0"` in the
   * app (`DOCUMENT_ID_NOT_SET` / `CONTENTS_REVISION_ID_NOT_SET`).
   */
  async turnOffEditFlag(
    driveId: string,
    documentId: string,
    options: TurnOffEditFlagOptions = {},
  ): Promise<Result<SdResponseBase>> {
    const body: JsonRecord = {};
    if (options.locationId !== undefined) body.locationId = options.locationId;
    if (options.contentsRevision !== undefined) body.contentsRevision = options.contentsRevision;
    if (options.isAll !== undefined) body.isAll = boolString(options.isAll);

    return this.send((o) =>
      this.ctx.request(
        this.spec(
          o.homeDir,
          `rest/drives/${enc(driveId)}/documents/${enc(documentId)}/editflag/turnoff`,
          "POST",
          { json: body },
        ),
      ),
      options,
      sdEnvelope<SdResponseBase>,
    );
  }

  /**
   * Fetches the maintenance notice. Unlike every other call this one does not
   * hang off `homeDir`: it GETs an absolute URL the server handed out earlier
   * (`SdMODrive.getMaintenanceText()`), which `drives.getHome()` records.
   * `executeGetMaintenanceInfoWithParams`.
   */
  async getMaintenanceInfo(maintenanceUrl?: string): Promise<Result<SdResponseBase>> {
    const url = maintenanceUrl ?? this.ctx.config.syncMaintenanceUrl;
    if (!url) {
      return fail({
        name: "not_configured",
        message:
          "No maintenance URL. Pass one, or call drives.getHome() first — the server supplies " +
          "it as `maintenanceText`.",
      });
    }
    const result = await this.ctx.request({
      base: "absolute",
      path: url,
      method: "GET",
      headerSet: "sd",
      scope: "sd",
      parse: "auto",
    });
    if (result.error) return fail(result.error);
    // The body is a notice, not an envelope; only its presence is meaningful.
    const text = result.data.text?.trim() ?? "";
    return ok({
      httpStatusCode: result.data.status,
      isUnderMaintenance: text.length > 0,
      maintMessage: text || undefined,
    });
  }

  /** Builds a request against a drive host, with the sync headers and cookie jar. */
  private spec(
    homeDir: string | undefined,
    path: string,
    method: string,
    extra: Partial<RequestSpec> = {},
  ): RequestSpec {
    const base = homeDir
      ? ({ base: "absolute" as const, path: joinUrl(homeDir, path) })
      : ({ base: "home" as const, path });
    return { ...base, method, headerSet: "sd", scope: "sd", ...extra };
  }

  /**
   * Runs a call, and on `NOT_LOGIN_EXCEPTION` logs back in and retries once —
   * the `executeWithAutoLoginFor` wrapper, which the app applies to every
   * sync call rather than exposing as an endpoint of its own.
   */
  private async send<T extends SdResponseBase>(
    run: (options: SyncScope) => Promise<Result<HttpResult>>,
    options: SyncScope,
    envelope: (result: Result<HttpResult>) => Result<T>,
  ): Promise<Result<T>> {
    const first = envelope(await run(options));
    if (!this.shouldRetry(first)) return first;
    const relogin = await this.login({ homeDir: options.homeDir });
    if (relogin.error) return first;
    return envelope(await run(options));
  }

  private async download(
    run: (options: SyncScope) => Promise<Result<HttpResult>>,
    options: SyncScope,
  ): Promise<Result<BinaryPayload>> {
    const toPayload = (
      result: Result<HttpResult>,
    ): Result<BinaryPayload> => {
      if (result.error) return fail(result.error);
      // A JSON body here is an error envelope, not the file.
      const envelope = result.data.json as SdResponseBase | undefined;
      if (envelope && typeof envelope.errorCode === "number" && envelope.errorCode !== 0) {
        return sdEnvelope<BinaryPayload>(result);
      }
      return ok({
        bytes: result.data.bytes,
        mimeType: result.data.headers["content-type"],
        httpStatusCode: result.data.status,
      });
    };

    const first = toPayload(await run(options));
    if (!this.shouldRetry(first)) return first;
    const relogin = await this.login({ homeDir: options.homeDir });
    if (relogin.error) return first;
    return toPayload(await run(options));
  }

  private shouldRetry(result: Result<unknown>): boolean {
    return this.ctx.config.autoLogin && result.error?.code === SD_NOT_LOGIN;
  }
}

function enc(value: string): string {
  return encodeURIComponent(value);
}

function bytes(data: Uint8Array | ArrayBuffer): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

/** `toMap()` stores these as `String`, so they travel as "true"/"false". */
function boolString(value: boolean): "true" | "false" {
  return value ? "true" : "false";
}
