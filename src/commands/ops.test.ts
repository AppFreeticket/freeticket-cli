import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  postEventsIdSchedule: vi.fn(),
  patchPresaleWindowsId: vi.fn(),
  postTicketTypesIdPresaleWindows: vi.fn(),
  postSalesIdItemsItemIdTransfer: vi.fn(),
  getEventDatesIdCourtesySeats: vi.fn(),
}));

vi.mock("../client/sdk.gen", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../client/sdk.gen")>()),
  ...sdk,
}));

vi.mock("../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/api")>()),
  configureClient: vi.fn(),
}));

const ops = await import("./ops");

const ok = (data: unknown) => ({ data: { data }, response: new Response() });

function run(...args: string[]) {
  const program = new Command().exitOverride();
  ops.registerEventSchedule(program.command("events"));
  ops.registerPresaleWindows(program);
  ops.registerSaleOps(program.command("sales"));
  ops.registerCourtesySeats(program.command("event-dates"));
  return program.parseAsync(["node", "ft", ...args]);
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process, "exit").mockImplementation((() => {
    throw new Error("exited");
  }) as never);
  for (const fn of Object.values(sdk)) fn.mockResolvedValue(ok({}));
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const fn of Object.values(sdk)) fn.mockReset();
});

describe("ft events schedule set", () => {
  it("sends only publishAt", async () => {
    await run(
      "events",
      "schedule",
      "set",
      "evt_1",
      "--publish-at",
      "2027-01-01T00:00:00Z",
    );
    expect(sdk.postEventsIdSchedule).toHaveBeenCalledWith({
      path: { id: "evt_1" },
      body: { publishAt: "2027-01-01T00:00:00Z" },
    });
  });

  it.each([
    [[]],
    [
      [
        "--publish-at",
        "2027-01-01T00:00:00Z",
        "--sale-starts-at",
        "2027-01-02T00:00:00Z",
      ],
    ],
  ])("rejects %j: exactly one flag is required", async (flags) => {
    await expect(
      run("events", "schedule", "set", "evt_1", ...flags),
    ).rejects.toThrow("exited");
    expect(sdk.postEventsIdSchedule).not.toHaveBeenCalled();
  });
});

describe("ft presale-windows", () => {
  it("create maps flags to the contract body", async () => {
    await run(
      "presales",
      "create",
      "tt_1",
      "--plan",
      "plan_1",
      "--starts-at",
      "2027-01-01T00:00:00Z",
      "--ends-at",
      "2027-01-02T00:00:00Z",
      "--capacity",
      "50",
    );
    expect(sdk.postTicketTypesIdPresaleWindows).toHaveBeenCalledWith({
      path: { id: "tt_1" },
      body: {
        planId: "plan_1",
        presaleStartsAt: "2027-01-01T00:00:00Z",
        presaleEndsAt: "2027-01-02T00:00:00Z",
        presaleCapacity: 50,
      },
    });
  });

  it("update sends only the flags passed; --capacity none clears the cap", async () => {
    await run(
      "presale-windows",
      "update",
      "pw_1",
      "--capacity",
      "none",
      "--active",
      "false",
    );
    expect(sdk.patchPresaleWindowsId).toHaveBeenCalledWith({
      path: { id: "pw_1" },
      body: { presaleCapacity: null, isActive: false },
    });
  });
});

it("ft sales transfer --yes sends the recipient email", async () => {
  await run(
    "sales",
    "transfer",
    "sale_1",
    "item_1",
    "--email",
    "a@b.co",
    "--yes",
  );
  expect(sdk.postSalesIdItemsItemIdTransfer).toHaveBeenCalledWith({
    path: { id: "sale_1", itemId: "item_1" },
    body: { email: "a@b.co" },
  });
});

it("ft event-dates courtesy-seats reads the date", async () => {
  sdk.getEventDatesIdCourtesySeats.mockResolvedValue(ok({ ticketTypes: [] }));
  await run("event-dates", "courtesy-seats", "date_1", "--json");
  expect(sdk.getEventDatesIdCourtesySeats).toHaveBeenCalledWith({
    path: { id: "date_1" },
  });
});
