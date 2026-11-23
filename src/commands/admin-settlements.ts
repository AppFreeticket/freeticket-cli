import { readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import chalk from "chalk";
import type { Command } from "commander";
import {
  deleteSettlementsId,
  getSettlementsId,
  postSettlements,
  postSettlementsFiles,
  postSettlementsIdMarkPaid,
  postSettlementsIdProofs,
  postSettlementsIdRegenerate,
  postSettlementsIdSend,
} from "../admin-client/sdk.gen";
import type {
  AdminSettlement,
  AdminSettlementAttachProofInput,
  AdminSettlementCreateInput,
  AdminSettlementFile,
  AdminSettlementRegenerateInput,
} from "../admin-client/types.gen";
import { configureAdminClient, fail } from "../lib/api";
import { confirmOrExit, parseData } from "../lib/input";
import { print } from "../lib/output";
import { crmUnwrap, type ErrorHint } from "./admin-crm";

/**
 * `ft admin settlements …` writes (admin contract 1.9). Read-only `list` and
 * `get` come from the generic admin resource; these are the money moves:
 *
 * - every write shows the settlement it touches (or the body it will create),
 *   then goes through `confirmOrExit`: no TTY and no `--yes` is a hard stop;
 * - `send`, `mark-paid` and `delete` always send `confirm: true` (the backend
 *   answers 422 CONFIRMATION_REQUIRED without it); `attach` sends it only with
 *   `--amount`, which is when the contract asks for it;
 * - nothing is retried by the CLI. The backend is idempotent where it matters
 *   (DUPLICATE_SETTLEMENT, INVALID_STATE on a second send/mark-paid).
 */

/** Backend cap on one uploaded PDF (decoded). */
export const MAX_PDF_BYTES = 3 * 1024 * 1024;

export const settlementErrorHint: ErrorHint = (err, retryAfter) => {
  switch (err.code) {
    case "DUPLICATE_SETTLEMENT": {
      const id = (err.details as { existingId?: string } | undefined)
        ?.existingId;
      return id
        ? `That function already has an active settlement: ${id}\nSee it with \`ft admin settlements get ${id}\`. Delete it first if it is really wrong.`
        : "That function already has an active settlement. Find it with `ft admin settlements list --organization <id>`.";
    }
    case "AMOUNT_MISMATCH":
      return "The recalculated balance does not match the settlement amount, so nothing was written. Generate the settlement from scratch (delete + create).";
    case "INVALID_STATE":
      return "The settlement is not in the state this step needs (e.g. send needs GENERATED, mark-paid and regenerate need AWAITING_PAYMENT). Check it with `ft admin settlements get <id>`.";
    case "CONFIRMATION_REQUIRED":
      return "The backend wants `confirm: true`. The CLI adds it after you answer yes or pass --yes.";
    case "STORAGE_UNAVAILABLE":
    case "UPLOAD_FAILED":
    case "DRAFT_FAILED":
      return "Storage or PDF generation failed on the backend; nothing was created. Safe to run it again by hand in a moment.";
    case "PAYLOAD_TOO_LARGE":
      return "The PDF is over the 3 MB limit. Compress it and upload again.";
    case "RATE_LIMITED":
      return retryAfter !== undefined
        ? `Too many requests. Wait ${retryAfter}s and run it again (the CLI never retries a write on its own).`
        : "Too many requests. Wait a moment and run it again.";
    default:
      return null;
  }
};

const unwrapS = <T>(res: {
  data?: T;
  error?: unknown;
  response: Response;
}): T => crmUnwrap(res, settlementErrorHint);

/**
 * Reads a local PDF for `POST /settlements/files`: checks it exists, fits the
 * 3 MB cap and starts with `%PDF` before anything leaves the machine.
 * Exported for tests (pass `read`/`size` to avoid the disk).
 */
export function readPdf(
  path: string,
  io: {
    read?: (p: string) => Buffer;
    size?: (p: string) => number;
  } = {},
): { fileName: string; contentBase64: string } {
  const size = io.size ?? ((p: string) => statSync(p).size);
  const read = io.read ?? ((p: string) => readFileSync(p));
  let bytes: number;
  try {
    bytes = size(path);
  } catch {
    fail(`Cannot read ${path}: file not found.`);
  }
  if (bytes > MAX_PDF_BYTES)
    fail(
      `${path} is ${(bytes / 1024 / 1024).toFixed(1)} MB; the limit is 3 MB.`,
      "Compress the PDF and try again.",
    );
  const buf = read(path);
  if (buf.subarray(0, 4).toString("latin1") !== "%PDF")
    fail(`${path} is not a PDF (it does not start with %PDF).`);
  return { fileName: basename(path), contentBase64: buf.toString("base64") };
}

/** `--amount` → a positive number with at most two decimals. */
export function parseAmount(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 9999999999.99)
    fail(`Invalid --amount: ${value}. Use a positive number.`);
  if (Math.round(n * 100) / 100 !== n)
    fail(`Invalid --amount: ${value}. At most two decimals.`);
  return n;
}

