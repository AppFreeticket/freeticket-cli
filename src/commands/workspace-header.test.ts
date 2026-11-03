import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Nothing mocked but `fetch`: the real program, the real `configureClient`
 * and the real config resolution, fed by a fake environment (FT_API_KEY, and
 * FT_API_URL pointing at a closed local port from src/test/setup.ts). wire.test
 * replaces `configureClient`, so a command that stopped calling it, or called
 * it before reading `--workspace`, would still pass there. Here the request
 * has to carry the key and the workspace the user asked for.
 */
const fetchMock = vi.fn();
const { program } = await import("../program");

beforeEach(() => {
  vi.stubEnv("FT_API_KEY", "ft_test_key");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(
    async () =>
      new Response(JSON.stringify({ data: [] }), {
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process, "exit").mockImplementation((() => {
    throw new Error("exited");
  }) as never);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fetchMock.mockReset();
});

async function request(...args: string[]): Promise<Request> {
  await program.parseAsync(["node", "ft", ...args, "--json"]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  return fetchMock.mock.calls[0]?.[0] as Request;
}

describe("X-Workspace-Id and the API key reach the wire", () => {
  it.each([
    ["op()", ["events", "viewers", "list", "evt_A"], "/events/evt_A/viewers"],
    [
      "ops.ts",
      ["presale-windows", "list", "tt_A"],
      "/ticket-types/tt_A/presale-windows",
    ],
    [
      "lineup.ts",
      ["events", "invitations", "list", "evt_A"],
      "/events/evt_A/artist-invitations",
    ],
  ])("%s: --workspace becomes the header", async (_via, args, path) => {
    const req = await request(...args, "--workspace", "ws_FLAG");
    expect(req.url).toBe(`http://127.0.0.1:9/api/v1${path}`);
    expect(req.headers.get("X-Workspace-Id")).toBe("ws_FLAG");
    expect(req.headers.get("Authorization")).toBe("Bearer ft_test_key");
  });

  it("FT_WORKSPACE_ID applies when no --workspace is passed", async () => {
    vi.stubEnv("FT_WORKSPACE_ID", "ws_ENV");
    const req = await request("events", "viewers", "list", "evt_A");
    expect(req.headers.get("X-Workspace-Id")).toBe("ws_ENV");
  });

  it("--workspace beats FT_WORKSPACE_ID", async () => {
    vi.stubEnv("FT_WORKSPACE_ID", "ws_ENV");
    const req = await request(
      "presale-windows",
      "list",
      "tt_A",
      "--workspace",
      "ws_FLAG",
    );
    expect(req.headers.get("X-Workspace-Id")).toBe("ws_FLAG");
  });
});
