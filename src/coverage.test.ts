/**
 * Proof that every operation in `docs/typespec` has a method on the client.
 *
 * The operation list is re-derived from the `.tsp` files on every run rather
 * than being hard-coded, so adding an operation to the spec fails this test
 * until the wrapper catches up — which is the only way "complete coverage"
 * stays true after today.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { Metamoji } from "./client.js";

const here = dirname(fileURLToPath(import.meta.url));
const typespecRoot = join(here, "..", "..", "docs", "typespec");

/**
 * TypeSpec `Interface.operation` -> the client path that implements it.
 *
 * A few notes on the mapping:
 * - `Drives.createLink` / `reverseLink` move to `links.*`, since they are share
 *   links rather than drive operations.
 * - `MazecDictionaryUpdateCheck.getSysInfo` becomes `sysInfo.getMazecDictionary`,
 *   because it shares a filename with `SysInfo.getSysInfo` but not a host.
 * - `RemoteConverter.tentativeRegist` becomes `converter.register`, keeping the
 *   three steps of the job named for what they do.
 */
const COVERAGE: Record<string, string> = {
  // auth/auth.tsp
  "Auth.login": "auth.login",
  "Auth.classRoomLogin": "auth.classroomLogin",
  "Auth.getClassRoomLoginInfo": "auth.getClassroomLoginInfo",
  "Auth.logout": "auth.logout",
  "Auth.register": "auth.register",
  "Auth.withdraw": "auth.withdraw",
  "Auth.changePassword": "auth.changePassword",
  "Auth.resetPassword": "auth.resetPassword",
  "Auth.lockUser": "auth.lockUser",
  "Auth.unlockUser": "auth.unlockUser",
  "Auth.agreeEula": "auth.agreeEula",
  "Auth.getCredential": "auth.getCredential",

  // auth/user.tsp
  "Users.getUserInfo": "users.get",
  "Users.updateUserInfo": "users.update",
  "Users.getUserAndSystemInfo": "users.getWithSystemInfo",
  "Users.getAllUsers": "users.list",
  "Users.getAllGroups": "users.listGroups",
  "Users.getUserNames": "users.resolveNames",

  // drive/drive.tsp
  "Drives.createDrive": "drives.create",
  "Drives.deleteDrive": "drives.remove",
  "Drives.renameDrive": "drives.rename",
  "Drives.getDriveHome": "drives.getHome",
  "Drives.getPrivateDriveHome": "drives.getPrivateHome",
  "Drives.getDriveEntry": "drives.listEntries",
  "Drives.getDriveEntryInfo": "drives.getEntryInfo",
  "Drives.updateEntryHidden": "drives.updateEntryHidden",
  "Drives.getDriveMemberList": "drives.listMembers",
  "Drives.inviteToDrive": "drives.invite",
  "Drives.reInviteToDrive": "drives.reInvite",
  "Drives.excludeMemberFromDrive": "drives.excludeMembers",
  "Drives.unreferenceDrive": "drives.leave",
  "Drives.updateMemberType": "drives.updateMemberType",
  "Drives.getStorageUsage": "drives.getStorageUsage",
  "Drives.createLink": "links.create",
  "Drives.reverseLink": "links.reverse",

  // drive/sync-drive.tsp
  "SyncDrive.login": "sync.login",
  "SyncDrive.syncStart": "sync.syncStart",
  "SyncDrive.getDriveData": "sync.getDriveData",
  "SyncDrive.getDriveLastUpdateRevision": "sync.getDriveLastUpdateRevision",
  "SyncDrive.getDriveProperties": "sync.getDriveProperties",
  "SyncDrive.putDriveData": "sync.putDriveData",
  "SyncDrive.getDocumentData": "sync.getDocumentData",
  "SyncDrive.getDocumentMeta": "sync.getDocumentMeta",
  "SyncDrive.getDocumentSearchData": "sync.getDocumentSearchData",
  "SyncDrive.getDocumentThumbnail": "sync.getDocumentThumbnail",
  "SyncDrive.putDocumentData": "sync.putDocumentData",
  "SyncDrive.deleteDocumentData": "sync.deleteDocumentData",
  "SyncDrive.turnOnEditFlag": "sync.turnOnEditFlag",
  "SyncDrive.turnOffEditFlag": "sync.turnOffEditFlag",
  "SyncDrive.getMaintenanceInfo": "sync.getMaintenanceInfo",

  // drive/webdav.tsp
  "WebDavStorage.get": "webdav.get",
  "WebDavStorage.put": "webdav.put",
  "WebDavStorage.head": "webdav.head",
  "WebDavStorage.delete": "webdav.remove",
  "WebDavStorage.createDirectory": "webdav.createDirectory",
  "WebDavStorage.move": "webdav.move",
  "WebDavStorage.propfind": "webdav.propfind",
  "WebDavStorage.proppatch": "webdav.proppatch",

  // classroom/classbox.tsp
  "ClassBoxes.createClassBox": "classBoxes.create",
  "ClassBoxes.joinClassBox": "classBoxes.join",
  "ClassBoxes.updateClassBoxInfo": "classBoxes.update",
  "ClassBoxes.getClassCode": "classBoxes.getJoinCode",

  // classroom/collabo.tsp
  "Collabo.createRoom": "rooms.create",
  "Collabo.loginRoom": "rooms.login",
  "Collabo.createUniqueId": "rooms.createGuestId",
  "Collabo.getRoomInfo": "rooms.get",
  "Collabo.modifyRole": "rooms.modifyRole",
  "Collabo.getMemberList": "rooms.listMembers",
  "Collabo.getServletInfo": "rooms.getServletInfo",
  "Collabo.updateRoomMode": "rooms.updateMode",
  "Collabo.updateRoomInfo": "rooms.update",
  "Collabo.checkRole": "rooms.checkRole",
  "Collabo.getRoomTitleDate": "rooms.getTitleDate",
  "Collabo.updateRoomTitleDate": "rooms.updateTitleDate",
  "Collabo.getRoomSetting": "rooms.getSetting",
  "Collabo.updateRoomSetting": "rooms.updateSetting",
  "Collabo.getShareViewList": "rooms.list",
  "Collabo.toolLogin": "rooms.toolLogin",
  "Collabo.postGallery": "rooms.postToGallery",

  // classroom/distribute.tsp
  "Distribute.distributeClass": "distribute.distributeClass",
  "Distribute.getDistributeStatus": "distribute.getStatus",
  "Distribute.postCrashLogs": "distribute.postCrashLogs",

  // classroom/gradebook.tsp
  "Gradebook.getScoreList": "gradebook.getScores",
  "Gradebook.getTestingLogList": "gradebook.getTestingLog",
  "Gradebook.setReport": "gradebook.setReport",
  "Gradebook.setScore": "gradebook.setScore",

  // media/gallery-media.tsp
  "GalleryMedia.login": "media.login",
  "GalleryMedia.getMediaList": "media.list",
  "GalleryMedia.getMediaStatus": "media.getStatus",
  "GalleryMedia.tentativeRegistMedia": "media.register",
  "GalleryMedia.uploadMedia": "media.upload",
  "GalleryMedia.getMediaFile": "media.download",
  "GalleryMedia.setMediaTitle": "media.setTitles",
  "GalleryMedia.deleteMediaFile": "media.remove",

  // media/video.tsp
  "VideoNotes.getClipList": "video.list",
  "VideoNotes.getClipCount": "video.count",
  "VideoNotes.getClipInfo": "video.get",
  "VideoNotes.getPosterFrame": "video.getPosterFrame",
  "VideoNotes.deleteClip": "video.remove",
  "VideoNotes.exportClip": "video.exportClip",
  "VideoNotes.getServerCoInfo": "video.getCompanyInfo",
  "VideoNotes.getServerStatus": "video.getServerStatus",
  "VideoNotes.getUploadPoint": "video.getUploadPoint",
  "VideoNotes.reserve": "video.reserve",
  "VideoNotes.uploadFile": "video.uploadFile",

  // messaging/messaging.tsp
  "DirectMessages.getDirectMessage": "messages.get",
  "DirectMessages.deleteDirectMessage": "messages.remove",

  // licensing/license.tsp
  "Licensing.inkAmountSync": "licensing.inkAmountSync",
  "Licensing.purchaseLicense": "licensing.purchase",
  "Licensing.dummyPurchaseLicense": "licensing.dummyPurchase",
  "Licensing.productLicenseSync": "licensing.productLicenseSync",
  "Licensing.simulationPurchase": "licensing.simulatePurchase",
  "Licensing.getShareInfo": "licensing.getShareInfo",

  // licensing/license-activation.tsp
  "LicenseActivation.activate": "licenseActivation.activate",
  "LicenseActivation.getRemainingDays": "licenseActivation.getRemainingDays",

  // licensing/mazec-purchase.tsp
  "MazecDictionaryUpdateCheck.getSysInfo": "sysInfo.getMazecDictionary",

  // system/settings.tsp
  "ClientSettings.getClientSettings": "settings.get",
  "ClientSettings.setClientSettings": "settings.set",
  "ClientSettings.getClientFile": "settings.getFile",
  "ClientSettings.setClientFile": "settings.setFile",

  // system/sysinfo.tsp
  "SysInfo.getSysInfo": "sysInfo.get",

  // system/misc.tsp
  "Misc.getMaintenanceInfo": "system.getMaintenanceInfo",
  "Misc.addApiLog": "system.addApiLog",
  "Misc.postCrashLogs": "system.postCrashLogs",

  // legacy/library-store.tsp
  "LibraryStore.login": "libraryStore.login",
  "LibraryStore.getAllPages": "libraryStore.listPages",
  "LibraryStore.getPage": "libraryStore.getPage",
  "LibraryStore.downloadProduct": "libraryStore.downloadProduct",

  // legacy/remote-converter.tsp
  "RemoteConverter.tentativeRegist": "converter.register",
  "RemoteConverter.convertRequest": "converter.convert",
  "RemoteConverter.getConvertedFile": "converter.getConvertedFile",
};

function tspFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...tspFiles(path));
    else if (entry.endsWith(".tsp")) found.push(path);
  }
  return found;
}

/** `Interface.operation` for every operation declared in the spec. */
function specOperations(): { key: string; file: string; route?: string }[] {
  const operations: { key: string; file: string; route?: string }[] = [];
  for (const file of tspFiles(typespecRoot).sort()) {
    const source = readFileSync(file, "utf8");
    let currentInterface = "";
    let route: string | undefined;
    const pattern =
      /interface\s+(\w+)\s*\{|^[ \t]*@route\("([^"]*)"\)|^[ \t]*op\s+(\w+)\s*\(/gm;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source))) {
      if (match[1]) currentInterface = match[1];
      else if (match[2] !== undefined) route = match[2];
      else {
        operations.push({
          key: `${currentInterface}.${match[3]}`,
          file: relative(typespecRoot, file),
          route,
        });
        route = undefined;
      }
    }
  }
  return operations;
}

/**
 * Paths the client needs that the spec does not declare.
 *
 * `mpsroot/RequestServlet` is the school lookup — the call that turns a school
 * id into the tenant host every later call is addressed against. Nothing works
 * without it, and it is served by an older servlet that predates the REST API,
 * which is presumably why the recovered spec has no operation for it.
 */
