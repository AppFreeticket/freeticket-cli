import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from "vitest";

const sdk = vi.hoisted(() => ({
  getSettlements: vi.fn(),
  getSettlementsId: vi.fn(),
  postSettlements: vi.fn(),
  postSettlementsFiles: vi.fn(),
  postSettlementsIdRegenerate: vi.fn(),
  postSettlementsIdProofs: vi.fn(),
  postSettlementsIdSend: vi.fn(),
  postSettlementsIdMarkPaid: vi.fn(),
  deleteSettlementsId: vi.fn(),
}));

vi.mock("../admin-client/sdk.gen", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../admin-client/sdk.gen")>()),
  ...sdk,
}));

const { MAX_PDF_BYTES, parseAmount, readPdf, settlementErrorHint } =
  await import("./admin-settlements");
const { flagKey, registerAdmin } = await import("./admin");

const SETTLEMENT = {
  id: "stl_1",
  reference: "LQ-EVT-01112026-SHOW-FTCO",
  label: "Función 1",
  status: "GENERATED",
  amount: 1500000,
  currency: "COP",
  organization: { id: "org_1", name: "Teatro", taxId: null },
  event: { id: "evt_1", name: "Show" },
  eventDate: { id: "ed_1", startsAt: "2026-11-01T00:00:00.000Z" },
};

const ok = (data: unknown) => ({ data: { data }, response: new Response() });
const apiError = (status: number, error: Record<string, unknown>) => ({
  data: undefined,
  error: { error: { retryable: false, ...error } },
  response: new Response(null, { status }),
});

const dir = mkdtempSync(join(tmpdir(), "ft-settlements-"));
const pdf = join(dir, "liquidacion.pdf");
writeFileSync(pdf, "%PDF-1.7 fake");
const notPdf = join(dir, "notes.txt");
writeFileSync(notPdf, "hello");

function build(): Command {
  const program = new Command();
  program.exitOverride();
  registerAdmin(program);
  return program;
}

function settlementsTree(): Command {
  const admin = build().commands.find((c) => c.name() === "admin") as Command;
  return admin.commands.find((c) => c.name() === "settlements") as Command;
}

describe("ft admin settlements command tree", () => {
  it("registers reads and every write", () => {
    const names = settlementsTree()
      .commands.map((c) => c.name())
      .sort();
    expect(names).toEqual([
      "attach",
      "create",
      "delete",
      "get",
      "list",
      "mark-paid",
      "regenerate",
      "send",
      "upload",
    ]);
  });

  it("puts every settlement write behind --yes", () => {
    const root = settlementsTree();
    for (const n of [
      "create",
      "regenerate",
      "attach",
      "send",
      "mark-paid",
      "delete",
    ]) {
      const cmd = root.commands.find((c) => c.name() === n) as Command;
      expect(cmd.options.map((o) => o.long)).toContain("--yes");
    }
  });
});

