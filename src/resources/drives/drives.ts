/**
 * Drives (shared folders), their membership, and share links (`drive/drive.tsp`).
 *
 * This is the control plane: it creates drives, manages who is in them and
 * hands out ids. The notes inside a drive are moved by one of the two data
 * planes — `sync.*` (`drive/sync-drive.tsp`) or `webdav.*` (`drive/webdav.tsp`).
 */

import { csEnvelope } from "../../core/envelope.js";
import type { MetamojiContext } from "../../core/http.js";
import type { Result } from "../../core/result.js";
import type { CsRequestBase, CsResponseBase } from "../../core/types.js";
import type {
  CreateDriveOptions,
  CreateDriveResponse,
  CreateLinkOptions,
  CreateLinkResponse,
  DriveEntryInfoResponse,
  DriveEntryResponse,
  DriveHomeResponse,
  ExcludeMembersOptions,
  InviteOptions,
  InviteResponse,
  ListMembersOptions,
  ListMembersResponse,
  PrivateDriveHomeResponse,
  ReInviteOptions,
  RenameDriveOptions,
  ReverseLinkOptions,
  ReverseLinkResponse,
  StorageUsageResponse,
  UpdateEntryHiddenOptions,
  UpdateMemberTypeOptions,
} from "./interfaces.js";

export class Drives {
  constructor(private readonly ctx: MetamojiContext) {}

  /**
   * Creates a drive.
   * `executeCreateDriveWithParams` — `POST {rest}/drives/create`.
   */
  async create(options: CreateDriveOptions): Promise<Result<CreateDriveResponse>> {
    return csEnvelope(
      await this.ctx.request({
        base: "rest",
        path: "drives/create",
        method: "POST",
        json: this.ctx.csBody(options),
      }),
    );
  }

  /**
   * Deletes a drive and its contents.
   * `executeDeleteDriveWithParams` — `DELETE {rest}/drives/{driveId}/data`.
   */
  async remove(driveId: string, options: CsRequestBase = {}): Promise<Result<CsResponseBase>> {
    return csEnvelope(
      await this.ctx.request({
        base: "rest",
        path: `drives/${encodeURIComponent(driveId)}/data`,
        method: "DELETE",
        json: this.ctx.csBody({ driveId, ...options }),
      }),
    );
  }

  /**
   * Renames a drive.
   * `executeRenameDriveWithParams` — `POST {rest}/drives/renamedrive`.
   */
  async rename(options: RenameDriveOptions): Promise<Result<CsResponseBase>> {
    return csEnvelope(
      await this.ctx.request({
        base: "rest",
        path: "drives/renamedrive",
        method: "POST",
        json: this.ctx.csBody(options),
      }),
    );
  }

  /**
   * A drive's home — the `homeDir` the sync data plane is addressed against.
   * By default the client adopts it, so `sync.*` calls work straight after.
   * `executeGetDriveHomeWithParams` — `GET {rest}/drives/{driveId}/home`.
   */
  async getHome(
    driveId: string,
    // No `CsRequestBase`: this call sends no body at all, so there would be
    // nowhere to put an override. Offering the fields and dropping them is the
    // one option that leaves a caller with no way to find out.
    options: { adopt?: boolean } = {},
  ): Promise<Result<DriveHomeResponse>> {
    const { adopt = true } = options;
    const result = csEnvelope<DriveHomeResponse>(
      await this.ctx.request({
        base: "rest",
        path: `drives/${encodeURIComponent(driveId)}/home`,
        method: "GET",
        // No body. `docs/typespec/README.md` says a JSON body rides along even
        // on GET, and for most commands it does — but `CsCloudService$30`
        // passes a literal null where the body goes. Sending one is not
        // harmless: the server answers 200 with no `homeDir` in it.
      }),
    );
    if (adopt && result.data) this.adoptHome(result.data);
    return result;
  }

  /**
   * The signed-in user's private drive.
   * `executeGetPrivateDriveHomeWithParams` — `GET {rest}/v3/users/login/home`.
   */
  async getPrivateHome(
    options: CsRequestBase & { adopt?: boolean } = {},
  ): Promise<Result<PrivateDriveHomeResponse>> {
    const { adopt = true, ...rest } = options;
    const result = csEnvelope<PrivateDriveHomeResponse>(
      await this.ctx.request({
        base: "rest",
        path: "v3/users/login/home",
        method: "GET",
        json: this.ctx.csBody(rest),
      }),
    );
    if (adopt && result.data) this.adoptHome(result.data);
    return result;
  }

  /**
   * Entries (notes and folders) in a drive.
   * `executeGetDriveEntryWithParams` — `GET {rest}/drives/entry`.
   */
  async listEntries(): Promise<Result<DriveEntryResponse>> {
    return csEnvelope(
      await this.ctx.request({
        base: "rest",
        path: "drives/entry",
        method: "GET",
        // No body, like `getHome`: `CsCloudService$28` passes a literal null.
      }),
    );
  }

  /**
   * Entry details, including the id-to-URI map.
   * `executeGetDriveEntryInfoWithParams` — `GET {rest}/drives/entryinfo`.
   */
  async getEntryInfo(options: CsRequestBase = {}): Promise<Result<DriveEntryInfoResponse>> {
    return csEnvelope(
      await this.ctx.request({
        base: "rest",
        path: "drives/entryinfo",
        method: "GET",
        json: this.ctx.csBody(options),
      }),
    );
  }

