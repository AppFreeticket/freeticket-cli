import { homedir, tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

/** The global guard of src/test/setup.ts is actually wired (vitest.config.ts). */
describe("test setup guard", () => {
  it("fetch throws instead of reaching the network", async () => {
    await expect(
      fetch("https://admin.appfreeticket.com/api/v1/me"),
    ).rejects.toThrow(/Unexpected network call in a test/);
  });

  it("HOME is a temp dir and FT_API_URL a closed local port", () => {
    expect(homedir().startsWith(tmpdir())).toBe(true);
    expect(process.env.FT_API_URL).toBe("http://127.0.0.1:9");
    expect(process.env.FT_API_KEY).toBeUndefined();
  });
});
