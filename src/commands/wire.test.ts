import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { client } from "../client/client.gen";

/**
 * Wire-level checks for the riskiest commands: the real generated SDK runs
 * and only `fetch` is faked, so each test sees the HTTP method, the final URL
 * (with every id in the slot the contract gives it) and the JSON body that
 * would leave the machine. Two distinct ids per call catch a swapped pair.
 */
vi.mock("../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/api")>()),
  configureClient: vi.fn(() =>
    client.setConfig({ baseUrl: "https://ft.test/api/v1", fetch: fetchMock }),
  ),
}));

const fetchMock = vi.hoisted(() => vi.fn());
const { program } = await import("../program");

interface Sent {
  method: string;
  path: string;
  body: unknown;
}

async function send(...args: string[]): Promise<Sent> {
  await program.parseAsync(["node", "ft", ...args, "--json"]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const req = fetchMock.mock.calls[0]?.[0] as Request;
  const url = new URL(req.url);
  const text = await req.text();
  return {
    method: req.method,
    path: `${url.pathname.replace("/api/v1", "")}${url.search}`,
    body: text ? JSON.parse(text) : undefined,
  };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process, "exit").mockImplementation((() => {
    throw new Error("exited");
  }) as never);
  fetchMock.mockImplementation(
    async () =>
      new Response(JSON.stringify({ data: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  fetchMock.mockReset();
});

describe("tickets and sales", () => {
  it("sales transfer: sale id, then item id, email in the body", async () => {
    expect(
      await send(
        "sales",
        "transfer",
        "sale_A",
        "item_B",
        "--email",
        "to@b.co",
        "--yes",
      ),
    ).toEqual({
      method: "POST",
      path: "/sales/sale_A/items/item_B/transfer",
      body: { email: "to@b.co" },
    });
  });

  it("sales recipient set: name and email only", async () => {
    expect(
      await send(
        "sales",
        "recipient",
        "set",
        "sale_A",
        "--name",
        "Ana",
        "--email",
        "ana@b.co",
        "--yes",
      ),
    ).toEqual({
      method: "PATCH",
      path: "/sales/sale_A/recipient",
      body: { name: "Ana", email: "ana@b.co" },
    });
  });

  it("tickets checkin-undo: DELETE on the ticket code, no body", async () => {
    expect(await send("tickets", "checkin-undo", "TKT-9", "--yes")).toEqual({
      method: "DELETE",
      path: "/tickets/TKT-9/checkin",
      body: undefined,
    });
  });

  it("sales abandon: POST, no body", async () => {
    expect(await send("sales", "abandon", "sale_A", "--yes")).toEqual({
      method: "POST",
      path: "/sales/sale_A/abandon",
      body: undefined,
    });
  });
});

describe("staff access", () => {
  it("builds the full-replace body from flags", async () => {
    expect(
      await send(
        "staff",
        "access",
        "stf_A",
        "--type",
        "personalizado",
        "--sections",
        "eventos, validar",
        "--validator-events",
        "evt_1,evt_2",
        "--expires-at",
        "2027-01-31",
        "--yes",
      ),
    ).toEqual({
      method: "PUT",
      path: "/staff/stf_A/access",
      body: {
        accessType: "personalizado",
        sections: ["eventos", "validar"],
        validatorEventIds: ["evt_1", "evt_2"],
        expiresAt: "2027-01-31",
      },
    });
  });

  it("--expires-at none sends null (permanent)", async () => {
    const sent = await send(
      "staff",
      "access",
      "stf_A",
      "--type",
      "lectura",
      "--viewer-events",
      "evt_1",
      "--expires-at",
      "none",
      "--yes",
    );
    expect(sent.body).toEqual({
      accessType: "lectura",
      viewerEventIds: ["evt_1"],
      expiresAt: null,
    });
  });

  it("--data replaces the flags", async () => {
    const sent = await send(
      "staff",
      "access",
      "stf_A",
      "--data",
      '{"accessType":"validador","validatorEventIds":[]}',
      "--yes",
    );
    expect(sent.body).toEqual({
      accessType: "validador",
      validatorEventIds: [],
    });
  });

  it("rejects an unknown --type before any request", async () => {
    await expect(
      program.parseAsync([
        "node",
        "ft",
        "staff",
        "access",
        "stf_A",
        "--type",
        "owner",
        "--yes",
      ]),
    ).rejects.toThrow("exited");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resend-invite: POST, no body", async () => {
    expect(await send("staff", "resend-invite", "stf_A", "--yes")).toEqual({
      method: "POST",
      path: "/staff/stf_A/resend-invite",
      body: undefined,
    });
  });
});

describe("event viewers and validators", () => {
  it("viewers add: email in the body", async () => {
    expect(
      await send(
        "events",
        "viewers",
        "add",
        "evt_A",
        "--email",
        "v@b.co",
        "--yes",
      ),
    ).toEqual({
      method: "POST",
      path: "/events/evt_A/viewers",
      body: { email: "v@b.co" },
    });
  });

  it("viewers remove: event id, then viewer (access) id", async () => {
    expect(
      await send("events", "viewers", "remove", "evt_A", "vw_B", "--yes"),
    ).toEqual({
      method: "DELETE",
      path: "/events/evt_A/viewers/vw_B",
      body: undefined,
    });
  });

  it("viewers list: GET", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(await send("events", "viewers", "list", "evt_A")).toEqual({
      method: "GET",
      path: "/events/evt_A/viewers",
      body: undefined,
    });
  });

  it("validators add: name and email", async () => {
    expect(
      await send(
        "events",
        "validators",
        "add",
        "evt_A",
        "--name",
        "Door 1",
        "--email",
        "d@b.co",
        "--yes",
      ),
    ).toEqual({
      method: "POST",
      path: "/events/evt_A/validators",
      body: { name: "Door 1", email: "d@b.co" },
    });
  });
});

describe("door and box office", () => {
  it("access-close sign sends the required confirm flag", async () => {
    expect(
      await send("event-dates", "access-close", "sign", "date_A", "--yes"),
    ).toEqual({
      method: "POST",
      path: "/event-dates/date_A/access-close",
      body: { confirm: true },
    });
  });

  it("master-qrs deactivate", async () => {
    expect(await send("master-qrs", "deactivate", "mq_A")).toEqual({
      method: "PUT",
      path: "/master-qrs/mq_A/active",
      body: { active: false },
    });
  });

  it("ticket-templates instantiate: template id in the path, date in the body", async () => {
    expect(
      await send(
        "ticket-templates",
        "instantiate",
        "tpl_A",
        "--event-date",
        "date_B",
        "--price",
        "50000",
      ),
    ).toEqual({
      method: "POST",
      path: "/ticket-templates/tpl_A/instantiate",
      body: { eventDateId: "date_B", price: 50000 },
    });
  });

  it("sales intents: query filters", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { rows: [], funnel: {} } }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(
      await send("sales", "intents", "--event", "evt_A", "--only-abandoned"),
    ).toEqual({
      method: "GET",
      path: "/payment-intents?event=evt_A&onlyAbandoned=true",
      body: undefined,
    });
  });
});

