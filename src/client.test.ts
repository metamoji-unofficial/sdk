/**
 * Behavioural tests against a stub transport.
 *
 * These cover the parts of the client that encode a decision about the wire
 * format — the ones where a plausible-looking implementation would be wrong:
 * bodies on GET requests, boolean-as-string in the sync subsystem, indexed
 * multipart parts in gallery-media, per-subsystem cookie scopes, and the three
 * documented re-login retries.
 */

import { describe, expect, it } from "vitest";

import { Metamoji } from "./client.js";
import type { Transport, TransportRequest, TransportResponse } from "./core/transport.js";

interface Recorded extends TransportRequest {
  bodyText: string;
}

interface StubReply {
  status?: number;
  json?: unknown;
  text?: string;
  bytes?: Uint8Array;
  headers?: Record<string, string>;
  setCookie?: string[];
}

/** A transport that records what it was given and replays scripted replies. */
function stub(replies: StubReply[] | StubReply = {}) {
  const queue = Array.isArray(replies) ? [...replies] : [replies];
  const sent: Recorded[] = [];

  const transport: Transport = async (request) => {
    sent.push({
      ...request,
      bodyText: typeof request.body === "string"
        ? request.body
        : request.body
          ? new TextDecoder().decode(request.body)
          : "",
    });

    const reply = queue.length > 1 ? queue.shift()! : (queue[0] ?? {});
    const headers = { ...reply.headers };
    let body = reply.bytes ?? new Uint8Array();
    if (reply.json !== undefined) {
      headers["content-type"] ??= "application/json";
      body = new TextEncoder().encode(JSON.stringify(reply.json));
    } else if (reply.text !== undefined) {
      headers["content-type"] ??= "text/plain";
      body = new TextEncoder().encode(reply.text);
    }
    const response: TransportResponse = {
      status: reply.status ?? 200,
      statusText: "",
      headers,
      setCookie: reply.setCookie ?? [],
      body,
    };
    return response;
  };

  return { transport, sent };
}

/** Splits a recorded multipart body into `name -> { value, headers }`. */
function parseMultipart(request: Recorded) {
  const boundary = /boundary=(.+)$/.exec(request.headers["content-type"] ?? "")?.[1];
  if (!boundary) throw new Error("not a multipart request");
  const parts = new Map<string, { value: string; contentType?: string; filename?: string }>();

  for (const chunk of request.bodyText.split(`--${boundary}`)) {
    const split = chunk.indexOf("\r\n\r\n");
    if (split === -1) continue;
    const head = chunk.slice(0, split);
    const name = /name="([^"]*)"/.exec(head)?.[1];
    if (!name) continue;
    parts.set(name, {
      value: chunk.slice(split + 4).replace(/\r\n$/, ""),
      contentType: /Content-Type:\s*(.+)/i.exec(head)?.[1]?.trim(),
      filename: /filename="([^"]*)"/.exec(head)?.[1],
    });
  }
  return parts;
}

