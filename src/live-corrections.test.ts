/**
 * The places where the typespec and the live server disagree.
 *
 * Each of these was found by pointing a client at a real ClassShare tenant and
 * watching it fail: the reconstructed documentation is inference from smali,
 * and inference is wrong in ways that only a server tells you about. Every
 * test here stands for one such failure, so re-deriving the code from the spec
 * cannot quietly reintroduce it.
 */

import { describe, expect, it } from "vitest";

import { Metamoji } from "./client.js";
import { newDeviceCode } from "./resources/rooms/rooms.js";
import type { Transport, TransportRequest, TransportResponse } from "./core/transport.js";

interface Recorded extends TransportRequest {
  bodyText: string;
}

interface Reply {
  status?: number;
  json?: unknown;
  bytes?: Uint8Array;
  setCookie?: string[];
}

function stub(replies: Reply[] | Reply = {}) {
  const queue = Array.isArray(replies) ? [...replies] : [replies];
  const sent: Recorded[] = [];
  const transport: Transport = async (request) => {
    sent.push({
      ...request,
      bodyText:
        typeof request.body === "string"
          ? request.body
          : request.body
            ? new TextDecoder().decode(request.body)
            : "",
    });
    const reply = queue.length > 1 ? queue.shift()! : (queue[0] ?? {});
    const headers: Record<string, string> = {};
    let body = new Uint8Array();
    if (reply.json !== undefined) {
      headers["content-type"] = "application/json";
      body = new TextEncoder().encode(JSON.stringify(reply.json));
    } else if (reply.bytes !== undefined) {
      headers["content-type"] = "application/octet-stream";
      body = reply.bytes;
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

function multipart(request: Recorded, name: string): string {
  const boundary = /boundary=(.+)$/.exec(request.headers["content-type"] ?? "")?.[1];
  if (!boundary) throw new Error("not a multipart request");
  for (const chunk of request.bodyText.split(`--${boundary}`)) {
    const split = chunk.indexOf("\r\n\r\n");
    if (split === -1) continue;
    if (/name="([^"]*)"/.exec(chunk.slice(0, split))?.[1] !== name) continue;
    return chunk.slice(split + 4).replace(/\r\n$/, "");
  }
  throw new Error(`no part named ${name}`);
}

describe("finding a school", () => {
  it("reads the capitalised key the servlet actually sends", async () => {
    // The Java *field* is `serverUrl`, but `ExecuteGetServerUrlWithParams`
    // reads the JSON key by hand and the key is `serverURL`. Reading the field
    // name makes every school look as though it does not exist.
    const { transport, sent } = stub({
      json: { serverURL: "https://mps101.metamoji.com", isClassRoom: true },
    });
    const metamoji = new Metamoji({ transport });

    const { data, error } = await metamoji.auth.resolveSchool("MC896845");
    expect(error).toBeNull();
    expect(data?.serverUrl).toBe("https://mps101.metamoji.com/");
    expect(data?.isClassRoom).toBe(true);
    expect(sent[0].url).toContain("mpsroot/RequestServlet?coLoginId=MC896845");
  });

  it("says so when the code is not registered", async () => {
    // The servlet answers 200 with nothing in it.
    const { transport } = stub({ json: {} });
    const metamoji = new Metamoji({ transport, restHost: "https://tenant.example/" });
    const { data, error } = await metamoji.auth.resolveSchool("NOPE");
    expect(data).toBeNull();
    expect(error?.message).toContain("NOPE");
  });

  it("adopts the host, so the next call knows where to go", async () => {
    const { transport, sent } = stub([
      { json: { serverURL: "https://mps101.metamoji.com" } },
      { json: { errorCode: 0 } },
    ]);
    const metamoji = new Metamoji({ transport, restHost: "https://tenant.example/" });
    await metamoji.auth.resolveSchool("MC896845");
    await metamoji.users.get();
    expect(sent[1].url).toContain("mps101.metamoji.com");
  });
});

describe("signing in", () => {
  it("takes the user id from uuid, as a string", async () => {
    // A real tenant answers with `uuid` and no `userId`, and sends it as a
    // number. Everything downstream needs it as a string.
    const { transport } = stub({
      json: { errorCode: 0, uuid: 213163099101, restHost: "https://mps101.metamoji.com/" },
    });
    const metamoji = new Metamoji({ transport, restHost: "https://tenant.example/" });
    await metamoji.auth.login({ loginName: "23SQ8H", password: "…" });
    expect(metamoji.session.userId).toBe("213163099101");
  });

  it("still reads userId when a tenant sends that instead", async () => {
    const { transport } = stub({ json: { errorCode: 0, userId: "42" } });
    const metamoji = new Metamoji({ transport, restHost: "https://tenant.example/" });
    await metamoji.auth.login({ loginName: "a", password: "b" });
    expect(metamoji.session.userId).toBe("42");
  });
});

describe("commands that send no body", () => {
  const noBody = async (call: (m: Metamoji) => Promise<unknown>) => {
    const { transport, sent } = stub({ json: { errorCode: 0, homeDir: "https://h/" } });
    const metamoji = new Metamoji({ transport, restHost: "https://mps101.metamoji.com/" });
    await call(metamoji);
    return sent[0];
  };

  it("asks for a drive's home with nothing in the body", async () => {
    // `CsCloudService$30` passes a literal null where the body goes. Sending
    // one is not harmless: the server answers 200 with no `homeDir` in it.
    const request = await noBody((m) => m.drives.getHome("51351385101"));
    expect(request.method).toBe("GET");
    expect(request.bodyText).toBe("");
  });

  it("lists entries with nothing in the body either", async () => {
    const request = await noBody((m) => m.drives.listEntries());
    expect(request.bodyText).toBe("");
  });
});

describe("the drive service's login", () => {
  it("sends all three keys, null for the ones it has no value for", async () => {
    // `SdLoginParams.toMap()` puts all three in unconditionally, and
    // `CmJson.createJsonValue` turns a null into `JSONObject.NULL` rather than
    // dropping the key. Omitting the unused one answers 500.
    const { transport, sent } = stub({ json: { errorCode: 0 } });
    const metamoji = new Metamoji({
      transport,
      homeDir: "https://mps101.metamoji.com/shareddrive/",
      session: { userId: "213163099101", password: "…" },
    });

    await metamoji.sync.login();
    const body = JSON.parse(sent[0].bodyText);
    expect(Object.keys(body).sort()).toEqual(["password", "qwd", "userId"]);
    expect(body.qwd).toBeNull();
  });
});

describe("the drive service's errors", () => {
  it("reads the nested code out of a 500", async () => {
    // A refused login answers HTTP 500 with the code under `data`. Read as a
    // flat `errorCode` on a 2xx body it is neither, and every specific error
    // this subsystem has reports as a bare server fault.
    const { transport } = stub({
      status: 500,
      json: {
        name: "InvalidUserOrPasswordException",
        message: "The user or password is invalid.",
        data: { errorCode: 11000 },
      },
    });
    const metamoji = new Metamoji({
      transport,
      homeDir: "https://h/",
      session: { userId: "1", password: "wrong" },
    });

    const { error } = await metamoji.sync.login();
    expect(error?.name).toBe("InvalidUserOrPasswordException");
    expect(error?.code).toBe(11000);
    expect(error?.statusCode).toBe(500);
    expect(error?.message).toContain("invalid");
  });

  it("lets a clean response through", async () => {
    const { transport } = stub({ json: { errorCode: 0, userId: "1" } });
    const metamoji = new Metamoji({
      transport,
      homeDir: "https://h/",
      session: { userId: "1", password: "…" },
    });
    const { data, error } = await metamoji.sync.login();
    expect(error).toBeNull();
    expect(data).not.toBeNull();
  });
});

describe("the classroom subsystem", () => {
  it("goes to the tenant host, not the bootstrap root", async () => {
    // `DIGITAL_CABINET_URL_BASE()` returns `getRestHost()`. Sent to the root
    // server, `cosmos/*` answers 404.
    const { transport, sent } = stub({ json: { result: true, deviceID: "5803044101801079" } });
    const metamoji = new Metamoji({ transport, restHost: "https://mps101.metamoji.com/" });
    await metamoji.rooms.createGuestId();
    expect(sent[0].url).toBe("https://mps101.metamoji.com/cosmos/CreateUniqueID");
  });

  it("falls back to the root server before there is a tenant", async () => {
    const { transport, sent } = stub({ json: { result: true } });
    const metamoji = new Metamoji({ transport });
    await metamoji.rooms.createGuestId();
    expect(sent[0].url).toBe("https://mps.metamoji.com/cosmos/CreateUniqueID");
  });

  it("identifies the account by email, not by its numeric id", async () => {
    // Every caller of `createAuthInfoParam` passes its `email` field in this
    // position. The numeric id is refused with "bad user", which reads like a
    // wrong password and is not.
    const { transport, sent } = stub({ json: { result: true } });
    const metamoji = new Metamoji({
      transport,
      restHost: "https://mps101.metamoji.com/",
      session: { userId: "213163099101", email: "23SQ8H", password: "…" },
      deviceId: "5803044101801079",
      deviceCode: "393356000",
    });

    await metamoji.rooms.get({ roomID: "5592517101055732" });
    expect(JSON.parse(multipart(sent[0], "authInfo")).userID).toBe("23SQ8H");
  });

  it("keeps the device id the service issues", async () => {
    // Every other `cosmos/*` call carries the pair, and an id invented locally
    // is refused with "bad device id or code".
    const { transport, sent } = stub({ json: { result: true, deviceID: "5803044101801079" } });
    const metamoji = new Metamoji({ transport, restHost: "https://h/" });

    await metamoji.rooms.createGuestId();
    await metamoji.rooms.get({ roomID: "r" });
    expect(JSON.parse(multipart(sent[1], "authInfo")).deviceID).toBe("5803044101801079");
  });

  it("mints a device code of the shape the service accepts", async () => {
    // `Random.nextInt()` kept as decimal digits. A UUID here is refused along
    // with the id issued for it.
    for (let i = 0; i < 50; i++) {
      const code = newDeviceCode();
      expect(code).toMatch(/^[1-9][0-9]*$/);
      expect(Number(code)).toBeLessThanOrEqual(0x7fff_ffff);
    }
  });
});

describe("where a CsCloudService call actually goes", () => {
  it("puts tenant calls under the context root", async () => {
    // Probed against a live tenant:
    //   POST {tenant}/users3/login              -> 404 (HTML)
    //   POST {tenant}/mmjeditor2/2.0/users3/login -> the API envelope
    // Every one of the ~110 tenant operations was addressed at the bare root
    // and answered 404, so nothing in this subsystem worked at all.
    const { transport, sent } = stub({ json: { errorCode: 0 } });
    const metamoji = new Metamoji({ transport, restHost: "https://mps101.metamoji.com/" });

    await metamoji.drives.getEntryInfo();

    expect(sent[0].url).toBe("https://mps101.metamoji.com/mmjeditor2/2.0/drives/entryinfo");
  });

  it("leaves the bootstrap root server alone, which serves its two paths bare", async () => {
    // The root is the other way round: `mpsroot/RequestServlet` answers there
    // and 404s under the prefix.
    const { transport, sent } = stub({ json: { serverURL: "https://mps101.metamoji.com" } });
    const metamoji = new Metamoji({ transport });

    await metamoji.auth.resolveSchool("MC896845");

    expect(sent[0].url).toBe(
      "https://mps.metamoji.com/mpsroot/RequestServlet?coLoginId=MC896845",
    );
  });

  it("keeps cosmos on the tenant host but out of the context root", async () => {
    //   POST {tenant}/cosmos/CreateUniqueID              -> reaches the service
    //   POST {tenant}/mmjeditor2/2.0/cosmos/CreateUniqueID -> 404
    const { transport, sent } = stub({ json: { result: true } });
    const metamoji = new Metamoji({ transport, restHost: "https://mps101.metamoji.com/" });

    await metamoji.rooms.createGuestId();

    expect(sent[0].url).toBe("https://mps101.metamoji.com/cosmos/CreateUniqueID");
  });

  it("signs in against the tenant, not the bootstrap root", async () => {
    // `POST {root}/users3/login` is a 404, with or without the prefix — the
    // root server has no `users3/*` at all. The school lookup is what supplies
    // the host, which is why it comes first.
    const { transport, sent } = stub([
      { json: { serverURL: "https://mps101.metamoji.com" } },
      { json: { errorCode: 0, uuid: 1 } },
    ]);
    const metamoji = new Metamoji({ transport });

    await metamoji.auth.resolveSchool("MC896845");
    await metamoji.auth.login({ coLoginId: "MC896845", loginName: "a", password: "b" });

    expect(sent[1].url).toBe("https://mps101.metamoji.com/mmjeditor2/2.0/users3/login");
  });

  it("lets a deployment that serves them at the root say so", async () => {
    const { transport, sent } = stub({ json: { errorCode: 0 } });
    const metamoji = new Metamoji({
      transport,
      restHost: "https://on-prem.example/",
      restBasePath: "",
    });

    await metamoji.drives.getEntryInfo();

    expect(sent[0].url).toBe("https://on-prem.example/drives/entryinfo");
  });
});

/**
 * A lapsed session, verbatim from a signed-out live request. It arrives with a
 * 500 from `users2/login/user` and a 401 from `users3/crbox/get/joincode` — the
 * status varies, the body does not.
 */
const LAPSED = {
  name: "NotLoginException",
  message: "It doesn't log it in.",
  data: { errorCode: 106 },
};

const LOGIN_OK = { uuid: "u-1", loginName: "student01", restHost: "https://mps101.metamoji.com/" };

describe("a lapsed CsCloudService session", () => {
  it("reports the code rather than a bare HTTP 500", async () => {
    // `csEnvelope` looked for a flat `errorCode` on a 2xx body. Signed out, the
    // server sends neither: the code is nested under `data` and the status is
    // 500. Every lapsed session then read as a server fault, which is not
    // something a caller can act on — and 106 is the one error that has an
    // obvious remedy.
    const { transport } = stub({ status: 500, json: LAPSED });
    const metamoji = new Metamoji({ transport, restHost: "https://mps101.metamoji.com/" });

    const { error } = await metamoji.users.get();

    expect(error?.code).toBe(106);
    expect(error?.name).toBe("NotLoginException");
    expect(error?.message).toBe("It doesn't log it in.");
  });

  it("signs in again and retries once, as executeWithAutoLoginFor does", async () => {
    const { transport, sent } = stub([
      { status: 200, json: LOGIN_OK },              // the initial login
      { status: 500, json: LAPSED },                // the call, session expired
      { status: 200, json: LOGIN_OK },              // signing back in
      { status: 200, json: { errorCode: 0, userId: "u-1" } }, // the retry
    ]);
    const metamoji = new Metamoji({ transport, restHost: "https://tenant.example/" });
    await metamoji.auth.login({ coLoginId: "school", loginName: "a", password: "b" });

    const { data, error } = await metamoji.users.get();

    expect(error).toBeNull();
    expect(data?.userId).toBe("u-1");
    expect(sent.map((r) => new URL(r.url).pathname)).toEqual([
      "/mmjeditor2/2.0/users3/login",
      "/mmjeditor2/2.0/users2/login/user",
      "/mmjeditor2/2.0/users3/login",
      "/mmjeditor2/2.0/users2/login/user",
    ]);
  });

  it("does not retry for a client that was handed a session rather than a login", async () => {
    // Nothing to sign in with, so the only thing a retry could achieve is a
    // second identical failure.
    const { transport, sent } = stub({ status: 500, json: LAPSED });
    const metamoji = new Metamoji({
      transport,
      restHost: "https://mps101.metamoji.com/",
      session: { userId: "u-1" },
    });

    const { error } = await metamoji.users.get();

    expect(error?.code).toBe(106);
    expect(sent).toHaveLength(1);
  });

  it("stops retrying once the caller has signed out", async () => {
    const { transport, sent } = stub([
      { status: 200, json: LOGIN_OK },
      { status: 200, json: { errorCode: 0 } },  // logout
      { status: 500, json: LAPSED },            // a later call
    ]);
    const metamoji = new Metamoji({ transport, restHost: "https://tenant.example/" });
    await metamoji.auth.login({ coLoginId: "school", loginName: "a", password: "b" });
    await metamoji.auth.logout();
    sent.length = 0;

    await metamoji.users.get();

    expect(sent).toHaveLength(1);
  });

  it("leaves an unrecognisable 500 alone", async () => {
    const { transport, sent } = stub([
      { status: 200, json: LOGIN_OK },
      { status: 500, json: { message: "gateway is on fire" } },
    ]);
    const metamoji = new Metamoji({ transport, restHost: "https://tenant.example/" });
    await metamoji.auth.login({ coLoginId: "school", loginName: "a", password: "b" });
    sent.length = 0;

    const { error } = await metamoji.users.get();

    expect(error?.statusCode).toBe(500);
    expect(sent).toHaveLength(1);
  });
});

describe("a lapsed SdCloudService session on a download", () => {
  it("signs in again, as it already did for every other sync call", async () => {
    // `download` handed a transport-level failure straight back, so the nested
    // code never became `error.code` and the retry never fired. A note download
    // met a lapsed session and simply failed, while `getDocumentMeta` on the
    // same session recovered.
    const { transport, sent } = stub([
      { status: 500, json: { name: "NotLoginException", data: { errorCode: 0x2af9 } } },
      { status: 200, json: { errorCode: 0 } },                 // the re-login
      { status: 200, bytes: new Uint8Array([1, 2, 3]) },       // the retry
    ]);
    const metamoji = new Metamoji({
      transport,
      homeDir: "https://drive.example/",
      session: { userId: "u-1", password: "b" },
    });

    const { data, error } = await metamoji.sync.getDocumentData("D", "DOC");

    expect(error).toBeNull();
    expect(data?.bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(sent.map((r) => new URL(r.url).pathname)).toEqual([
      "/rest/drives/D/documents/DOC/data",
      "/rest/users/login",
      "/rest/drives/D/documents/DOC/data",
    ]);
  });
});

describe("WebDAV against a server that is not MetaMoJi's", () => {
  it("keeps its cookies out of the jar holding the session", async () => {
    // `NwWebDAVRequest` is reused verbatim for whatever WebDAV server a user
    // configures (drive/webdav.tsp). It authenticates with Basic and an app
    // code, so it has no session of its own to keep — but it was filing
    // responses in the `cs` jar, which is where the MetaMoJi session lives.
    const { transport } = stub({ status: 200, setCookie: ["JSESSIONID=theirs; Path=/"] });
    const metamoji = new Metamoji({ transport });

    await metamoji.webdav.get("https://someone-elses-nas.example/note-1");

    expect(metamoji.context.cookies.has("cs")).toBe(false);
    expect(metamoji.context.cookies.has("webdav")).toBe(true);
  });
});
