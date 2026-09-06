/**
 * A multipart/form-data writer.
 *
 * The platform `FormData` is not usable here. Most of the multipart endpoints
 * add JSON parts the way OkHttp's `addFormDataPart(name, null, jsonBody)` does:
 * a part with a `Content-Type` but *no* `filename`. Appending a `Blob` to a
 * `FormData` always emits `filename="blob"`, and appending a string always
 * emits `Content-Type: text/plain`. Neither is what these servers were built
 * against, so the body is assembled here instead, with exact control over each
 * part's headers.
 */

export interface MultipartPart {
  name: string;
  value: string | Uint8Array;
  /** Emitted as `filename="..."`. Omit for a plain field, as OkHttp does. */
  filename?: string;
  contentType?: string;
}

export interface MultipartBody {
  contentType: string;
  body: Uint8Array;
}

/** A file part: bytes plus the metadata a server needs to interpret them. */
export interface FilePart {
  /** File contents. */
  data: Uint8Array | ArrayBuffer;
  /** Sent as the part's `filename`; the app uses `File.getName()`. */
  filename?: string;
  contentType?: string;
}

function toBytes(data: Uint8Array | ArrayBuffer): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

/** A field whose value is JSON-encoded into a single part, as the app does. */
export function jsonPart(name: string, value: unknown): MultipartPart {
  return { name, value: JSON.stringify(value), contentType: "application/json" };
}

export function filePart(name: string, file: FilePart, fallbackType?: string): MultipartPart {
  return {
    name,
    value: toBytes(file.data),
    filename: file.filename ?? name,
    contentType: file.contentType ?? fallbackType ?? "application/octet-stream",
  };
}

/**
 * Appends `name` -> `value` only when the value is set, so optional parts stay
 * absent rather than being sent as the string "undefined".
 */
export function optionalPart(
  parts: MultipartPart[],
  name: string,
  value: string | number | boolean | undefined | null,
): void {
  if (value === undefined || value === null) return;
  parts.push({ name, value: String(value) });
}

function randomBoundary(): string {
  let s = "";
  for (let i = 0; i < 24; i++) s += Math.floor(Math.random() * 36).toString(36);
  return `----MetamojiFormBoundary${s}`;
}

export function buildMultipart(parts: MultipartPart[], boundary = randomBoundary()): MultipartBody {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];

  for (const part of parts) {
    let head = `--${boundary}\r\nContent-Disposition: form-data; name="${escapeQuotes(part.name)}"`;
    if (part.filename !== undefined) head += `; filename="${escapeQuotes(part.filename)}"`;
    head += "\r\n";
    if (part.contentType) head += `Content-Type: ${part.contentType}\r\n`;
    head += "\r\n";

    chunks.push(encoder.encode(head));
    chunks.push(typeof part.value === "string" ? encoder.encode(part.value) : part.value);
    chunks.push(encoder.encode("\r\n"));
  }
  chunks.push(encoder.encode(`--${boundary}--\r\n`));

  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { contentType: `multipart/form-data; boundary=${boundary}`, body };
}

/**
 * RFC 7578 says nothing useful about quotes in a part name, and OkHttp
 * percent-escapes them. None of the names or filenames this client sends should
 * contain one, but a caller-supplied filename might.
 */
function escapeQuotes(value: string): string {
  return value.replace(/"/g, "%22").replace(/[\r\n]/g, "");
}
