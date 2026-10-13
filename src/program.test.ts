import type { Command } from "commander";
import { expect, test } from "vitest";
import { program } from "./program";

/** Every command in the tree, with its path (`events list`, ...). */
function walk(cmd: Command, path: string[] = []): [string, Command][] {
  return cmd.commands.flatMap((sub) => {
    const p = [...path, sub.name()];
    return [[p.join(" "), sub] as [string, Command], ...walk(sub, p)];
  });
}

test("every command that takes --workspace also takes --account (admin aside)", () => {
  const missing = walk(program)
    .filter(([path]) => !path.startsWith("admin"))
    .filter(([, cmd]) => {
      const longs = cmd.options.map((o) => o.long);
      return longs.includes("--workspace") && !longs.includes("--account");
    })
    .map(([path]) => path);
  expect(missing).toEqual([]);
  // Guard against the walk finding nothing at all.
  expect(walk(program).length).toBeGreaterThan(20);
});
