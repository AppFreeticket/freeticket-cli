import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contract sweep, ported from freeticket-mcp's coverage.test.ts: every
 * operation of the spec either has a command, or is excluded here with its
 * reason. Without it, a new endpoint arrives through `sync-openapi` and stays
 * command-less forever, because nothing fails.
 *
 * The match is by operationId against the command sources: the generated SDK
 * exports one function per operationId, so if the name shows up outside the
 * imports, a command uses it. Operations the CLI reaches without the SDK (signed downloads stop
 * at the 302, see `signedDownload`) are in DIRECT with the path they build.
 */

interface Operation {
  id: string;
  /** `GET /events/{id}`, for readable failures. */
  where: string;
  path: string;
}

function operations(file: string): Operation[] {
  const spec = JSON.parse(readFileSync(file, "utf8")) as {
    paths: Record<string, Record<string, { operationId?: string }>>;
  };
  return Object.entries(spec.paths).flatMap(([path, ops]) =>
    Object.entries(ops)
      .filter(([, op]) => typeof op?.operationId === "string")
      .map(([method, op]) => ({
        id: op.operationId as string,
        where: `${method.toUpperCase()} ${path}`,
        path,
      })),
  );
}

/** Concatenated source of the files that hold commands (no tests). */
function commandSource(): string {
  const dir = join("src", "commands");
  return [
    ...readdirSync(dir)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .map((f) => join(dir, f)),
    join("src", "program.ts"),
  ]
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
}

/**
 * Paths kept out of the CLI as a whole. The buyer API (`/customer/*`) runs on
 * a buyer session minted by a device grant or an enterprise exchange; the CLI
 * authenticates staff with workspace API keys and has no buyer login.
 */
const EXCLUDED_PREFIXES: Record<string, string> = {
  "/customer/":
    "buyer API: needs a buyer session, the CLI only holds staff API keys",
};

/** Single operations kept out of the CLI, each with its reason. */
const EXCLUDED: Record<string, string> = {
  postApiCustomerAuthEnterpriseExchange:
    "mints buyer sessions from a one-time token: server-to-server between free-admin and the integrator",
  // Headless merch store of an enterprise landing (contract 1.36): the buyer
  // side. The catalog is a command (`ft merch catalog`).
  postMerchOrders:
    "places a buyer's order (ID document, phone, stock hold): landing page checkout",
  postMerchOrdersLookup:
    "a buyer looking up their own order by code + email: landing page flow",
  postMerchOrdersCodePaymentCard:
    "charges a Payment Brick card token: card data never passes through the CLI",
};

/**
 * Operations the CLI reaches with a hand-built path instead of the SDK
 * function, with a string that must appear in the source. `ft settlements
 * document` stops at the 302 so the file is not pulled into memory.
 */
const DIRECT: Record<string, { reason: string; needle: string }> = {
  getSettlementsIdDocument: {
    reason: "signedDownload: stops at the 302 and prints the signed URL",
    needle: `\`/settlements/\${id}/document\``,
  },
  getSettlementsIdProofsFileName: {
    reason: "signedDownload: stops at the 302 and prints the signed URL",
    needle: `\`/settlements/\${id}/proofs/\${encodeURIComponent(opts.proof)}\``,
  },
};

const excludedWhy = (o: Operation): string | undefined =>
  EXCLUDED[o.id] ??
  Object.entries(EXCLUDED_PREFIXES).find(([p]) => o.path.startsWith(p))?.[1];

/**
 * One row per contract. `admin-openapi.json` (superadmin, `ft admin`) joins
 * with its own row, minimum and exclusions in the admin PR; its commands live
 * in the same sources, so `commandSource` does not change.
 */
const SPECS: [label: string, file: string, minOps: number][] = [
  ["B2B /api/v1", "openapi.json", 200],
];

/**
 * The source without its import statements: an import alone is not a command,
 * and the SDK import list outlives the call it was for (removing the call
 * leaves the import, which biome flags but this test would not).
 */
const withoutImports = (text: string) =>
  text.replace(/^import\b[\s\S]*?from\s+"[^"]+";$/gm, "");

describe.each(SPECS)("contract %s", (_label, file, minOps) => {
  const ops = operations(file);
  const source = commandSource();
  const body = withoutImports(source);

  it("did not shrink abruptly (a truncated spec would pass every other check)", () => {
    expect(ops.length).toBeGreaterThanOrEqual(minOps);
  });

  it("has a command for every operation, or excludes it with a reason", () => {
    const uncovered = ops
      .filter((o) => !excludedWhy(o) && !DIRECT[o.id])
      .filter((o) => !new RegExp(`\\b${o.id}\\b`).test(body))
      .map((o) => `${o.where} [${o.id}]`);
    expect(uncovered).toEqual([]);
  });

  it("reaches every DIRECT operation through the path it names", () => {
    const missing = ops
      .filter((o) => DIRECT[o.id])
      .filter((o) => !source.includes(DIRECT[o.id]?.needle as string))
      .map((o) => `${o.where} [${o.id}]`);
    expect(missing).toEqual([]);
  });

  it("calls no excluded operation", () => {
    // The coverage rule accepts a bare mention (a comment counts); this looks
    // for a call, or an aliased import that would hide the call.
    const leaked = ops
      .filter((o) => excludedWhy(o))
      .filter((o) => new RegExp(`\\b${o.id}(\\s*\\(|\\s+as\\b)`).test(source))
      .map((o) => `${o.where} [${o.id}] — ${excludedWhy(o)}`);
    expect(leaked).toEqual([]);
  });
});

it("carries no exclusions for operations or paths the contracts no longer have", () => {
  // An orphaned exclusion is a rule nobody has looked at again.
  const all = SPECS.flatMap(([, file]) => operations(file));
  const ids = new Set(all.map((o) => o.id));
  expect(
    [...Object.keys(EXCLUDED), ...Object.keys(DIRECT)].filter(
      (id) => !ids.has(id),
    ),
  ).toEqual([]);
  expect(
    Object.keys(EXCLUDED_PREFIXES).filter(
      (p) => !all.some((o) => o.path.startsWith(p)),
    ),
  ).toEqual([]);
});

it("does not both exclude an operation and reach it directly", () => {
  expect(Object.keys(DIRECT).filter((id) => EXCLUDED[id])).toEqual([]);
});