describe("auth", () => {
  it("adopts restHost, identity and the session cookie from a login", async () => {
    const { transport, sent } = stub([
      {
        json: {
          errorCode: 0,
          userId: "u1",
          qwd: "Q",
          companyId: "c1",
          restHost: "https://tenant7.metamoji.com/",
        },
        // Scoped to the parent domain, which is what carries it across hosts.
        setCookie: ["JSESSIONID=abc; Domain=.metamoji.com; Path=/; HttpOnly"],
      },
      { json: { errorCode: 0, name: "Teacher" } },
    ]);
    // The host a school lookup would have supplied; login itself is a tenant
    // call, since the bootstrap root server serves no `users3/*` at all.
    const metamoji = new Metamoji({ transport, restHost: "https://mps101.metamoji.com/" });

    const login = await metamoji.auth.login({ loginName: "teacher", password: "pw" });
    expect(login.error).toBeNull();
    expect(sent[0].url).toBe("https://mps101.metamoji.com/mmjeditor2/2.0/users3/login");
    expect(metamoji.session.userId).toBe("u1");
    expect(metamoji.session.qwd).toBe("Q");

    // The response redirects the client at the tenant it names, and the
    // session travels there with it.
    await metamoji.users.get();
    expect(sent[1].url).toBe("https://tenant7.metamoji.com/mmjeditor2/2.0/users2/login/user");
    expect(sent[1].headers.cookie).toBe("JSESSIONID=abc");
  });

  it("sends the four X-DM headers and the five common body fields", async () => {
    const { transport, sent } = stub({ json: { errorCode: 0 } });
    const metamoji = new Metamoji({
      transport,
      restHost: "https://t.example/",
      locale: "en_US",
      deviceName: "test-device",
      timezone: "UTC",
    });

    await metamoji.auth.login({ loginName: "a", password: "b" });

    expect(sent[0].headers["x-dm-locale"]).toBe("en_US");
    expect(sent[0].headers["x-dm-productname"]).toBe("Android-Share-G-ClassRoom");
    expect(sent[0].headers["x-dm-productversion"]).toBe("3.15.1.0");
    expect(sent[0].headers["x-dm-appversion"]).toBe("3.15.1.0");
    expect(JSON.parse(sent[0].bodyText)).toMatchObject({
      deviceName: "test-device",
      locale: "en_US",
      timezone: "UTC",
      loginName: "a",
    });
  });

  it("reports a non-zero errorCode as an error, not data", async () => {
    const { transport } = stub({
      json: { errorCode: 1234, errorName: "LOGIN_FAILED", errorMessage: "だめ" },
    });
    const metamoji = new Metamoji({ transport, restHost: "https://t.example/" });

    const { data, error } = await metamoji.auth.login({ loginName: "a", password: "wrong" });
    expect(data).toBeNull();
    expect(error).toMatchObject({ name: "LOGIN_FAILED", message: "だめ", code: 1234 });
  });

  it("refuses a tenant call before login rather than guessing a host", async () => {
    const { transport, sent } = stub({ json: { errorCode: 0 } });
    const metamoji = new Metamoji({ transport });

    const { error } = await metamoji.users.get();
    expect(error?.name).toBe("not_configured");
    expect(sent).toHaveLength(0);
  });
});

describe("bodies on GET and DELETE", () => {
  it("sends the JSON body on a GET, as CsCloudService does", async () => {
    const { transport, sent } = stub({ json: { errorCode: 0 } });
    const metamoji = new Metamoji({ transport, restHost: "https://t.example" });

    await metamoji.users.get();
    expect(sent[0].method).toBe("GET");
    expect(JSON.parse(sent[0].bodyText)).toMatchObject({ productName: "Android-Share-G-ClassRoom" });
  });

  it("drops it when dropBodyOnGet is set", async () => {
    const { transport, sent } = stub({ json: { errorCode: 0 } });
    const metamoji = new Metamoji({
      transport,
      restHost: "https://t.example",
      dropBodyOnGet: true,
    });

    await metamoji.users.get();
    expect(sent[0].body).toBeUndefined();
    expect(sent[0].headers["content-type"]).toBeUndefined();
  });

  it("keeps the body on DELETE, which fetch allows", async () => {
    const { transport, sent } = stub({ json: { errorCode: 0 } });
    const metamoji = new Metamoji({ transport, restHost: "https://t.example" });

    await metamoji.drives.remove("d1");
    expect(sent[0].method).toBe("DELETE");
    expect(sent[0].url).toBe("https://t.example/mmjeditor2/2.0/drives/d1/data");
    expect(JSON.parse(sent[0].bodyText).driveId).toBe("d1");
  });
});