describe("ft admin settlements commands", () => {
  const env = { ...process.env };
  let stdout: string;
  let stderr: string[];
  let exit: MockInstance<typeof process.exit>;

  beforeEach(() => {
    process.env.FT_ADMIN_TOKEN = "ftpat_test";
    stdout = "";
    stderr = [];
    vi.spyOn(process.stdout, "write").mockImplementation(
      (chunk: string | Uint8Array) => {
        stdout += String(chunk);
        return true;
      },
    );
    vi.spyOn(console, "log").mockImplementation((...a) => {
      stdout += `${a.join(" ")}\n`;
    });
    vi.spyOn(console, "error").mockImplementation((...a) => {
      stderr.push(a.join(" "));
    });
    exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exited");
    }) as never);
    sdk.getSettlementsId.mockResolvedValue(ok(SETTLEMENT));
  });

  afterEach(() => {
    process.env = { ...env };
    vi.restoreAllMocks();
    for (const fn of Object.values(sdk)) fn.mockReset();
  });

  const run = (...args: string[]) =>
    build().parseAsync(["node", "ft", "admin", "settlements", ...args]);

  it("list maps --organization to organizationId and --status through", async () => {
    sdk.getSettlements.mockResolvedValue({
      data: { data: [SETTLEMENT], page: { nextCursor: null, hasMore: false } },
      response: new Response(),
    });
    await run("list", "--organization", "org_1", "--status", "PAID", "--json");
    expect(sdk.getSettlements).toHaveBeenCalledWith({
      query: {
        limit: 20,
        cursor: undefined,
        organizationId: "org_1",
        status: "PAID",
      },
    });
  });

  it("upload sends the PDF as base64 with its file name", async () => {
    sdk.postSettlementsFiles.mockResolvedValue(
      ok({
        storagePath: "settlements/org_1/a.pdf",
        fileName: "liquidacion.pdf",
      }),
    );
    await run("upload", pdf, "--organization", "org_1", "--json");
    expect(sdk.postSettlementsFiles).toHaveBeenCalledWith({
      body: {
        organizationId: "org_1",
        fileName: "liquidacion.pdf",
        contentBase64: Buffer.from("%PDF-1.7 fake").toString("base64"),
      },
    });
    expect(JSON.parse(stdout).storagePath).toBe("settlements/org_1/a.pdf");
  });

  it("upload refuses a non-PDF before calling the API", async () => {
    await expect(
      run("upload", notPdf, "--organization", "org_1"),
    ).rejects.toThrow("exited");
    expect(sdk.postSettlementsFiles).not.toHaveBeenCalled();
  });

  it("create manual --pdf uploads first, then posts with the storagePath", async () => {
    sdk.postSettlementsFiles.mockResolvedValue(
      ok({
        storagePath: "settlements/org_1/a.pdf",
        fileName: "liquidacion.pdf",
      }),
    );
    sdk.postSettlements.mockResolvedValue(
      ok({ id: "stl_9", status: "GENERATED" }),
    );
    const input = {
      mode: "manual",
      organizationId: "org_1",
      label: "Función 1",
      amount: 1000,
    };
    await run(
      "create",
      "--data",
      JSON.stringify(input),
      "--pdf",
      pdf,
      "--yes",
      "--json",
    );
    expect(sdk.postSettlements).toHaveBeenCalledWith({
      body: {
        ...input,
        storagePath: "settlements/org_1/a.pdf",
        fileName: "liquidacion.pdf",
      },
    });
    expect(sdk.postSettlements).toHaveBeenCalledTimes(1);
  });

  it("create auto posts the body as given", async () => {
    sdk.postSettlements.mockResolvedValue(
      ok({ id: "stl_9", status: "GENERATED" }),
    );
    const input = { mode: "auto", eventDateId: "ed_1", commissionRate: 2.99 };
    await run("create", "--data", JSON.stringify(input), "--yes", "--json");
    expect(sdk.postSettlements).toHaveBeenCalledWith({ body: input });
  });

  it("create rejects --pdf with mode auto", async () => {
    await expect(
      run(
        "create",
        "--data",
        '{"mode":"auto","eventDateId":"ed_1"}',
        "--pdf",
        pdf,
        "--yes",
      ),
    ).rejects.toThrow("exited");
    expect(sdk.postSettlements).not.toHaveBeenCalled();
  });

  it("create on DUPLICATE_SETTLEMENT points at the existing id, once", async () => {
    sdk.postSettlements.mockResolvedValue(
      apiError(409, {
        code: "DUPLICATE_SETTLEMENT",
        message: "Ya existe.",
        details: { existingId: "stl_old" },
      }),
    );
    await expect(
      run("create", "--data", '{"mode":"auto","eventDateId":"ed_1"}', "--yes"),
    ).rejects.toThrow("exited");
    expect(exit).toHaveBeenCalledWith(1);
    expect(sdk.postSettlements).toHaveBeenCalledTimes(1);
    expect(stderr.join("\n")).toContain("ft admin settlements get stl_old");
  });

  it("send --yes shows the settlement and sends confirm: true", async () => {
    sdk.postSettlementsIdSend.mockResolvedValue(
      ok({ id: "stl_1", status: "SENT" }),
    );
    await run("send", "stl_1", "--yes", "--json");
    expect(sdk.getSettlementsId).toHaveBeenCalledWith({
      path: { id: "stl_1" },
    });
    expect(sdk.postSettlementsIdSend).toHaveBeenCalledWith({
      path: { id: "stl_1" },
      body: { confirm: true },
    });
    expect(stderr.join("\n")).toContain("LQ-EVT-01112026-SHOW-FTCO");
  });

  it("delete --yes sends confirm: true", async () => {
    sdk.deleteSettlementsId.mockResolvedValue(
      ok({ id: "stl_1", deleted: true }),
    );
    await run("delete", "stl_1", "--yes", "--json");
    expect(sdk.deleteSettlementsId).toHaveBeenCalledWith({
      path: { id: "stl_1" },
      body: { confirm: true },
    });
  });

  it("mark-paid uploads each --proof to the settlement's org, then confirms", async () => {
    sdk.postSettlementsFiles.mockResolvedValue(
      ok({
        storagePath: "settlements/org_1/p.pdf",
        fileName: "liquidacion.pdf",
      }),
    );
    sdk.postSettlementsIdMarkPaid.mockResolvedValue(
      ok({ id: "stl_1", status: "PAID" }),
    );
    await run(
      "mark-paid",
      "stl_1",
      "--proof",
      pdf,
      "--proofs",
      '[{"storagePath":"settlements/org_1/old.pdf","fileName":"old.pdf"}]',
      "--yes",
      "--json",
    );
    expect(
      sdk.postSettlementsFiles.mock.calls[0]?.[0].body.organizationId,
    ).toBe("org_1");
    expect(sdk.postSettlementsIdMarkPaid).toHaveBeenCalledWith({
      path: { id: "stl_1" },
      body: {
        confirm: true,
        proofs: [
          { storagePath: "settlements/org_1/old.pdf", fileName: "old.pdf" },
          {
            storagePath: "settlements/org_1/p.pdf",
            fileName: "liquidacion.pdf",
          },
        ],
      },
    });
  });

  it("mark-paid without receipts stops before any call", async () => {
    await expect(run("mark-paid", "stl_1", "--yes")).rejects.toThrow("exited");
    expect(sdk.getSettlementsId).not.toHaveBeenCalled();
    expect(sdk.postSettlementsIdMarkPaid).not.toHaveBeenCalled();
  });

  it("attach sends confirm only with --amount", async () => {
    sdk.postSettlementsIdProofs.mockResolvedValue(
      ok({ id: "stl_1", status: "GENERATED" }),
    );
    await run(
      "attach",
      "stl_1",
      "--storage-path",
      "settlements/org_1/a.pdf",
      "--file-name",
      "a.pdf",
      "--yes",
      "--json",
    );
    expect(sdk.postSettlementsIdProofs).toHaveBeenLastCalledWith({
      path: { id: "stl_1" },
      body: { storagePath: "settlements/org_1/a.pdf", fileName: "a.pdf" },
    });
    await run(
      "attach",
      "stl_1",
      "--storage-path",
      "settlements/org_1/a.pdf",
      "--file-name",
      "a.pdf",
      "--amount",
      "1200.5",
      "--yes",
      "--json",
    );
    expect(sdk.postSettlementsIdProofs).toHaveBeenLastCalledWith({
      path: { id: "stl_1" },
      body: {
        storagePath: "settlements/org_1/a.pdf",
        fileName: "a.pdf",
        amount: 1200.5,
        confirm: true,
      },
    });
  });

  it("regenerate passes commission and fixed fee as numbers", async () => {
    sdk.postSettlementsIdRegenerate.mockResolvedValue(
      ok({ id: "stl_1", status: "AWAITING_PAYMENT" }),
    );
    await run(
      "regenerate",
      "stl_1",
      "--commission-rate",
      "2.9916",
      "--fixed-fee",
      "500",
      "--yes",
      "--json",
    );
    expect(sdk.postSettlementsIdRegenerate).toHaveBeenCalledWith({
      path: { id: "stl_1" },
      body: { commissionRate: 2.9916, fixedFee: 500 },
    });
  });

  it("AMOUNT_MISMATCH says nothing was written", async () => {
    sdk.postSettlementsIdRegenerate.mockResolvedValue(
      apiError(409, { code: "AMOUNT_MISMATCH", message: "No cuadra." }),
    );
    await expect(run("regenerate", "stl_1", "--yes")).rejects.toThrow("exited");
    expect(stderr.join("\n")).toContain("nothing was written");
  });
});

