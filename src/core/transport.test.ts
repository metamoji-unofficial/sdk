/**
 * The GET-with-body workaround, against a real server.
 *
 * This is the one piece that cannot be verified with a stub: the whole point is
 * that `fetch` refuses to send these requests, so the test has to watch bytes
 * actually arrive.
 */

import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Metamoji } from "../client.js";
import { createDefaultTransport, createFetchTransport } from "./transport.js";

let server: Server;
let origin: string;
const received: { method: string; url: string; body: string; headers: Record<string, string> }[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      received.push({
        method: req.method ?? "",
        url: req.url ?? "",
        body: Buffer.concat(chunks).toString("utf8"),
        headers: req.headers as Record<string, string>,
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ errorCode: 0, userId: "u1" }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (typeof address === "object" && address) origin = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("default transport", () => {
  it("delivers a JSON body on a GET, which is what this API expects", async () => {
    received.length = 0;
    const metamoji = new Metamoji({ restHost: origin, deviceName: "probe" });

    const { data, error } = await metamoji.users.get();
    expect(error).toBeNull();
    expect(data?.userId).toBe("u1");

    expect(received).toHaveLength(1);
    expect(received[0].method).toBe("GET");
    expect(received[0].url).toBe("/users2/login/user");
    expect(JSON.parse(received[0].body)).toMatchObject({ deviceName: "probe" });
    expect(received[0].headers["content-length"]).toBe(String(received[0].body.length));
    expect(received[0].headers["x-dm-productname"]).toBe("Android-Share-G-ClassRoom");
  });

  it("still uses fetch for everything else", async () => {
    received.length = 0;
    const metamoji = new Metamoji({ rootServer: origin });

    await metamoji.auth.login({ loginName: "a", password: "b" });
    expect(received[0].method).toBe("POST");
    // undici announces itself; node:http does not send a User-Agent unasked.
    expect(received[0].headers["user-agent"] ?? "").toMatch(/node|undici/i);
  });

  it("carries multipart bodies through fetch intact", async () => {
    received.length = 0;
    const metamoji = new Metamoji({ dcServer: origin });

    await metamoji.rooms.create({ roomInfo: { title: "Maths" } });
    expect(received[0].headers["content-type"]).toMatch(/^multipart\/form-data; boundary=/);
    expect(received[0].body).toContain('name="roomInfo"');
    expect(received[0].body).toContain("Maths");
  });
});

describe("fetch transport on its own", () => {
  it("refuses a body-bearing GET with an explanation instead of a TypeError", async () => {
    const metamoji = new Metamoji({
      restHost: origin,
      transport: createFetchTransport(),
    });

    const { error } = await metamoji.users.get();
    expect(error?.name).toBe("network_error");
    expect(error?.message).toContain("dropBodyOnGet");
  });

  it("sends the request without its body when dropBodyOnGet is set", async () => {
    received.length = 0;
    const metamoji = new Metamoji({
      restHost: origin,
      transport: createDefaultTransport(),
      dropBodyOnGet: true,
    });

    const { error } = await metamoji.users.get();
    expect(error).toBeNull();
    expect(received[0].body).toBe("");
  });
});
