import { afterEach, describe, expect, it, vi } from "vitest";
import { confirmOrExit } from "./input";

/** Issue #24: aborting a destructive command must not exit 0. */
describe("confirmOrExit", () => {
  const tty = process.stdin.isTTY;
  afterEach(() => {
    Object.defineProperty(process.stdin, "isTTY", {
      value: tty,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  function noTty(): void {
    Object.defineProperty(process.stdin, "isTTY", {
      value: false,
      configurable: true,
    });
  }

  it("exits non-zero when there is no TTY to confirm on", async () => {
    noTty();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exited");
    }) as never);
    await expect(confirmOrExit("Delete event x?", undefined)).rejects.toThrow(
      "exited",
    );
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("passes straight through with --yes, TTY or not", async () => {
    noTty();
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exited");
    }) as never);
    await expect(
      confirmOrExit("Delete event x?", true),
    ).resolves.toBeUndefined();
    expect(exit).not.toHaveBeenCalled();
  });
});
