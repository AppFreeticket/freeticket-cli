import { describe, expect, it } from "vitest";
import { readOnlyRefusal, withQuery } from "./auth";

describe("ft login --read-only", () => {
  it("adds scope=read and keeps the device code", () => {
    const url = new URL(
      withQuery("https://admin.x/device?code=ABCD-EFGH", "scope", "read"),
    );
    expect(url.searchParams.get("code")).toBe("ABCD-EFGH");
    expect(url.searchParams.get("scope")).toBe("read");
  });

  it.each([
    ["write", true],
    [undefined, true], // server older than contract 1.43.0
    ["read", false],
  ])("scope %s → refused: %s", (scope, refused) => {
    expect(readOnlyRefusal(true, scope) !== null).toBe(refused);
  });

  it("never refuses without --read-only", () => {
    expect(readOnlyRefusal(undefined, "write")).toBeNull();
  });
});
