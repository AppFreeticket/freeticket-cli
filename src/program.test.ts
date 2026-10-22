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

test("contract 1.19 / admin 1.5 commands are wired, destructive ones behind --yes", () => {
  const tree = new Map(walk(program));
  const expected = [
    "events cancel",
    "sales attempts",
    "tickets reassign",
    "staff get",
    "staff delete",
    "webhooks update",
    "settlements get",
    "content-posts create",
    "workspace create",
    "signup",
    "admin workspaces delete",
    "admin workspaces plan-show",
  ];
  expect(expected.filter((p) => !tree.has(p))).toEqual([]);
  const longs = (p: string) => tree.get(p)?.options.map((o) => o.long) ?? [];
  for (const p of ["events cancel", "staff delete", "admin workspaces delete"])
    expect(longs(p)).toContain("--yes");
  // `plan <id>` (assign) must survive next to the new read.
  expect(longs("admin workspaces plan")).toContain("--data");
});

test("admin 1.7 CRM commands are wired under `ft admin crm`", () => {
  const tree = new Map(walk(program));
  const expected = [
    "admin crm campaigns list",
    "admin crm campaigns get",
    "admin crm campaigns cancel",
    "admin crm batches next",
    "admin crm batches stop",
    "admin crm events search",
    "admin crm events dates",
    "admin crm options",
    "admin crm quota",
    "admin crm preview",
    "admin crm launch",
  ];
  expect(expected.filter((p) => !tree.has(p))).toEqual([]);
});
