import { afterEach, beforeEach, expect, test } from "vitest";
import { loadConfig } from "./config";

const saved = { ...process.env };
beforeEach(() => {
  delete process.env.FT_API_URL;
  delete process.env.FT_API_KEY;
  delete process.env.FT_WORKSPACE_ID;
});
afterEach(() => {
  process.env = { ...saved };
});

test("env vars toman precedencia y se resuelven", () => {
  process.env.FT_API_URL = "http://admin.localhost:3000";
  process.env.FT_API_KEY = "ft_live_test";
  process.env.FT_WORKSPACE_ID = "org_123";
  const cfg = loadConfig();
  expect(cfg).toEqual({
    apiUrl: "http://admin.localhost:3000",
    apiKey: "ft_live_test",
    workspaceId: "org_123",
  });
});

test("apiUrl cae al default cuando no hay env ni archivo", () => {
  // Asume sin ~/.freeticket/config.json en el entorno de CI.
  const cfg = loadConfig();
  expect(cfg.apiUrl).toBe("https://admin.appfreeticket.com");
});
