import { describe, expect, it } from "vitest";

import { md5 } from "./md5.js";

describe("md5", () => {
  // RFC 1321's own test suite. If these pass, the licence hashes are right.
  it.each([
    ["", "d41d8cd98f00b204e9800998ecf8427e"],
    ["a", "0cc175b9c0f1b6a831c399e269772661"],
    ["abc", "900150983cd24fb0d6963f7d28e17f72"],
    ["message digest", "f96b697d7cb7938d525a2f31aaf161d0"],
    ["abcdefghijklmnopqrstuvwxyz", "c3fcd3d76192e4007dfb496cca67e13b"],
    [
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
      "d174ab98d277d9f5a5611c2c9f419d9f",
    ],
    [
      "12345678901234567890123456789012345678901234567890123456789012345678901234567890",
      "57edf4a22be3c955ac49da2e2107b67a",
    ],
  ])("hashes %j", (input, expected) => {
    expect(md5(input)).toBe(expected);
  });

  it.each([
    // Lengths that stress the padding: 56 bytes pushes the length field into a
    // second block, 64 is an exact block.
    ["a".repeat(56), "3b0c8ac703f828b04c6c197006d17218"],
    ["a".repeat(64), "014842d480b571495a4a0363793f7367"],
  ])("pads a %d-byte message correctly", (input, expected) => {
    expect(md5(input)).toBe(expected);
  });

  it("hashes multi-byte characters as UTF-8", () => {
    expect(md5("\u65e5\u672c\u8a9e")).toBe("00110af8b4393ef3f72c50be5b332bec");
  });
});
