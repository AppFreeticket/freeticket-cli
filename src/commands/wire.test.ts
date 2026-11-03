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
