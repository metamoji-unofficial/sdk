/**
 * URL assembly.
 *
 * Small, but worth keeping apart from configuration: a base URL here can be a
 * constant, a value from a login response, or an absolute URL the server handed
 * out, and all three go through the same joining rules.
 */

export function withTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

/** Joins a base and a path without doubling or dropping the separator. */
export function joinUrl(base: string, path: string): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path)) return path;
  return withTrailingSlash(base) + path.replace(/^\/+/, "");
}

/** Appends query parameters, skipping ones that are unset. */
export function withQuery(
  url: string,
  query: Record<string, string | number | boolean | undefined | null> | undefined,
): string {
  if (!query) return url;
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  if (pairs.length === 0) return url;
  return url + (url.includes("?") ? "&" : "?") + pairs.join("&");
}
