import { readFileSync } from "node:fs";
import * as readline from "node:readline";
import { fail } from "./api";

/**
 * Validates `--limit`: an integer 1-100, as the contract allows. Without this
 * `--limit 500` or `--limit abc` went to the API as-is and came back as the
 * default page of 20, silently.
 */
export function parseLimit(input: string): number {
  const n = Number(input);
  // The regex too: Number() also takes "5.0", "1e1" and " 20".
  if (!/^\d+$/.test(input) || n < 1 || n > 100)
    fail(
      `Invalid --limit: ${input}. Use an integer from 1 to 100.`,
      "For more rows, add --all to walk every page.",
    );
  return n;
}

/**
 * Commander option parsers for typed flags. They run while commander parses
 * argv, so a bad value exits 1 before any confirmation prompt or request.
 *
 * `Number()` was not enough: `Number("50.000") === 50` turned a COP price
 * typed with a thousands separator into fifty pesos, and `Number("abc")` is
 * NaN, which `JSON.stringify` sends as `null` (a capacity cleared by a typo).
 * Booleans were `v === "true"`, so `--active yes` silently meant false.
 */
export function wholeNumber(flag: string): (input: string) => number {
  return (input) => {
    if (!/^\d+$/.test(input))
      fail(
        `Invalid ${flag}: ${input}. Use a whole number with no separators or decimals (e.g. 50000).`,
      );
    return Number(input);
  };
}

/**
 * `wholeNumber`, or `"none"` to clear a nullable field. Returns `"none"`, not
 * null: commander turns a parser's null into "" (map it with `noneToNull`).
 */
export function wholeNumberOrNone(
  flag: string,
): (input: string) => number | "none" {
  return (input) => {
    if (input === "none") return "none";
    if (!/^\d+$/.test(input))
      fail(
        `Invalid ${flag}: ${input}. Use a whole number with no separators or decimals (e.g. 50000), or "none".`,
      );
    return Number(input);
  };
}

/** The body value of a `wholeNumberOrNone` flag. */
export const noneToNull = <T>(v: T | "none"): T | null =>
  v === "none" ? null : v;

/** `"true"` / `"false"` only; anything else (yes, 1, si) exits 1. */
export function booleanFlag(flag: string): (input: string) => boolean {
  return (input) => {
    if (input !== "true" && input !== "false")
      fail(`Invalid ${flag}: ${input}. Use true or false.`);
    return input === "true";
  };
}

/**
 * Parses a `--data` value into a JSON body. Accepts inline JSON (`'{"x":1}'`)
 * or `@path/to/file.json` to read from disk. Aborts on missing/invalid input.
 */
export function parseData(input?: string): unknown {
  if (!input) {
    fail(
      "Missing --data. Pass inline JSON or @path/to/file.json.",
      'Example: --data \'{"name":"My event"}\' or --data @event.json',
    );
  }
  let raw = input as string;
  if (raw.startsWith("@")) {
    try {
      raw = readFileSync(raw.slice(1), "utf8");
    } catch {
      fail(`Cannot read file: ${raw.slice(1)}`);
    }
  }
  try {
    return JSON.parse(raw);
  } catch {
    return fail("Invalid JSON in --data.");
  }
}

/**
 * Confirmation gate for destructive commands. Aborting exits non-zero so a
 * script chaining `ft … delete && next-step` never mistakes a refusal for a
 * success (issue #24). Without a TTY it fails immediately pointing at --yes,
 * instead of hanging or silently doing nothing.
 */
export async function confirmOrExit(
  question: string,
  yes: boolean | undefined,
): Promise<void> {
  if (yes) return;
  if (!process.stdin.isTTY) {
    fail(
      `Refusing: ${question} — no TTY to confirm.`,
      "Pass --yes in scripts / CI.",
    );
  }
  if (!(await confirm(question))) fail("Aborted.");
}

/**
 * Y/N confirmation prompt on stderr (keeps stdout clean for `--json`/pipes).
 * Returns true only on an explicit yes. Non-interactive stdin → false.
 */
export function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return Promise.resolve(false);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  return new Promise((resolve) => {
    rl.question(`${question} [y/N] `, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}
