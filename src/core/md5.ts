/**
 * MD5, for the licence activation endpoints' tamper check.
 *
 * `LicenseUtil.createHash` signs each request and each response with
 * `MD5("mmj:" + field + ":" + field ...)`, and the client is expected to verify
 * the response's hash before trusting it. That is the only place a digest is
 * needed, so it is implemented here rather than pulled in — this keeps the
 * package dependency-free and working in a browser, where `node:crypto` is not
 * available and `crypto.subtle` does not offer MD5 at all.
 *
 * MD5 is used because the server uses it. It is not a security control here.
 */

const S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

const K = new Uint32Array(64);
for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296);

function rotl(value: number, shift: number): number {
  return (value << shift) | (value >>> (32 - shift));
}

/** Lowercase hex MD5 of a UTF-8 string. */
export function md5(input: string): string {
  const message = new TextEncoder().encode(input);

  // Pad to a multiple of 64 bytes: 0x80, zeros, then the bit length as LE u64.
  const paddedLength = (((message.length + 8) >> 6) + 1) << 6;
  const padded = new Uint8Array(paddedLength);
  padded.set(message);
  padded[message.length] = 0x80;

  const bitLength = message.length * 8;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, bitLength >>> 0, true);
  view.setUint32(paddedLength - 4, Math.floor(bitLength / 4294967296), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  const chunk = new Uint32Array(16);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i++) chunk[i] = view.getUint32(offset + i * 4, true);

    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      const temp = d;
      d = c;
      c = b;
      b = (b + rotl((a + f + K[i] + chunk[g]) >>> 0, S[i])) >>> 0;
      a = temp;
    }

    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  return [a0, b0, c0, d0].map(hexLE).join("");
}

/** A word as little-endian hex, which is how MD5 digests are written. */
function hexLE(word: number): string {
  let hex = "";
  for (let i = 0; i < 4; i++) {
    hex += ((word >>> (i * 8)) & 0xff).toString(16).padStart(2, "0");
  }
  return hex;
}
