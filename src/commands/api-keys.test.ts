import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { registerApiKeys } from "./api-keys";

/** Structural test: the SDK calls are exercised by integration/manual use;
 * here we assert the command tree is wired as documented. */
describe("registerApiKeys", () => {
  function build(): Command {
    const program = new Command();
    registerApiKeys(program);
    return program.commands.find((c) => c.name() === "api-keys") as Command;
  }

  it("registers create, list and revoke subcommands", () => {
    const names = build()
      .commands.map((c) => c.name())
      .sort();
    expect(names).toEqual(["create", "list", "revoke"]);
  });

  it("create defaults --scope to read and accepts --expires", () => {
    const create = build().commands.find((c) => c.name() === "create");
    const opts = create?.opts() ?? {};
    expect(opts.scope).toBe("read");
    const flags = create?.options.map((o) => o.long);
    expect(flags).toContain("--expires");
    expect(flags).toContain("--json");
  });

  it("revoke supports --yes to skip confirmation", () => {
    const revoke = build().commands.find((c) => c.name() === "revoke");
    const flags = revoke?.options.map((o) => o.long);
    expect(flags).toContain("--yes");
  });

  it("list supports pagination and output flags", () => {
    const list = build().commands.find((c) => c.name() === "list");
    const flags = list?.options.map((o) => o.long);
    expect(flags).toEqual(
      expect.arrayContaining(["--all", "--cursor", "--csv", "--columns"]),
    );
  });
});
