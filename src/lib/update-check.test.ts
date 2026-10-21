import { describe, expect, it } from "vitest";
import { isNewer, updateCheckDisabled } from "./update-check";

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

describe("updateCheckDisabled", () => {
  const argv = ["node", "ft", "events", "list"];

  it("checks in an interactive terminal with human output", () => {
    expect(updateCheckDisabled(argv, {}, true)).toBe(false);
  });

  it("stays quiet without a TTY, in CI, or when opted out", () => {
    expect(updateCheckDisabled(argv, {}, false)).toBe(true);
    expect(updateCheckDisabled(argv, { CI: "true" }, true)).toBe(true);
    expect(updateCheckDisabled(argv, { FT_NO_UPDATE_CHECK: "1" }, true)).toBe(
      true,
    );
  });

  it("stays quiet when the output is for a machine", () => {
    for (const flag of ["--json", "--raw", "--csv"])
      expect(updateCheckDisabled([...argv, flag], {}, true)).toBe(true);
  });
});