  /**
   * Shows or hides entries.
   * `executeUpdateEntryHiddenWithParams` — `POST {rest}/drives/entryhidden`.
   */
  async updateEntryHidden(options: UpdateEntryHiddenOptions): Promise<Result<CsResponseBase>> {
    return csEnvelope(
      await this.ctx.request({
        base: "rest",
        path: "drives/entryhidden",
        method: "POST",
        json: this.ctx.csBody(options),
      }),
    );
  }

  /**
   * A drive's members.
   * `executeGetDriveMemberListWithParams` — `GET {rest}/drives/{driveId}/allmembers2`.
   */
  async listMembers(
    driveId: string,
    options: Omit<ListMembersOptions, "driveId"> = {},
  ): Promise<Result<ListMembersResponse>> {
    return csEnvelope(
      await this.ctx.request({
        base: "rest",
        path: `drives/${encodeURIComponent(driveId)}/allmembers2`,
        method: "GET",
        json: this.ctx.csBody({ driveId, ...options }),
      }),
    );
  }

  /**
   * Invites members by email address or user id.
   * `executeInviteToDriveWithParam` — `POST {rest}/drives/{driveId}/invite2`.
   */
  async invite(
    driveId: string,
    options: Omit<InviteOptions, "driveId">,
  ): Promise<Result<InviteResponse>> {
    return csEnvelope(
      await this.ctx.request({
        base: "rest",
        path: `drives/${encodeURIComponent(driveId)}/invite2`,
        method: "POST",
        json: this.ctx.csBody({ driveId, ...options }),
      }),
    );
  }

  /**
   * Re-sends outstanding invitations.
   * `executeReInviteToDriveWithParam` — `POST {rest}/drives/{driveId}/reinvite`.
   */
  async reInvite(
    driveId: string,
    options: Omit<ReInviteOptions, "driveId"> = {},
  ): Promise<Result<CsResponseBase>> {
    return csEnvelope(
      await this.ctx.request({
        base: "rest",
        path: `drives/${encodeURIComponent(driveId)}/reinvite`,
        method: "POST",
        json: this.ctx.csBody({ driveId, ...options }),
      }),
    );
  }

  /**
   * Removes other members from a drive, an administrator action.
   * `executeExcludeMemberFromDriveWithParams` — `POST {rest}/drives/{driveId}/members/users`.
   */
  async excludeMembers(
    driveId: string,
    options: Omit<ExcludeMembersOptions, "driveId">,
  ): Promise<Result<CsResponseBase>> {
    return csEnvelope(
      await this.ctx.request({
        base: "rest",
        path: `drives/${encodeURIComponent(driveId)}/members/users`,
        method: "POST",
        json: this.ctx.csBody({ driveId, ...options }),
      }),
    );
  }

  /**
   * Leaves a drive — removes *yourself* from its membership.
   * `executeUnreferenceDriveWithParams` — `DELETE {rest}/drives/{driveId}/members/own`.
   */
  async leave(driveId: string, options: CsRequestBase = {}): Promise<Result<CsResponseBase>> {
    return csEnvelope(
      await this.ctx.request({
        base: "rest",
        path: `drives/${encodeURIComponent(driveId)}/members/own`,
        method: "DELETE",
        json: this.ctx.csBody({ driveId, ...options }),
      }),
    );
  }

  /**
   * Changes a member's role (owner, editor, ...).
   * `executeUpdateMemberTypeWithParams` — `POST {rest}/drives/{driveId}/members/type`.
   */
  async updateMemberType(
    driveId: string,
    options: Omit<UpdateMemberTypeOptions, "driveId">,
  ): Promise<Result<CsResponseBase>> {
    return csEnvelope(
      await this.ctx.request({
        base: "rest",
        path: `drives/${encodeURIComponent(driveId)}/members/type`,
        method: "POST",
        json: this.ctx.csBody({ driveId, ...options }),
      }),
    );
  }

  /**
   * Recalculates and returns storage used against the contract.
   * `executeGetStorageUsageWithParams` — `POST {rest}/users2/recalc`.
   */
  async getStorageUsage(options: CsRequestBase = {}): Promise<Result<StorageUsageResponse>> {
    return csEnvelope(
      await this.ctx.request({
        base: "rest",
        path: "users2/recalc",
        method: "POST",
        json: this.ctx.csBody(options),
      }),
    );
  }

  private adoptHome(home: DriveHomeResponse): void {
    this.ctx.setHomeDir(home.homeDir);
    // Not the same notice as the login response's maintCheckURL: this one is
    // per-drive and is what sync.getMaintenanceInfo() fetches.
    if (home.maintenanceText) this.ctx.config.syncMaintenanceUrl = home.maintenanceText;
  }
}

/** Share links to a document or a single page (`/link/*` in `drive/drive.tsp`). */
export class Links {
  constructor(private readonly ctx: MetamojiContext) {}

  /**
   * Issues a share link.
   * `executeCreateLinkWithParams` — `POST {rest}/link/create`.
   */
  async create(options: CreateLinkOptions): Promise<Result<CreateLinkResponse>> {
    return csEnvelope(
      await this.ctx.request({
        base: "rest",
        path: "link/create",
        method: "POST",
        json: this.ctx.csBody(options),
      }),
    );
  }

  /**
   * Resolves a share link back to the document and page it points at, revoking
   * it in the process — the Java method is `reverseLink`, and drive.tsp
   * describes it as invalidating the link.
   * `executeReverseLinkWithParams` — `POST {rest}/link/reverse`.
   */
  async reverse(options: ReverseLinkOptions): Promise<Result<ReverseLinkResponse>> {
    return csEnvelope(
      await this.ctx.request({
        base: "rest",
        path: "link/reverse",
        method: "POST",
        json: this.ctx.csBody(options),
      }),
    );
  }
}
