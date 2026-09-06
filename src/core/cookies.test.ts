import { describe, expect, it } from "vitest";

import { CookieJar } from "./cookies.js";

describe("CookieJar", () => {
  it("carries a domain cookie from the login host to the tenant host", () => {
    const jar = new CookieJar();
    jar.save("cs", "https://mps.metamoji.com/users3/login", [
      "JSESSIONID=abc; Domain=.metamoji.com; Path=/; HttpOnly",
    ]);
    expect(jar.header("cs", "https://tenant7.metamoji.com/users2/login/user")).toBe(
      "JSESSIONID=abc",
    );
  });

  it("keeps a cookie with no Domain to the exact host that set it", () => {
    const jar = new CookieJar();
    jar.save("cs", "https://mps.metamoji.com/users3/login", ["JSESSIONID=abc; Path=/"]);
    expect(jar.header("cs", "https://mps.metamoji.com/x")).toBe("JSESSIONID=abc");
    expect(jar.header("cs", "https://tenant7.metamoji.com/x")).toBeUndefined();
  });

  it("ignores a Domain the setting host is not under", () => {
    const jar = new CookieJar();
    jar.save("cs", "https://evil.example/", ["S=1; Domain=.metamoji.com"]);
    expect(jar.header("cs", "https://mps.metamoji.com/")).toBeUndefined();
    // It is still stored host-only, which is what a browser does.
    expect(jar.header("cs", "https://evil.example/")).toBe("S=1");
  });

  it("does not match a domain that is only a string suffix", () => {
    const jar = new CookieJar();
    jar.save("cs", "https://metamoji.com/", ["S=1; Domain=metamoji.com"]);
    expect(jar.header("cs", "https://notmetamoji.com/")).toBeUndefined();
  });

  it("keeps scopes apart even on the same host", () => {
    const jar = new CookieJar();
    jar.save("cs", "https://a.example/", ["S=cs"]);
    jar.save("sd", "https://a.example/", ["S=sd"]);
    expect(jar.header("cs", "https://a.example/")).toBe("S=cs");
    expect(jar.header("sd", "https://a.example/")).toBe("S=sd");

    jar.clear("sd");
    expect(jar.header("sd", "https://a.example/")).toBeUndefined();
    expect(jar.header("cs", "https://a.example/")).toBe("S=cs");
  });

  it("replaces a cookie of the same name and drops it on Max-Age=0", () => {
    const jar = new CookieJar();
    jar.save("cs", "https://a.example/", ["S=1"]);
    jar.save("cs", "https://a.example/", ["S=2"]);
    expect(jar.header("cs", "https://a.example/")).toBe("S=2");

    jar.save("cs", "https://a.example/", ["S=; Max-Age=0"]);
    expect(jar.has("cs")).toBe(false);
  });
});
