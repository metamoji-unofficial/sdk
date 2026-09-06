/**
 * A minimal cookie jar, because the app's sessions are cookie-based.
 *
 * `fetch` in Node does not persist cookies, and the API has no bearer token to
 * fall back on: `POST /users3/login` hands back a session cookie that every
 * later request has to carry (docs/typespec/README.md, "認証").
 *
 * `Domain` has to be honoured rather than keyed on origin, because the flow
 * depends on it: login happens against the bootstrap root server and every
 * later call against the tenant `restHost`, which is a different host. A
 * domain-scoped cookie set at login is what carries across.
 *
 * `Path`, `Expires`, `Max-Age` and `Secure` are ignored. All the cookies in
 * play here are session cookies at the root path, and OkHttp's `NwCookieJar`
 * amounts to the same thing for a single-tenant client.
 *
 * Scopes exist because the app really does keep several independent sessions,
 * often against the same host. `SdHttpClient` has its own static jar
 * (drive/sync-drive.tsp), and the gallery-media subsystem re-authenticates via
 * `gallery/LoginMedia`. One shared jar would let a sync login quietly replace
 * the main session.
 *
 * `webdav` is a scope for the opposite reason. It authenticates with Basic and
 * an app code rather than a cookie, so it has no session to keep — but the same
 * client is reused verbatim for *arbitrary user-configured WebDAV servers*
 * (drive/webdav.tsp), and whatever those set must not land in the jar the
 * MetaMoJi session is kept in.
 */

export type SessionScope = "cs" | "sd" | "media" | "collabo" | "store" | "flora" | "webdav";

export const SESSION_SCOPES: readonly SessionScope[] = [
  "cs",
  "sd",
  "media",
  "collabo",
  "store",
  "flora",
  "webdav",
];

interface StoredCookie {
  name: string;
  value: string;
  /** Lowercased, with no leading dot. */
  domain: string;
  /** True when no `Domain` was given, so only the exact host matches. */
  hostOnly: boolean;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/** RFC 6265's domain match: exact, or a dot-separated suffix. */
function domainMatches(host: string, cookie: StoredCookie): boolean {
  if (host === cookie.domain) return true;
  if (cookie.hostOnly) return false;
  return host.endsWith(`.${cookie.domain}`);
}

export class CookieJar {
  /** scope -> "domain|name" -> cookie */
  private readonly store = new Map<SessionScope, Map<string, StoredCookie>>();

  /** Records `Set-Cookie` headers from a response. */
  save(scope: SessionScope, url: string, setCookies: string[]): void {
    if (setCookies.length === 0) return;
    const host = hostOf(url);
    const jar = this.store.get(scope) ?? new Map<string, StoredCookie>();

    for (const raw of setCookies) {
      const [pair, ...attributes] = raw.split(";");
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;

      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();

      let domain = host;
      let hostOnly = true;
      for (const attribute of attributes) {
        const at = attribute.indexOf("=");
        if (at === -1) continue;
        if (attribute.slice(0, at).trim().toLowerCase() !== "domain") continue;
        const declared = attribute.slice(at + 1).trim().toLowerCase().replace(/^\./, "");
        // A server may only widen the scope to a domain it is itself under.
        if (declared && (host === declared || host.endsWith(`.${declared}`))) {
          domain = declared;
          hostOnly = false;
        }
      }

      const key = `${domain}|${name}`;
      if (/(^|;)\s*max-age\s*=\s*0\s*(;|$)/i.test(raw)) jar.delete(key);
      else jar.set(key, { name, value, domain, hostOnly });
    }

    this.store.set(scope, jar);
  }

  /** The `Cookie` header value for a request, or undefined when nothing matches. */
  header(scope: SessionScope, url: string): string | undefined {
    const jar = this.store.get(scope);
    if (!jar || jar.size === 0) return undefined;

    const host = hostOf(url);
    const matching = [...jar.values()].filter((cookie) => domainMatches(host, cookie));
    if (matching.length === 0) return undefined;
    return matching.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
  }

  /**
   * Drops a scope's cookies. Mirrors `CsHttpClient#clearSession()` (client-side
   * only — `logout` is what ends the session on the server) and
   * `SdHttpClient.setDiscardCookie(true)`, which the app calls before every
   * sync-drive login attempt.
   */
  clear(scope?: SessionScope): void {
    if (scope) this.store.delete(scope);
    else this.store.clear();
  }

  /** Whether any cookie is held for a scope. */
  has(scope: SessionScope): boolean {
    const jar = this.store.get(scope);
    return jar !== undefined && jar.size > 0;
  }
}