describe("sync (SdCloudService)", () => {
  it("uses its own headers, its own cookie jar, and no body on GET", async () => {
    const { transport, sent } = stub([
      { json: { errorCode: 0 }, setCookie: ["SD=1"] },
      { json: { errorCode: 0, driveId: "d1" } },
    ]);
    const metamoji = new Metamoji({
      transport,
      homeDir: "https://drive.example/",
      device: "Pixel;Android;34",
    });

    await metamoji.sync.login({ userId: "u", password: "p" });
    await metamoji.sync.syncStart("d1");

    expect(sent[1].headers["user-agent"]).toBe("MMJSdCloudService/1.0");
    expect(sent[1].headers["x-dm-device"]).toBe("Pixel;Android;34");
    expect(sent[1].headers["x-dm-appversion"]).toBeUndefined();
    expect(sent[1].body).toBeUndefined();
    expect(sent[1].headers.cookie).toBe("SD=1");
    expect(sent[1].url).toBe("https://drive.example/rest/drives/d1/syncstart");
  });

  it("keeps the sync session separate from the CsCloudService one", async () => {
    const { transport, sent } = stub([
      { json: { errorCode: 0, restHost: "https://t.example/" }, setCookie: ["CS=cs"] },
      { json: { errorCode: 0 }, setCookie: ["SD=sd"] },
      { json: { errorCode: 0 } },
    ]);
    const metamoji = new Metamoji({
      transport,
      restHost: "https://t.example/",
      homeDir: "https://t.example/",
    });

    await metamoji.auth.login({ loginName: "a", password: "b" });
    await metamoji.sync.login();
    await metamoji.sync.getDriveProperties("d1");

    // Same origin, different jar: the sync call must not pick up the CS cookie.
    expect(sent[2].headers.cookie).toBe("SD=sd");
  });

  it("sends booleans as the strings toMap() produces", async () => {
    const { transport, sent } = stub({ json: { errorCode: 0 } });
    const metamoji = new Metamoji({ transport, homeDir: "https://drive.example/" });

    await metamoji.sync.turnOnEditFlag("d1", "doc1", { locationId: "L", force: true });
    expect(JSON.parse(sent[0].bodyText)).toEqual({ locationId: "L", force: "true" });

    await metamoji.sync.putDocumentData("d1", "doc1", new Uint8Array([1]), { fromV2: false });
    expect(sent[1].url).toContain("fromv2=false");
    // A fixed literal the app always appends.
    expect(sent[1].url).toContain("cnechk=1");
    expect(sent[1].headers["content-type"]).toBe("application/zip");
  });

  it("re-logs in once on NOT_LOGIN_EXCEPTION and retries", async () => {
    const { transport, sent } = stub([
      { json: { errorCode: 0x2af9, errorMessage: "not logged in" } },
      { json: { errorCode: 0 } },
      { json: { errorCode: 0, driveId: "d1", amountUsed: "42" } },
    ]);
    const metamoji = new Metamoji({ transport, homeDir: "https://drive.example/" });
    metamoji.setSession({ userId: "u", qwd: "Q" });

    const { data, error } = await metamoji.sync.getDriveProperties("d1");
    expect(error).toBeNull();
    expect(data?.amountUsed).toBe("42");
    expect(sent.map((r) => r.url)).toEqual([
      "https://drive.example/rest/drives/d1/properties",
      "https://drive.example/rest/users/login",
      "https://drive.example/rest/drives/d1/properties",
    ]);
  });

  it("does not retry when autoLogin is off", async () => {
    const { transport, sent } = stub({ json: { errorCode: 0x2af9 } });
    const metamoji = new Metamoji({
      transport,
      homeDir: "https://drive.example/",
      autoLogin: false,
    });

    const { error } = await metamoji.sync.getDriveProperties("d1");
    expect(error?.code).toBe(0x2af9);
    expect(sent).toHaveLength(1);
  });

  it("returns downloads as bytes", async () => {
    const { transport } = stub({ bytes: new Uint8Array([0x50, 0x4b]), headers: { "content-type": "application/zip" } });
    const metamoji = new Metamoji({ transport, homeDir: "https://drive.example/" });

    const { data } = await metamoji.sync.getDocumentData("d1", "doc1", { revision: "7" });
    expect(data?.bytes).toEqual(new Uint8Array([0x50, 0x4b]));
    expect(data?.mimeType).toBe("application/zip");
  });
});