function parseNumber(flag: string, value: string, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max)
    fail(`Invalid ${flag}: ${value}. Use a number from 0 to ${max}.`);
  return n;
}

async function upload(
  organizationId: string,
  path: string,
): Promise<AdminSettlementFile> {
  const file = readPdf(path);
  return unwrapS(
    await postSettlementsFiles({ body: { organizationId, ...file } }),
  ).data;
}

function money(amount: number, currency: string): string {
  return `${amount.toLocaleString("en-US")} ${currency}`;
}

/** Shows a settlement before a write on it, and returns it. */
async function showSettlement(id: string): Promise<AdminSettlement> {
  const s = unwrapS(await getSettlementsId({ path: { id } })).data;
  console.error(
    [
      `${chalk.bold(s.reference)} (${s.id})`,
      `  ${s.organization.name} · ${s.status} · ${money(s.amount, s.currency)}`,
      `  ${s.label}${s.event ? ` · ${s.event.name}` : ""}${s.eventDate ? ` · ${s.eventDate.startsAt}` : ""}`,
    ].join("\n"),
  );
  return s;
}

export function registerAdminSettlementWrites(root: Command): void {
  root
    .command("upload <file>")
    .description(
      "Upload a PDF (max 3 MB) to an organization's private settlement bucket; prints its storagePath",
    )
    .requiredOption("--organization <id>", "organization the file belongs to")
    .option("--json", "raw JSON output")
    .action(async (file, opts) => {
      configureAdminClient();
      print(await upload(opts.organization, file), { json: opts.json });
    });

  root
    .command("create")
    .description(
      "Create a settlement in GENERATED (does not notify the organizer). mode manual: a PDF + typed amount; mode auto: computed from a function",
    )
    .requiredOption(
      "--data <json>",
      'body: {"mode":"auto","eventDateId":"..."} or {"mode":"manual","organizationId":"...","label":"...","amount":...} (inline or @file.json)',
    )
    .option(
      "--pdf <file>",
      "mode manual: upload this PDF first and fill storagePath/fileName",
    )
    .option("--yes", "skip confirmation")
    .option("--json", "raw JSON output")
    .action(async (opts) => {
      configureAdminClient();
      const raw = parseData(opts.data);
      if (!raw || typeof raw !== "object" || Array.isArray(raw))
        fail("--data must be a JSON object with `mode` (manual | auto).");
      const input = { ...(raw as Record<string, unknown>) };
      if (input.mode !== "manual" && input.mode !== "auto")
        fail("--data needs `mode`: manual or auto.");
      if (opts.pdf && input.mode !== "manual")
        fail("--pdf only applies to mode manual (auto generates its own PDF).");
      if (opts.pdf && !input.organizationId)
        fail("mode manual needs `organizationId` to upload the PDF.");
      // Validate the file before asking, so the confirmation is the last step.
      if (opts.pdf) readPdf(opts.pdf);
      console.error(
        input.mode === "auto"
          ? `auto settlement of function ${String(input.eventDateId ?? "?")}${input.integrate === false ? " (EXAMPLE, not tied to the function)" : ""}`
          : `manual settlement "${String(input.label ?? "?")}" for ${String(input.organizationId)}: ${money(Number(input.amount), String(input.currency ?? "COP"))}`,
      );
      await confirmOrExit(
        "Create this settlement? It starts in GENERATED and is not sent to the organizer",
        opts.yes,
      );
      if (opts.pdf) {
        const file = await upload(String(input.organizationId), opts.pdf);
        input.storagePath = file.storagePath;
        input.fileName = file.fileName;
      }
      const body = unwrapS(
        await postSettlements({ body: input as AdminSettlementCreateInput }),
      );
      print(body.data, { json: opts.json });
      if (!opts.json)
        console.error(
          chalk.dim(
            `\nReview it, then \`ft admin settlements send ${body.data.id}\` to notify the organizer`,
          ),
        );
    });

  root
    .command("regenerate <id>")
    .description(
      "Replace the PDF of an AWAITING_PAYMENT settlement with the final one (amount never changes)",
    )
    .option(
      "--commission-rate <pct>",
      "gateway commission in PERCENT before VAT (e.g. 2.9916)",
    )
    .option(
      "--fixed-fee <cop>",
      "fixed fee per transaction, COP before VAT (e.g. 500)",
    )
    .option("--yes", "skip confirmation")
    .option("--json", "raw JSON output")
    .action(async (id, opts) => {
      configureAdminClient();
      const input: AdminSettlementRegenerateInput = {};
      if (opts.commissionRate !== undefined)
        input.commissionRate = parseNumber(
          "--commission-rate",
          opts.commissionRate,
          100,
        );
      if (opts.fixedFee !== undefined)
        input.fixedFee = parseNumber("--fixed-fee", opts.fixedFee, 100000);
      await showSettlement(id);
      await confirmOrExit(`Regenerate the PDF of settlement ${id}?`, opts.yes);
      const body = unwrapS(
        await postSettlementsIdRegenerate({ path: { id }, body: input }),
      );
      print(body.data, { json: opts.json });
    });

  root
    .command("attach <id>")
    .description(
      "Legacy DRAFT → GENERATED: attach the settlement PDF (transfer receipts go in mark-paid)",
    )
    .option("--pdf <file>", "upload this PDF and attach it")
    .option("--storage-path <path>", "an already uploaded file (see upload)")
    .option("--file-name <name>", "file name for --storage-path")
    .option(
      "--amount <n>",
      "also change the amount paid to the organizer (max 2 decimals)",
    )
    .option("--yes", "skip confirmation")
    .option("--json", "raw JSON output")
    .action(async (id, opts) => {
      configureAdminClient();
      if (!opts.pdf && !opts.storagePath)
        fail("Pass --pdf <file> or --storage-path <path> --file-name <name>.");
      if (opts.storagePath && !opts.fileName)
        fail("--storage-path needs --file-name.");
      const amount =
        opts.amount !== undefined ? parseAmount(opts.amount) : undefined;
      if (opts.pdf) readPdf(opts.pdf);
      const s = await showSettlement(id);
      await confirmOrExit(
        `Attach the PDF to settlement ${id}${amount !== undefined ? ` and set the amount to ${money(amount, s.currency)}` : ""}?`,
        opts.yes,
      );
      const file = opts.pdf
        ? await upload(s.organization.id, opts.pdf)
        : { storagePath: opts.storagePath, fileName: opts.fileName };
      const input: AdminSettlementAttachProofInput = {
        ...file,
        ...(amount !== undefined ? { amount, confirm: true } : {}),
      };
      const body = unwrapS(
        await postSettlementsIdProofs({ path: { id }, body: input }),
      );
      print(body.data, { json: opts.json });
    });

  root
    .command("send <id>")
    .description(
      "GENERATED → SENT: the organizer sees it, can split the payment and gets an email",
    )
    .option("--yes", "skip confirmation")
    .option("--json", "raw JSON output")
    .action(async (id, opts) => {
      configureAdminClient();
      await showSettlement(id);
      await confirmOrExit(
        `Send settlement ${id} to the organizer? They get an email`,
        opts.yes,
      );
      const body = unwrapS(
        await postSettlementsIdSend({ path: { id }, body: { confirm: true } }),
      );
      print(body.data, { json: opts.json });
    });

  root
    .command("mark-paid <id>")
    .description(
      "AWAITING_PAYMENT → PAID with the transfer receipts; emails the organizer",
    )
    .option(
      "--proof <file...>",
      "receipt PDF(s), one per payout account (uploaded first)",
    )
    .option(
      "--proofs <json>",
      'already uploaded receipts: [{"storagePath":"...","fileName":"..."}] (inline or @file.json)',
    )
    .option("--yes", "skip confirmation")
    .option("--json", "raw JSON output")
    .action(async (id, opts) => {
      configureAdminClient();
      const files: string[] = opts.proof ?? [];
      const given = opts.proofs ? parseData(opts.proofs) : [];
      if (!Array.isArray(given))
        fail("--proofs must be a JSON array of {storagePath, fileName}.");
      if (files.length + given.length === 0)
        fail(
          "Pass at least one receipt: --proof <file.pdf> or --proofs <json>.",
        );
      if (files.length + given.length > 20)
        fail("At most 20 receipts per settlement.");
      for (const f of files) readPdf(f);
      const s = await showSettlement(id);
      await confirmOrExit(
        `Mark settlement ${id} as PAID (${money(s.amount, s.currency)}) with ${files.length + given.length} receipt(s)? The organizer gets an email`,
        opts.yes,
      );
      const proofs = [...(given as AdminSettlementFile[])];
      for (const f of files) proofs.push(await upload(s.organization.id, f));
      const body = unwrapS(
        await postSettlementsIdMarkPaid({
          path: { id },
          body: { confirm: true, proofs },
        }),
      );
      print(body.data, { json: opts.json });
    });

  root
    .command("delete <id>")
    .description(
      "Delete a settlement (irreversible; membership ones only in DRAFT/GENERATED)",
    )
    .option("--yes", "skip confirmation")
    .option("--json", "raw JSON output")
    .action(async (id, opts) => {
      configureAdminClient();
      await showSettlement(id);
      await confirmOrExit(
        `Delete settlement ${id}? This cannot be undone`,
        opts.yes,
      );
      const body = unwrapS(
        await deleteSettlementsId({ path: { id }, body: { confirm: true } }),
      );
      print(body.data, { json: opts.json });
    });
}