describe("helpers", () => {
  it("readPdf enforces the 3 MB cap and the %PDF header", () => {
    const pdfBuf = Buffer.from("%PDF-1.4");
    expect(readPdf("/x/a.pdf", { size: () => 8, read: () => pdfBuf })).toEqual({
      fileName: "a.pdf",
      contentBase64: pdfBuf.toString("base64"),
    });
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exited");
    }) as never);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      readPdf("/x/big.pdf", {
        size: () => MAX_PDF_BYTES + 1,
        read: () => pdfBuf,
      }),
    ).toThrow("exited");
    expect(() =>
      readPdf("/x/a.txt", { size: () => 5, read: () => Buffer.from("hello") }),
    ).toThrow("exited");
    expect(exit).toHaveBeenCalledTimes(2);
    vi.restoreAllMocks();
  });

  it("parseAmount allows two decimals at most", () => {
    expect(parseAmount("1500.25")).toBe(1500.25);
    vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exited");
    }) as never);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => parseAmount("1.234")).toThrow("exited");
    expect(() => parseAmount("0")).toThrow("exited");
    vi.restoreAllMocks();
  });

  it("settlementErrorHint leaves unknown codes alone", () => {
    expect(settlementErrorHint({ code: "NOT_FOUND" }, undefined)).toBeNull();
  });

  it("flagKey reads the option name, not the query name", () => {
    expect(flagKey("--organization <id>")).toBe("organization");
    expect(flagKey("--with-total")).toBe("withTotal");
    expect(flagKey("--event-date <id>")).toBe("eventDate");
  });
});