describe("rooms (multipart with JSON parts)", () => {
  it("builds authInfo from the session and names parts without a filename", async () => {
    const { transport, sent } = stub({ json: { roomID: "r1" } });
    const metamoji = new Metamoji({ transport, deviceId: "dev", deviceCode: "code" });
    metamoji.setSession({ userId: "u1", qwd: "Q", companyId: "c1" });

    await metamoji.rooms.create({ roomInfo: { title: "Maths", roomType: "formal" } });

    const parts = parseMultipart(sent[0]);
    expect(JSON.parse(parts.get("authInfo")!.value)).toEqual({
      deviceID: "dev",
      deviceCode: "code",
      authType: "cabinet",
      userID: "u1",
      productName: "Android-Share-G-ClassRoom",
      productVersion: "3.15.1.0",
      locale: "ja_JP",
      companyID: "c1",
      qwd: "Q",
    });
    // A JSON part carries a content type but no filename, as OkHttp sends it.
    expect(parts.get("authInfo")!.contentType).toBe("application/json");
    expect(parts.get("authInfo")!.filename).toBeUndefined();
    expect(JSON.parse(parts.get("roomInfo")!.value).title).toBe("Maths");
  });

  it("sends a cleartext password instead of qwd when it has one", async () => {
    const { transport, sent } = stub({ json: {} });
    const metamoji = new Metamoji({ transport });
    metamoji.setSession({ userId: "u1", password: "pw", qwd: "Q" });

    await metamoji.rooms.get({ roomID: "r1" });
    const authInfo = JSON.parse(parseMultipart(sent[0]).get("authInfo")!.value);
    expect(authInfo.userPassword).toBe("pw");
    expect(authInfo.qwd).toBeUndefined();
  });

  it("applies one mode to all three roles", async () => {
    const { transport, sent } = stub({ json: {} });
    const metamoji = new Metamoji({ transport });

    await metamoji.rooms.updateMode({ mode: "READONLY", roomID: "r1" });
    const parts = parseMultipart(sent[0]);
    expect(JSON.parse(parts.get("roomInfo")!.value).role).toEqual({
      presenter: "READONLY",
      speaker: "READONLY",
      visitor: "READONLY",
    });
    expect(sent[0].url).toBe("https://mps.metamoji.com/cosmos/UpdateRoomInfo");
  });

  it("sends binary parts with their own content types", async () => {
    const { transport, sent } = stub({ json: {} });
    const metamoji = new Metamoji({ transport });

    await metamoji.rooms.postToGallery({
      roomId: "r1",
      title: "page 1",
      encryptedHash: "h",
      document: { data: new Uint8Array([1, 2]), filename: "note.btshare" },
      image: { data: new Uint8Array([3]), filename: "thumb.jpg" },
    });

    const parts = parseMultipart(sent[0]);
    expect(parts.get("cmd")!.value).toBe("post");
    expect(parts.get("document")!.contentType).toBe("application/vnd.metamoji.btshare");
    expect(parts.get("document")!.filename).toBe("note.btshare");
    expect(parts.get("image")!.contentType).toBe("image/jpeg");
  });
});

describe("gallery media", () => {
  it("numbers ids instead of sending an array", async () => {
    const { transport, sent } = stub({ json: { statusCode: 0, mediaList: [] } });
    const metamoji = new Metamoji({ transport });
    metamoji.setSession({ userId: "u1", companyId: "c1", qwd: "Q" });

    await metamoji.media.getStatus({ ids: ["a", "b", "c"] });
    expect(sent[0].url).toContain("recordId0=a");
    expect(sent[0].url).toContain("recordId1=b");
    expect(sent[0].url).toContain("recordId2=c");
  });

  it("switches the field name for client-generated ids", async () => {
    const { transport, sent } = stub({ text: "0,ok" });
    const metamoji = new Metamoji({ transport });
    metamoji.setSession({ userId: "u1", qwd: "Q" });

    await metamoji.media.remove({ ids: ["x"], idKind: "clientMediaId" });
    expect(parseMultipart(sent[0]).has("clientMediaId0")).toBe(true);
  });

  it("parses the line-delimited registration reply", async () => {
    const { transport } = stub({ text: "0,ok\r\nrec-77\r\nhttps://media.example/f" });
    const metamoji = new Metamoji({ transport });

    const { data } = await metamoji.media.register({
      id: "cm-1",
      title: "recording",
      contentType: "audio/mp4",
      suffix: ".m4a",
    });
    expect(data).toMatchObject({ statusCode: 0, recordId: "rec-77", url: "https://media.example/f" });
  });

  it("takes the status from the line after finish on an upload", async () => {
    const { transport } = stub({ text: "10\r\n50\r\n100\r\nfinish\r\n0,done" });
    const metamoji = new Metamoji({ transport });

    const { data } = await metamoji.media.upload({
      id: "cm-1",
      mediaFile: { data: new Uint8Array([1]), filename: "a.m4a" },
    });
    expect(data?.statusCode).toBe(0);
  });

  it("collects the ids renamed before the finish line", async () => {
    const { transport } = stub({ text: "rec-1,ok\r\nrec-2,ok\r\nfinish\r\n0," });
    const metamoji = new Metamoji({ transport });

    const { data } = await metamoji.media.setTitles({
      ids: ["rec-1", "rec-2"],
      titles: ["one", "two"],
    });
    expect(data?.completedIds).toEqual(["rec-1", "rec-2"]);
    expect(data?.statusCode).toBe(0);
  });

  it("re-logs in once after a 403", async () => {
    const { transport, sent } = stub([
      { status: 403, text: "forbidden" },
      { text: "0,ok" },
      { json: { statusCode: 0, mediaList: [] } },
    ]);
    const metamoji = new Metamoji({ transport });
    metamoji.setSession({ userId: "u1", qwd: "Q" });

    const { error } = await metamoji.media.list();
    expect(error).toBeNull();
    expect(sent.map((r) => new URL(r.url).pathname)).toEqual([
      "/gallery/GetMediaList",
      "/gallery/LoginMedia",
      "/gallery/GetMediaList",
    ]);
  });

  it("rejects mismatched ids and titles as a programmer error", async () => {
    const { transport } = stub({ text: "0," });
    const metamoji = new Metamoji({ transport });
    await expect(
      metamoji.media.setTitles({ ids: ["a", "b"], titles: ["only one"] }),
    ).rejects.toThrow(TypeError);
  });
});

