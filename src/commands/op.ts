// biome-ignore-all lint/suspicious/noExplicitAny: generated SDK boundary — signatures vary by operation.
import type { Command } from "commander";
import { configureClient, unwrap } from "../lib/api";
import { confirmOrExit, parseData } from "../lib/input";
import { print } from "../lib/output";

type SdkResult = Promise<{ data?: any; error?: unknown; response: Response }>;
type Opts = Record<string, any>;
/** Positional args in signature order (typed non-empty so `[id]` is a string). */
type Args = [string, string, ...string[]];

/**
 * One command bound to one contract operation, for the shapes registerResource
 * cannot model: nested ids (`<eventId> <viewerId>`), flag-built bodies, plain
 * (unpaginated) lists, singleton resources. Every command gets `--workspace`
 * and `--json`; `--account` is added globally by program.ts.
 */
export interface OpSpec {
  /** Commander signature, e.g. `"remove <eventId> <viewerId>"`. */
  name: string;
  describe: string;
  /**
   * Optional flags: [flags, description, default or parser?]. A parser (e.g.
   * `wholeNumber("--price")` from lib/input) runs while commander parses argv,
   * so a bad value exits 1 before the confirmation and the request.
   */
  options?: [string, string, (string | ((input: string) => unknown))?][];
  /** Required flags: [flags, description]. */
  required?: [string, string][];
  /** `--data <json>` body (inline or @file): "required" or "optional". */
  data?: "required" | "optional";
  /**
   * Destructive, sends email or otherwise hard to take back: ask first, with
   * `--yes` to skip; without a TTY and without `--yes` it refuses (exit 1)
   * before any request.
   */
  confirm?: (args: Args, opts: Opts) => string;
  /** Validate flags before anything else (call `fail` to abort). */
  check?: (args: Args, opts: Opts) => void;
  /** The SDK call. `data` is the parsed `--data` body, when passed. */
  call: (args: Args, opts: Opts, data: unknown) => SdkResult;
  /** Table columns for array output (or a function of the flags). */
  columns?: string[] | ((opts: Opts) => string[] | undefined);
  /** What to print from the unwrapped body (default: `body.data ?? body`). */
  pick?: (body: any, opts: Opts) => unknown;
}

export function op(parent: Command, spec: OpSpec): Command {
  const cmd = parent.command(spec.name).description(spec.describe);
  for (const [flags, describe] of spec.required ?? [])
    cmd.requiredOption(flags, describe);
  for (const [flags, describe, defOrParse] of spec.options ?? [])
    cmd.option(flags, describe, defOrParse as never);
  if (spec.data === "required")
    cmd.requiredOption("--data <json>", "JSON body (inline or @file.json)");
  else if (spec.data === "optional")
    cmd.option("--data <json>", "JSON body (inline or @file.json)");
  if (spec.confirm) cmd.option("--yes", "skip confirmation");
  cmd
    .option("--workspace <id>", "workspace override")
    .option("--json", "raw JSON output");

  cmd.action(async (...received: unknown[]) => {
    // commander passes the positional args, then opts, then the command.
    const opts = received[received.length - 2] as Opts;
    const args = received.slice(0, -2) as Args;
    spec.check?.(args, opts);
    // Parse before asking: a typo in --data should not cost a confirmation.
    const data = opts.data !== undefined ? parseData(opts.data) : undefined;
    if (spec.confirm) await confirmOrExit(spec.confirm(args, opts), opts.yes);
    configureClient(opts.workspace);
    const body = unwrap(await spec.call(args, opts, data));
    const out = spec.pick ? spec.pick(body, opts) : (body?.data ?? body);
    const columns =
      typeof spec.columns === "function" ? spec.columns(opts) : spec.columns;
    print(out ?? { ok: true }, { json: opts.json, columns });
  });
  return cmd;
}

/** `"none"` clears a nullable field; anything else is sent as is. */
export const orNull = (v: string) => (v === "none" ? null : v);

/** Comma-separated flag to a trimmed list, `undefined` when not passed. */
export const list = (v: string | undefined) =>
  v === undefined
    ? undefined
    : v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