describe("community", () => {
  it("meetups rsvp: meetup id, then rsvp id, decision in the body", async () => {
    expect(
      await send(
        "content-meetups",
        "rsvp",
        "mt_A",
        "rsvp_B",
        "--reject",
        "--yes",
      ),
    ).toEqual({
      method: "PATCH",
      path: "/content/meetups/mt_A/rsvps/rsvp_B",
      body: { decision: "REJECT" },
    });
  });

  it("members ban: customer id in the path, comment in the body", async () => {
    expect(
      await send(
        "content-members",
        "ban",
        "cus_A",
        "--comment",
        "cmt_B",
        "--yes",
      ),
    ).toEqual({
      method: "POST",
      path: "/content/members/cus_A/ban",
      body: { commentId: "cmt_B", hideAllComments: false },
    });
  });
});

/** Runs argv expecting exit 1; returns what went to stderr. */
async function refused(...args: string[]): Promise<string> {
  await expect(program.parseAsync(["node", "ft", ...args])).rejects.toThrow(
    "exited",
  );
  expect(process.exit).toHaveBeenCalledWith(1);
  return vi
    .mocked(console.error)
    .mock.calls.map((c) => String(c[0]))
    .join("\n");
}

/** Everything written to stdout (where print sends --json and tables). */
const stdout = () =>
  [
    ...vi.mocked(process.stdout.write).mock.calls.map((c) => String(c[0])),
    ...vi.mocked(console.log).mock.calls.map((c) => String(c[0])),
  ].join("\n");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("typed flags: a malformed number or boolean exits 1 before any request", () => {
  // Number("50.000") === 50 and NaN serializes as null: these used to reach
  // the API as fifty pesos, or as a capacity silently cleared.
  it.each([
    [
      ["ticket-templates", "instantiate", "tpl_A", "--event-date", "date_B"],
      ["--price", "50.000"],
    ],
    [
      ["ticket-templates", "instantiate", "tpl_A", "--event-date", "date_B"],
      ["--capacity", "abc"],
    ],
    [
      ["ticket-templates", "instantiate", "tpl_A", "--event-date", "date_B"],
      ["--price", "-5"],
    ],
    [
      ["presale-windows", "update", "pw_A"],
      ["--capacity", "1,000"],
    ],
    [
      ["presale-windows", "update", "pw_A"],
      ["--active", "yes"],
    ],
    [
      [
        "presale-windows",
        "create",
        "tt_A",
        "--plan",
        "plan_B",
        "--starts-at",
        "2027-01-01T00:00:00Z",
        "--ends-at",
        "2027-01-02T00:00:00Z",
      ],
      ["--capacity", "abc"],
    ],
    [
      ["content-meetups", "attendance", "mt_A", "rsvp_B"],
      ["--attended", "si"],
    ],
    [
      ["content-moderation", "queue"],
      ["--page", "1.5"],
    ],
    [
      ["discounts", "list", "--workspace", "ws_A"],
      ["--active", "yes"],
    ],
    [
      ["sales", "intents", "--event", "evt_A"],
      ["--limit", "1e1"],
    ],
    [
      ["artists", "search", "rock"],
      ["--limit", "abc"],
    ],
  ])("ft %j %j", async (args, [flag, value]) => {
    const err = await refused(...args, flag as string, value as string);
    expect(err).toContain(`Invalid ${flag}: ${value}`);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("presale --capacity none still clears the cap and --active false is false", async () => {
    const sent = await send(
      "presale-windows",
      "update",
      "pw_A",
      "--capacity",
      "none",
      "--active",
      "false",
    );
    expect(sent.body).toEqual({ presaleCapacity: null, isActive: false });
  });

  it("instantiate sends whole numbers as numbers", async () => {
    const sent = await send(
      "ticket-templates",
      "instantiate",
      "tpl_A",
      "--event-date",
      "date_B",
      "--price",
      "50000",
      "--capacity",
      "1000",
    );
    expect(sent.body).toEqual({
      eventDateId: "date_B",
      price: 50000,
      capacity: 1000,
    });
  });
});

describe("staff access: --data or flags, never both", () => {
  it("--data with --type exits 1 before any request", async () => {
    const err = await refused(
      "staff",
      "access",
      "stf_A",
      "--data",
      '{"accessType":"admin"}',
      "--type",
      "lectura",
      "--sections",
      "eventos",
      "--yes",
    );
    expect(err).toContain(
      "Pass either --data or the flags, not both (got --data and --type, --sections)",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("master-qrs: the secret code and url", () => {
  const qr = {
    id: "mq_A",
    label: "Taquilla",
    mode: "EVENT",
    eventId: "evt_B",
    ticketTypeId: null,
    active: true,
    scans: 3,
    lastScanAt: null,
    createdAt: "2026-11-01T00:00:00Z",
    code: "SECRETCODE42",
    url: "https://t.test/mq/SECRETCODE42",
  };

  it("list --json leaves code and url out", async () => {
    fetchMock.mockResolvedValueOnce(json({ data: [qr] }));
    await send("master-qrs", "list");
    expect(stdout()).toContain("mq_A");
    expect(stdout()).not.toContain("SECRETCODE42");
  });

  it("list as a table leaves them out too", async () => {
    fetchMock.mockResolvedValueOnce(json({ data: [qr] }));
    await program.parseAsync(["node", "ft", "master-qrs", "list"]);
    expect(stdout()).toContain("mq_A");
    expect(stdout()).not.toContain("SECRETCODE42");
  });

  it("list --full --json shows them", async () => {
    fetchMock.mockResolvedValueOnce(json({ data: [qr] }));
    await send("master-qrs", "list", "--full");
    expect(stdout()).toContain("SECRETCODE42");
    expect(stdout()).toContain("https://t.test/mq/SECRETCODE42");
  });

  it("update --json redacts the QR it answers with", async () => {
    fetchMock.mockResolvedValueOnce(json({ data: qr }));
    expect(
      await send("master-qrs", "update", "mq_A", "--data", '{"label":"B"}'),
    ).toEqual({
      method: "PATCH",
      path: "/master-qrs/mq_A",
      body: { label: "B" },
    });
    expect(stdout()).toContain("Taquilla");
    expect(stdout()).not.toContain("SECRETCODE42");
  });

  it("create prints the secret (needed to print the QR) and says so in --help", async () => {
    fetchMock.mockResolvedValueOnce(json({ data: qr }));
    await send("master-qrs", "create", "--data", '{"label":"Taquilla"}');
    expect(stdout()).toContain("SECRETCODE42");
    const create = program.commands
      .find((c) => c.name() === "master-qrs")
      ?.commands.find((c) => c.name() === "create");
    expect(create?.description()).toMatch(/SECRET code and url/);
  });
});

describe("two ids in the right slots", () => {
  it("events artists remove: event, then artist workspace", async () => {
    expect(
      await send("events", "artists", "remove", "evt_A", "org_B", "--yes"),
    ).toEqual({
      method: "DELETE",
      path: "/events/evt_A/artists/org_B",
      body: undefined,
    });
  });

  it("events invitations cancel: event, then invitation", async () => {
    expect(
      await send("events", "invitations", "cancel", "evt_A", "inv_B", "--yes"),
    ).toEqual({
      method: "DELETE",
      path: "/events/evt_A/artist-invitations/inv_B",
      body: undefined,
    });
  });

  it("events invitations resend: event, then invitation", async () => {
    expect(
      await send("events", "invitations", "resend", "evt_A", "inv_B", "--yes"),
    ).toEqual({
      method: "POST",
      path: "/events/evt_A/artist-invitations/inv_B/resend",
      body: undefined,
    });
  });

  it("content-meetups attendance: meetup in the path, rsvp id in the body", async () => {
    expect(
      await send("content-meetups", "attendance", "mt_A", "rsvp_B"),
    ).toEqual({
      method: "PUT",
      path: "/content/meetups/mt_A/attendance",
      body: { rsvpId: "rsvp_B", attended: true },
    });
  });

  it("content-meetups attendance --attended false unmarks", async () => {
    const sent = await send(
      "content-meetups",
      "attendance",
      "mt_A",
      "rsvp_B",
      "--attended",
      "false",
    );
    expect(sent.body).toEqual({ rsvpId: "rsvp_B", attended: false });
  });
});

describe("API errors exit 1 with the message on stderr", () => {
  const notFound = () =>
    json(
      { error: { code: "NOT_FOUND", message: "Event evt_A not found" } },
      404,
    );
  const serverError = () =>
    new Response("upstream exploded", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });

  it.each([
    ["op()", ["events", "viewers", "list", "evt_A"]],
    ["ops.ts", ["presale-windows", "list", "tt_A"]],
  ])("404 through %s", async (_via, args) => {
    fetchMock.mockResolvedValueOnce(notFound());
    const err = await refused(...args);
    expect(err).toContain("Error 404 [NOT_FOUND]: Event evt_A not found");
    expect(err).toContain("does not exist or belongs to another workspace");
  });

  it.each([
    ["op()", ["events", "viewers", "list", "evt_A"]],
    ["ops.ts", ["presale-windows", "list", "tt_A"]],
  ])("500 without a JSON body through %s", async (_via, args) => {
    fetchMock.mockResolvedValueOnce(serverError());
    const err = await refused(...args);
    expect(err).toContain("The API responded with 500 without a readable body");
  });
});
