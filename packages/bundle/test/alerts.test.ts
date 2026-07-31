import { describe, expect, it, beforeEach } from "vitest";
import {
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { ParksCanadaProvider } from "@open-state/core";
import { AlertStore, AlertStoreError } from "../src/alerts/store.js";
import { pollAlertsOnce } from "../src/alerts/poller.js";
import { registerAlertTools } from "../src/alert-tools.js";
import type { BundleConfig } from "../src/config.js";

const CONFIG: BundleConfig = {
  timeoutMs: 30_000,
  recreationAreaId: "14",
  maxActiveAlerts: 2,
  pollIntervalMinutes: 10,
  ntfyBase: "https://ntfy.sh",
  notifyAllowedHosts: [],
};

function tempStore(): AlertStore {
  return new AlertStore(mkdtempSync(join(tmpdir(), "ose-alerts-")));
}

describe("AlertStore", () => {
  let store: AlertStore;
  beforeEach(() => {
    store = tempStore();
  });

  const base = {
    provider: "parks_canada",
    recreationAreaId: "14",
    campgroundId: "-123",
    startDate: "2099-07-17",
    endDate: "2099-07-19",
    partySize: 2,
    equipmentType: null,
    accessibleOnly: false,
    nights: null,
    weekendsOnly: false,
    notifyTarget: null,
  };

  it("adds, lists, counts, gets, and deletes — no identity stored", () => {
    const a = store.add(base);
    expect(a.id).toHaveLength(12);
    expect(a.status).toBe("active");
    expect(store.countActive()).toBe(1);
    expect(store.get(a.id)?.campgroundId).toBe("-123");
    // The persisted record carries only the search + notify link, no person.
    expect(Object.keys(a)).not.toContain("shopperUid");
    expect(store.delete(a.id)).toBe(true);
    expect(store.listAll()).toEqual([]);
    expect(store.delete("nope")).toBe(false);
  });

  it("markFired retires a watch so it stops being active", () => {
    const a = store.add(base);
    store.markFired(a.id, "1 site open");
    expect(store.countActive()).toBe(0);
    expect(store.get(a.id)?.status).toBe("fired");
    expect(store.get(a.id)?.lastResult).toBe("1 site open");
  });

  it("persists across store instances (same dir)", () => {
    const dir = mkdtempSync(join(tmpdir(), "ose-alerts-"));
    new AlertStore(dir).add(base);
    expect(new AlertStore(dir).countActive()).toBe(1);
  });

  it("writes atomically with owner-only permissions", () => {
    const dir = mkdtempSync(join(tmpdir(), "ose-alerts-"));
    new AlertStore(dir).add(base);
    const path = join(dir, "alerts.json");
    expect(JSON.parse(readFileSync(path, "utf8"))).toHaveLength(1);
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it("surfaces corruption without replacing the file", () => {
    const dir = mkdtempSync(join(tmpdir(), "ose-alerts-"));
    const path = join(dir, "alerts.json");
    writeFileSync(path, "{not valid json", { mode: 0o600 });
    const store = new AlertStore(dir);
    expect(() => store.listAll()).toThrow(AlertStoreError);
    expect(readFileSync(path, "utf8")).toBe("{not valid json");
  });

  it("keeps a watch active until notification delivery succeeds", async () => {
    const store = tempStore();
    const alert = store.add({ ...base, notifyTarget: "https://ntfy.sh/topic" });
    const provider = {
      searchSites: async () => [{}],
    } as unknown as ParksCanadaProvider;

    await pollAlertsOnce(provider, CONFIG, store, async () => false);
    expect(store.get(alert.id)?.status).toBe("active");
    expect(store.get(alert.id)?.deliveryAttempts).toBe(1);
    expect(store.get(alert.id)?.lastResult).toContain("will retry");

    await pollAlertsOnce(provider, CONFIG, store, async () => true);
    expect(store.get(alert.id)?.status).toBe("fired");
    expect(store.get(alert.id)?.lastError).toBeNull();
  });
});

describe("alert tools", () => {
  async function connect(
    store: AlertStore,
    decision: "accept" | "decline" = "accept",
  ): Promise<Client> {
    const server = new McpServer({ name: "t", version: "0" });
    registerAlertTools(server, new ParksCanadaProvider({}), CONFIG, store);
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    const client = new Client(
      { name: "t", version: "0" },
      { capabilities: { elicitation: { form: {} } } },
    );
    client.setRequestHandler(ElicitRequestSchema, async () =>
      decision === "accept"
        ? { action: "accept", content: { approved: true } }
        : { action: "decline" },
    );
    await client.connect(ct);
    return client;
  }
  const callText = async (c: Client, name: string, args: Record<string, unknown>) => {
    const r = (await c.callTool({ name, arguments: args })) as {
      content: { type: string; text: string }[];
    };
    return r.content.map((x) => x.text).join("\n");
  };
  it("create_alert (silent watch) → list → delete", async () => {
    const store = tempStore();
    const c = await connect(store);
    const args = {
      campground_id: "-2147483644",
      start_date: "2099-07-17",
      end_date: "2099-07-19",
      party_size: 2,
    };
    const created = await callText(c, "create_alert", args);
    expect(created).toMatch(/Saved watch \w+/);
    expect(created).toContain("list_alerts");
    const id = created.match(/Saved watch (\w+)/)![1]!;

    const listed = await callText(c, "list_alerts", {});
    expect(listed).toContain("1 saved alert");
    expect(listed).toContain(id);

    const deleted = await callText(c, "delete_alert", { alert_id: id });
    expect(deleted).toContain("Deleted alert");
    expect(await callText(c, "list_alerts", {})).toContain("no saved alerts");
  });

  it("caps the number of active watches", async () => {
    const store = tempStore();
    const c = await connect(store);
    const mk = () =>
      callText(c, "create_alert", {
        campground_id: "-1",
        start_date: "2099-07-17",
        end_date: "2099-07-19",
        party_size: 1,
      });

    await mk();
    await mk(); // cap is 2
    const third = await callText(c, "create_alert", {
      campground_id: "-1",
      start_date: "2099-07-17",
      end_date: "2099-07-19",
      party_size: 1,
    });
    expect(third).toMatch(/most campgrounds I can keep track of/);
  });

  it("persists nothing when the citizen declines the trusted preview", async () => {
    const store = tempStore();
    const c = await connect(store, "decline");
    const out = await callText(c, "create_alert", {
      campground_id: "-1",
      start_date: "2099-07-17",
      end_date: "2099-07-19",
      party_size: 1,
    });
    expect(out).toContain("declined");
    expect(store.countActive()).toBe(0);
  });

  it("rejects a notify_target on a non-allowed host (SSRF guard)", async () => {
    const store = tempStore();
    const c = await connect(store);
    const out = await callText(c, "create_alert", {
      campground_id: "-1",
      start_date: "2099-07-17",
      end_date: "2099-07-19",
      party_size: 1,
      notify_target: "http://169.254.169.254/latest/meta-data",
    });
    expect(store.countActive()).toBe(0); // not saved
    expect(out.toLowerCase()).toMatch(/notification|allowed|host|can't|cannot|only/);
  });
});
