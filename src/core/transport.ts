/**
 * How a request actually reaches the network.
 *
 * Two implementations exist for one awkward reason: **this API sends JSON
 * bodies on GET and DELETE requests.** That is not an accident of the
 * documentation — `CsParamBaseAbstract#stringify()` builds a body for every
 * call regardless of verb, so `GET /users2/login/user` and
 * `GET /mpsroot/crashlog/upload` carry their parameters in the body
 * (docs/typespec/README.md, "GET/DELETE + JSONボディ").
 *
 * `fetch` refuses outright: undici throws "Request with GET/HEAD method cannot
 * have body". So a body-bearing GET is routed to `node:http` instead, which has
 * no such objection. Everything else goes through `fetch`, which keeps the
 * client usable in a browser or a Tauri webview as long as those endpoints are
 * left alone.
 */

export interface TransportRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: Uint8Array | string;
  /** Milliseconds; 0 or undefined means no client-side deadline. */
  timeout?: number;
}

export interface TransportResponse {
  status: number;
  statusText: string;
  /** Lowercased header names. Repeated headers are joined with ", ". */
  headers: Record<string, string>;
  /** `Set-Cookie` kept unjoined — splitting it back apart is not reliable. */
  setCookie: string[];
  body: Uint8Array;
}

export type Transport = (request: TransportRequest) => Promise<TransportResponse>;

export type FetchLike = (input: string, init: Record<string, unknown>) => Promise<Response>;

const BODYLESS_METHODS = new Set(["GET", "HEAD"]);

export function needsNodeTransport(request: TransportRequest): boolean {
  return request.body !== undefined && BODYLESS_METHODS.has(request.method.toUpperCase());
}

/**
 * The transport used when the caller supplies none: `fetch`, with `node:http`
 * standing in for the requests `fetch` will not make.
 */
export function createDefaultTransport(customFetch?: FetchLike): Transport {
  const viaFetch = createFetchTransport(customFetch);
  let viaNode: Transport | undefined;

  return async (request) => {
    if (!needsNodeTransport(request)) return viaFetch(request);
    viaNode ??= await createNodeTransport();
    return viaNode(request);
  };
}

export function createFetchTransport(customFetch?: FetchLike): Transport {
  return async (request) => {
    const fetchImpl = customFetch ?? (globalThis.fetch as FetchLike | undefined);
    if (!fetchImpl) {
      throw new Error(
        "No fetch implementation found. Pass `fetch` in the client options, or run on Node 18+.",
      );
    }
    if (needsNodeTransport(request)) {
      throw new Error(
        `fetch cannot send a body on a ${request.method} request. ` +
          "Use the default transport on Node, or set `dropBodyOnGet: true` to send it without one.",
      );
    }

    const init: Record<string, unknown> = {
      method: request.method,
      headers: request.headers,
      // Cookies are managed by this client's own jar, not the browser's.
      credentials: "omit",
      redirect: "follow",
    };
    if (request.body !== undefined) init.body = request.body;
    if (request.timeout && typeof AbortSignal?.timeout === "function") {
      init.signal = AbortSignal.timeout(request.timeout);
    }

    const response = await fetchImpl(request.url, init);
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    const getSetCookie = (response.headers as { getSetCookie?: () => string[] }).getSetCookie;
    const setCookie = typeof getSetCookie === "function"
      ? getSetCookie.call(response.headers)
      : splitSetCookie(response.headers.get("set-cookie"));

    return {
      status: response.status,
      statusText: response.statusText,
      headers,
      setCookie,
      body: new Uint8Array(await response.arrayBuffer()),
    };
  };
}

/** Node's `http`/`https`, which will put a body on a GET without complaining. */
export async function createNodeTransport(): Promise<Transport> {
  let http: typeof import("node:http");
  let https: typeof import("node:https");
  try {
    [http, https] = await Promise.all([import("node:http"), import("node:https")]);
  } catch (cause) {
    throw new Error(
      "This endpoint sends a body on a GET request, which fetch forbids and this runtime " +
        "cannot work around (node:http is unavailable). Set `dropBodyOnGet: true` to send " +
        "the request without its body, or supply your own `transport`.",
      { cause },
    );
  }

  return (request) =>
    new Promise<TransportResponse>((resolve, reject) => {
      const url = new URL(request.url);
      const client = url.protocol === "http:" ? http : https;
      const payload = typeof request.body === "string"
        ? new TextEncoder().encode(request.body)
        : request.body;

      const headers: Record<string, string> = { ...request.headers };
      if (payload) headers["content-length"] = String(payload.byteLength);

      const req = client.request(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || undefined,
          path: `${url.pathname}${url.search}`,
          method: request.method,
          headers,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => {
            const flat: Record<string, string> = {};
            for (const [key, value] of Object.entries(res.headers)) {
              if (value === undefined) continue;
              flat[key.toLowerCase()] = Array.isArray(value) ? value.join(", ") : value;
            }
            const body = Buffer.concat(chunks);
            resolve({
              status: res.statusCode ?? 0,
              statusText: res.statusMessage ?? "",
              headers: flat,
              setCookie: res.headers["set-cookie"] ?? [],
              body: new Uint8Array(body.buffer, body.byteOffset, body.byteLength),
            });
          });
        },
      );

      req.on("error", reject);
      if (request.timeout) {
        req.setTimeout(request.timeout, () => {
          req.destroy(new Error(`Request to ${request.url} timed out after ${request.timeout}ms`));
        });
      }
      if (payload) req.write(payload);
      req.end();
    });
}

/**
 * Last-resort split for runtimes without `Headers.getSetCookie`. Commas inside
 * an `Expires` date make this ambiguous, so it only splits where a comma is
 * followed by something that looks like the start of a new cookie pair.
 */
function splitSetCookie(header: string | null): string[] {
  if (!header) return [];
  return header.split(/,\s*(?=[^;,]+?=[^;,]*)/g).map((s) => s.trim()).filter(Boolean);
}
