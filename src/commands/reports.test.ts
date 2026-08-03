import { afterEach, describe, expect, it, vi } from "vitest";
import { printExport } from "./reports";

/** Captures whatever the command writes to stdout. */
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

afterEach(() => vi.restoreAllMocks());

describe("printExport", () => {
  // /reports/exports/reconciliation answers text/csv, so the payload reaches
  // us as a string. Issue #22: it used to go through JSON.stringify, which
  // quoted the whole file and turned the newlines into a literal backslash-n.
  const csv = "a,b\n1,2\n3,4";

  it("writes a text/csv payload verbatim", () => {
    const out = capture(() => printExport(csv, {}));
    expect(out).toBe("a,b\n1,2\n3,4\n");
    expect(out).not.toContain("\\n");
    expect(out.startsWith('"')).toBe(false);
  });

  it("does not double the trailing newline", () => {
    expect(capture(() => printExport(`${csv}\n`, {}))).toBe(`${csv}\n`);
  });

  it("serializes JSON rows to CSV with --csv", () => {
    const out = capture(() => printExport([{ a: 1, b: 2 }], { csv: true }));
    expect(out).toBe("a,b\n1,2\n");
  });

  it("falls back to JSON when the payload is rows and --csv is absent", () => {
    const out = capture(() => printExport([{ a: 1 }], { json: true }));
    expect(JSON.parse(out)).toEqual([{ a: 1 }]);
  });
});