const UNDECLARED = new Set(["mpsroot/RequestServlet"]);

function normalise(route: string): string {
  return route
    .replace(/^\//, "")
    .replace(/\?.*$/, "")
    .replace(/\$\{[^}]*\}/g, "*")
    .replace(/\{[^}]*\}/g, "*");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Every path a resource asks for, read out of the source.
 *
 * Only literals in a path position — the `path:` of a request spec, and the
 * first argument of a resource's own `post`/`send`/`spec` helper. Scanning all
 * strings instead would sweep up content types and XML fragments, which look
 * enough like paths to be indistinguishable.
 */
function requestPaths(): { file: string; path: string }[] {
  const found: { file: string; path: string }[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".ts") && entry !== "interfaces.ts") collect(full);
    }
  };
  const collect = (file: string): void => {
    const source = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const add = (literal: string) => {
      const path = literal.slice(1, -1);
      if (!path.includes("/") || /^[a-z][a-z0-9+.-]*:\/\//i.test(path)) return;
      found.push({ file: relative(join(here, "resources"), file), path });
    };
    for (const m of source.matchAll(/\bpath:\s*(`[^`\n]*`|"[^"\n]*")/g)) add(m[1]);
    for (const m of source.matchAll(/this\.\w+\(\s*(?:[^,()]*,\s*)?(`[^`\n]*`|"[^"\n]*")/g)) {
      add(m[1]);
    }
  };
  walk(join(here, "resources"));
  return found;
}

function resolve(client: Metamoji, path: string): unknown {
  const [resource, method] = path.split(".");
  const target = (client as unknown as Record<string, Record<string, unknown>>)[resource];
  return target?.[method];
}

describe("TypeSpec coverage", () => {
  const operations = specOperations();
  const client = new Metamoji();

  it("finds the spec", () => {
    expect(operations.length).toBeGreaterThan(100);
  });

  it("maps every spec operation to a client method", () => {
    const missing = operations
      .filter(({ key }) => !(key in COVERAGE))
      .map(({ key, file }) => `${key} (${file})`);
    expect(missing).toEqual([]);
  });

  it("maps nothing that is not in the spec", () => {
    const declared = new Set(operations.map((o) => o.key));
    const extra = Object.keys(COVERAGE).filter((key) => !declared.has(key));
    expect(extra).toEqual([]);
  });

  it.each(Object.entries(COVERAGE))("%s is implemented by %s", (_key, path) => {
    expect(typeof resolve(client, path)).toBe("function");
  });

  it("addresses only paths the spec declares", () => {
    // The test above proves a method exists; this one proves it goes somewhere
    // real. Nothing else compares the two — a wrapper can be written against a
    // route that was mistyped, or against one the spec has since renamed, and
    // every other test in this repo will still pass.
    const declared = operations
      .map((o) => o.route)
      .filter((route): route is string => route !== undefined)
      .map(normalise);
    const matches = (path: string) => {
      const candidate = normalise(path);
      // `*` stands for an interpolated id on one side and a path parameter on
      // the other, so the comparison is by pattern rather than by string.
      return declared.some((route) =>
        new RegExp(`^${route.split("*").map(escapeRegExp).join("[^/]*")}$`).test(candidate) ||
        new RegExp(`^${candidate.split("*").map(escapeRegExp).join("[^/]*")}$`).test(route),
      );
    };

    const strays = requestPaths()
      .filter((p) => !UNDECLARED.has(normalise(p.path)))
      .filter((p) => !matches(p.path));
    expect(strays.map((p) => `${p.file}: ${p.path}`)).toEqual([]);
  });

  it("checks a path for most of the operations, so the count cannot quietly fall", () => {
    // The paths are read out of the source rather than by calling anything, so
    // this is a floor rather than a total: a resource that builds its path some
    // new way would drop out of the check above without failing it.
    expect(requestPaths().length).toBeGreaterThanOrEqual(100);
  });

  it("maps each operation to a distinct method", () => {
    const seen = new Map<string, string>();
    const collisions: string[] = [];
    for (const [key, path] of Object.entries(COVERAGE)) {
      const previous = seen.get(path);
      if (previous) collisions.push(`${previous} and ${key} both map to ${path}`);
      else seen.set(path, key);
    }
    expect(collisions).toEqual([]);
  });
});
