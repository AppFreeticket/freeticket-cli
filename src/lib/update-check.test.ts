import { describe, expect, it } from "vitest";
import { isNewer } from "./update-check";

describe("isNewer", () => {
  it("detects newer versions across each semver field", () => {
    expect(isNewer("0.7.0", "0.6.0")).toBe(true);
    expect(isNewer("1.0.0", "0.9.9")).toBe(true);
    expect(isNewer("0.6.1", "0.6.0")).toBe(true);
  });

  it("is false for equal or older versions", () => {
    expect(isNewer("0.6.0", "0.6.0")).toBe(false);
    expect(isNewer("0.5.9", "0.6.0")).toBe(false);
    expect(isNewer("0.6.0", "0.6.1")).toBe(false);
  });

  it("ignores a leading v and prerelease tags", () => {
    expect(isNewer("v0.7.0", "0.6.0")).toBe(true);
    expect(isNewer("0.7.0-beta.1", "0.7.0")).toBe(false);
  });
});