describe("webdav", () => {
  const multistatus = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:" xmlns:V="http://xmlns.metamoji.com/digitalcabinet/tinydotnote/1.0/">
  <D:response>
    <D:href>/home/user1/</D:href>
    <D:propstat><D:prop>
      <D:displayname>user1</D:displayname>
      <D:resourcetype><D:collection/></D:resourcetype>
    </D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat>
  </D:response>
  <D:response>
    <D:href>/home/user1/note-a</D:href>
    <D:propstat><D:prop>
      <D:getcontentlength>2048</D:getcontentlength>
      <D:getetag>"abc"</D:getetag>
      <D:resourcetype/>
      <V:lastSyncedRevision>17</V:lastSyncedRevision>
    </D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat>
  </D:response>
</D:multistatus>`;

  it("sends the real WebDAV verbs", async () => {
    const { transport, sent } = stub({ status: 201 });
    const metamoji = new Metamoji({ transport });

    await metamoji.webdav.createDirectory("https://dav.example/home/user1/folder");
    await metamoji.webdav.move("https://dav.example/a", "https://dav.example/b");

    expect(sent[0].method).toBe("MKCOL");
    expect(sent[1].method).toBe("MOVE");
    expect(sent[1].headers.Destination).toBe("https://dav.example/b");
    expect(sent[1].headers.Overwrite).toBe("T");
  });

  it("parses a multistatus into a tree with both property namespaces", async () => {
    const { transport, sent } = stub({
      status: 207,
      text: multistatus,
      headers: { "content-type": "application/xml" },
    });
    const metamoji = new Metamoji({ transport });
    metamoji.setSession({ appAuthKey: "key-1" });
    metamoji.webdav.authorize();

    const { data } = await metamoji.webdav.propfind("https://dav.example/home/user1/", {
      depth: "infinity",
    });

    expect(sent[0].method).toBe("PROPFIND");
    expect(sent[0].headers.Depth).toBe("infinity");
    expect(sent[0].headers["x-mmj-appcode"]).toBe("key-1");
    expect(sent[0].bodyText).toContain("<D:allprop/>");

    expect(data?.isValidMultiResponse).toBe(true);
    expect(data?.hrefs).toEqual(["/home/user1/", "/home/user1/note-a"]);

    const root = data!.itemTree!;
    expect(root.isCollection).toBe(true);
    expect(root.displayName).toBe("user1");
    expect(root.children.map((c) => c.uriName)).toEqual(["note-a"]);

    const note = data!.multiResponses["/home/user1/note-a"];
    expect(note.isCollection).toBe(false);
    expect(note.liveProperties.getcontentlength).toBe("2048");
    expect(note.deadProperties.lastSyncedRevision).toBe("17");
  });

  it("sends Basic auth when given a username and password", async () => {
    const { transport, sent } = stub({ status: 200 });
    const metamoji = new Metamoji({ transport });
    metamoji.webdav.authorize({ username: "u", password: "p" });

    await metamoji.webdav.get("https://dav.example/x");
    expect(sent[0].headers.authorization).toBe(`Basic ${btoa("u:p")}`);
  });

  it("writes dead properties in the MetaMoji namespace", async () => {
    const { transport, sent } = stub({ status: 207, text: "<D:multistatus xmlns:D='DAV:'/>" });
    const metamoji = new Metamoji({ transport });

    await metamoji.webdav.proppatch("https://dav.example/x", {
      set: { lastSyncedRevision: "18" },
      remove: ["syncUpdate"],
    });

    expect(sent[0].method).toBe("PROPPATCH");
    expect(sent[0].bodyText).toContain("<V:lastSyncedRevision>18</V:lastSyncedRevision>");
    expect(sent[0].bodyText).toContain("<V:syncUpdate/>");
  });
});

describe("library store", () => {
  it("logs in as a guest and retries when the session has lapsed", async () => {
    const { transport, sent } = stub([
      { json: { result: "1", message: "login required" } },
      { json: { result: "0" } },
      { json: { result: "0", version: "1.0", pages: [{ pageID: "p1" }] } },
    ]);
    const metamoji = new Metamoji({ transport, restHost: "https://t.example/" });

    const { data, error } = await metamoji.libraryStore.listPages();
    expect(error).toBeNull();
    expect(data?.pages).toHaveLength(1);
    expect(sent[1].url).toContain("/store/Login?id=guest&pass=&");
  });

  it("treats a JSON reply to a download as a lapsed session, not a file", async () => {
    const { transport, sent } = stub([
      { json: { result: "1" } },
      { json: { result: "0" } },
      { bytes: new Uint8Array([1, 2, 3]), headers: { "content-type": "application/zip" } },
    ]);
    const metamoji = new Metamoji({ transport, restHost: "https://t.example/" });

    const { data } = await metamoji.libraryStore.downloadProduct("https://cdn.example/p.zip");
    expect(data?.bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(sent).toHaveLength(3);
  });
});

describe("video", () => {
  it("treats a bare Flora hostname as plain http", async () => {
    const { transport, sent } = stub({ json: { count: 3 } });
    const metamoji = new Metamoji({ transport, floraServer: "flora7.example" });

    await metamoji.video.count();
    expect(sent[0].url).toBe("http://flora7.example/flora/api/v1/getclipcount2?type=MOVIE");
  });

  it("puts the ticket in headers when uploading to the signed URL", async () => {
    const { transport, sent } = stub({ json: { status: "OK" } });
    const metamoji = new Metamoji({ transport, floraServer: "https://flora7.example" });
    metamoji.setSession({ userId: "u1", companyId: "c1" });

    await metamoji.video.uploadFile({
      uploadUrl: "https://upload.example/signed",
      ticket: "T-1",
      data: new Uint8Array([9]),
      contentType: "image/jpeg",
    });

    expect(sent[0].url).toBe("https://upload.example/signed");
    expect(sent[0].headers["mmj.ms.ticket"]).toBe("T-1");
    expect(sent[0].headers["mmj.ms.coid"]).toBe("c1");
    expect(sent[0].headers["mmj.ms.userid"]).toBe("u1");
    expect(sent[0].headers["content-type"]).toBe("image/jpeg");
  });
});

describe("licence activation", () => {
  it("signs the request and verifies the response hash", async () => {
    const { transport, sent } = stub({
      json: {
        i_status: 0,
        i_result: 0,
        // MD5("mmj:dev-1:Android-Note-Business_3.1.8:0:0")
        tt_hash: "6bc3f2a2c2c04c1e2f2a03e9fbdd47a1",
      },
    });
    const metamoji = new Metamoji({ transport, deviceId: "dev-1" });

    const { error } = await metamoji.licenseActivation.activate({ licenseKey: "KEY-1" });
    const body = JSON.parse(sent[0].bodyText);
    expect(body.tt_productid).toBe("Android-Note-Business_3.1.8");
    expect(body.tt_hash).toHaveLength(32);
    // The stubbed hash is deliberately wrong, so verification must reject it.
    expect(error?.name).toBe("hash_mismatch");
  });

  it("accepts an unverified response when asked to", async () => {
    const { transport } = stub({ json: { i_status: 0, i_result: 0, tt_hash: "nonsense" } });
    const metamoji = new Metamoji({ transport, deviceId: "dev-1" });

    const { data, error } = await metamoji.licenseActivation.activate({
      licenseKey: "KEY-1",
      verifyHash: false,
    });
    expect(error).toBeNull();
    expect(data?.i_result).toBe(0);
  });
});

describe("sysinfo", () => {
  it("resolves a value through the version and locale fallbacks", async () => {
    const { transport } = stub({
      json: {
        "WebSite.tos": {
          "3.15": { ja: "https://example/ja/tos", "*": "https://example/tos" },
          "*": { en: "https://example/en/tos" },
        },
        "WebSite.privacy": { "*": { en: "https://example/en/privacy" } },
      },
    });
    const metamoji = new Metamoji({ transport, locale: "ja_JP" });

    const { data } = await metamoji.sysInfo.get();
    expect(metamoji.sysInfo.resolve(data?.["WebSite.tos"])).toBe("https://example/ja/tos");
    // No ja under the wildcard version, so it falls back to en.
    expect(metamoji.sysInfo.resolve(data?.["WebSite.privacy"])).toBe("https://example/en/privacy");
  });

  it("sends last=null on a first fetch, as the app does", async () => {
    const { transport, sent } = stub({ json: {} });
    const metamoji = new Metamoji({ transport });

    await metamoji.sysInfo.get();
    expect(sent[0].url).toBe(
      "https://cdn.metamoji.com/sysinfo_Android-Share-G-ClassRoom.json?last=null",
    );
  });
});

describe("errors", () => {
  it("reports a transport failure without throwing", async () => {
    const transport: Transport = async () => {
      throw new Error("socket hang up");
    };
    const metamoji = new Metamoji({ transport, restHost: "https://t.example/" });

    const { data, error } = await metamoji.auth.login({ loginName: "a" });
    expect(data).toBeNull();
    expect(error).toMatchObject({ name: "network_error", message: "socket hang up" });
  });

  it("reports a non-2xx status with the server's message", async () => {
    const { transport } = stub({ status: 500, json: { errorMessage: "boom" } });
    const metamoji = new Metamoji({ transport, restHost: "https://t.example/" });

    const { error } = await metamoji.auth.login({ loginName: "a" });
    expect(error).toMatchObject({ name: "http_error", statusCode: 500 });
    expect(error?.message).toContain("boom");
  });
});

describe("maintenance notices", () => {
  it("keeps the CsCloudService and SdCloudService notices apart", async () => {
    const { transport, sent } = stub([
      // login: names a tenant-specific CS maintenance URL
      {
        json: { errorCode: 0, restHost: "https://t.example/", maintCheckURL: "https://t.example/maint.txt" },
      },
      // drives.getHome: names a per-drive sync maintenance URL
      {
        json: { errorCode: 0, homeDir: "https://drive.example/", maintenanceText: "https://drive.example/notice.txt" },
      },
      { text: "" },
      { text: "" },
    ]);
    const metamoji = new Metamoji({ transport, restHost: "https://t.example/" });

    await metamoji.auth.login({ loginName: "a", password: "b" });
    await metamoji.drives.getHome("d1");
    await metamoji.system.getMaintenanceInfo();
    await metamoji.sync.getMaintenanceInfo();

    expect(sent[2].url).toBe("https://t.example/maint.txt");
    expect(sent[3].url).toBe("https://drive.example/notice.txt");
  });

  it("reads an empty maintenance body as 'no maintenance'", async () => {
    const { transport } = stub({ text: "   " });
    const metamoji = new Metamoji({ transport });

    const { data } = await metamoji.system.getMaintenanceInfo();
    expect(data?.isUnderMaintenance).toBe(false);
    expect(data?.maintMessage).toBeUndefined();
  });

  it("reads a non-empty body as the notice", async () => {
    const { transport } = stub({ text: "3月1日 2:00-4:00 メンテナンス" });
    const metamoji = new Metamoji({ transport });

    const { data } = await metamoji.system.getMaintenanceInfo();
    expect(data?.isUnderMaintenance).toBe(true);
    expect(data?.maintMessage).toBe("3月1日 2:00-4:00 メンテナンス");
  });
});
