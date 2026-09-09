import { readFileSync } from "node:fs";
import * as readline from "node:readline";
import { fail } from "./api";

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
