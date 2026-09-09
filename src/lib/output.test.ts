import { afterEach, describe, expect, it, vi } from "vitest";
import { print, printEmptyScope, toCsv } from "./output";

// printEmptyScope falls back to the stored session workspace, so without this
// the test would read the developer's real ~/.freeticket/config.json.
vi.mock("./config", () => ({ loadConfig: () => ({}) }));

describe("toCsv", () => {
  const cols = ["id", "reference", "status", "total", "currency", "createdAt"];

  it("emits only the header when rows are empty but columns are known", () => {
    expect(toCsv([], cols)).toBe(
      "id,reference,status,total,currency,createdAt",
    );
  });

  it("emits only the header when data is undefined but columns are known", () => {
    expect(toCsv(undefined, cols)).toBe(
      "id,reference,status,total,currency,createdAt",
    );
  });

  it("stays empty when there are neither rows nor columns", () => {
    expect(toCsv([])).toBe("");
    expect(toCsv(undefined)).toBe("");
  });

  it("serializes rows with RFC 4180 quoting", () => {
    const csv = toCsv(
      [{ id: 1, name: 'a,"b"', obj: { x: 1 } }],
      ["id", "name", "obj"],
    );
    expect(csv).toBe('id,name,obj\n1,"a,""b""","{""x"":1}"');
  });
});

/** Captures whatever is written to stdout. */
function capture(fn: () => void): string {
  let out = "";
  const spy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: string | Uint8Array) => {
      out += String(chunk);
      return true;
    });
  fn();
  spy.mockRestore();
  return out;
}

/** Captures stderr (hints live there so --json stays pipeable). */
function captureErr(fn: () => void): string {
  let out = "";
  const spy = vi.spyOn(console, "error").mockImplementation((...args) => {
    out += `${args.join(" ")}\n`;
  });
  fn();
  spy.mockRestore();
  return out;
}

afterEach(() => vi.restoreAllMocks());

const rows = [
  {
    id: "e1",
    name: "Yopal",
    status: "PUBLISHED",
    description: "x".repeat(400),
  },
];

describe("print --json", () => {
  it("honors an explicit --columns instead of dumping every field", () => {
    const out = capture(() =>
      print(rows, {
        json: true,
        columns: ["id", "name"],
        columnsExplicit: true,
      }),
    );
    expect(JSON.parse(out)).toEqual([{ id: "e1", name: "Yopal" }]);
  });

  it("keeps whole rows when --columns was not typed", () => {
    // The curated default must not leak into JSON: `| jq .description` would
    // start returning null for every caller that relies on it today.
    const out = capture(() =>
      print(rows, { json: true, columns: ["id", "name"] }),
    );
    expect(JSON.parse(out)[0]).toHaveProperty("description");
  });
});

describe("printEmptyScope", () => {
  it("names the workspace when it is known", () => {
    expect(captureErr(() => printEmptyScope("ws_123"))).toContain("ws_123");
  });

  it("points at whoami when the scope is the session default", () => {
    const msg = captureErr(() => printEmptyScope());
    expect(msg).toContain("ft whoami");
    expect(msg).toContain("--workspace");
  });
});
