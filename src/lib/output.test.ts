import { describe, expect, it } from "vitest";
import { toCsv } from "./output";

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
