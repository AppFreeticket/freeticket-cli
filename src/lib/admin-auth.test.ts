import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { client as adminClient } from "../admin-client/client.gen";
import { configureAdminClient } from "./api";

const saved = { ...process.env };

describe("configureAdminClient", () => {
  beforeEach(() => {
    process.env.FT_API_URL = "http://admin.localhost:3000";
    delete process.env.FT_ADMIN_TOKEN;
    delete process.env.FT_ADMIN_SESSION;
  });
  afterEach(() => {
    process.env = { ...saved };
    vi.restoreAllMocks();
  });

  function headers(): Headers {
    return new Headers(
      adminClient.getConfig().headers as ConstructorParameters<
        typeof Headers
      >[0],
    );
  }

  it("sends FT_ADMIN_TOKEN as a Bearer service token, without the cookie", () => {
    process.env.FT_ADMIN_TOKEN = "ftpat_test";
    process.env.FT_ADMIN_SESSION = "cookie_should_lose";
    configureAdminClient();
    expect(adminClient.getConfig().baseUrl).toBe(
      "http://admin.localhost:3000/api/admin",
    );
    expect(headers().get("authorization")).toBe("Bearer ftpat_test");
    expect(headers().get("cookie")).toBeNull();
  });

  it("falls back to the session cookie when no token is set", () => {
    process.env.FT_ADMIN_SESSION = "sess_123";
    configureAdminClient();
    expect(headers().get("cookie")).toBe("better-auth.session_token=sess_123");
    // The Bearer from the previous test must not linger on the singleton.
    expect(headers().get("authorization")).toBeNull();
  });
});
