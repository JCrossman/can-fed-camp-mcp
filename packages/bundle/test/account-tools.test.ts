import { beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { ParksCanadaProvider } from "@open-state/core";
import { registerAccountTools } from "../src/account-tools.js";
import {
  defaultVaultDir,
  loadSession,
  saveSession,
  type Session,
} from "../src/session/vault.js";

const session: Session = {
  provider: "parks_canada",
  capturedAt: "2099-01-01T00:00:00Z",
  cookies: [
    {
      name: "session",
      value: "synthetic-session-value",
      domain: "reservation.pc.gc.ca",
    },
  ],
};

const profile = {
  firstName: "Test",
  lastName: "Citizen",
  email: "citizen@example.com",
  preferredCultureName: "en-CA",
  phoneNumbers: { primaryPhoneNumber: "+14165550142" },
  addresses: [{ streetAddress: "1 Example Way", city: "Old City", regionCode: "A1A 1A1" }],
};

async function connect(
  provider: ParksCanadaProvider,
  decision: "accept" | "decline" | "cancel" | "unsupported" = "accept",
): Promise<Client> {
  const server = new McpServer({ name: "t", version: "0" });
  registerAccountTools(server, provider);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client(
    { name: "t", version: "0" },
    {
      capabilities:
        decision === "unsupported" ? {} : { elicitation: { form: {} } },
    },
  );
  if (decision !== "unsupported") {
    client.setRequestHandler(ElicitRequestSchema, async () =>
      decision === "accept"
        ? { action: "accept", content: { approved: true } }
        : { action: decision },
    );
  }
  await client.connect(clientTransport);
  return client;
}

async function callText(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const result = (await client.callTool({ name, arguments: args })) as {
    content: Array<{ type: string; text: string }>;
  };
  return result.content.map((item) => item.text).join("\n");
}

describe("account mutation confirmation", () => {
  beforeEach(() => {
    process.env["OPEN_STATE_HOME"] = mkdtempSync(join(tmpdir(), "osc-account-"));
  });

  it("updates a profile only after trusted host acceptance", async () => {
    saveSession(session);
    const updateShopper = vi.fn(async () => ({}));
    const getShopper = vi.fn(async () => structuredClone(profile));
    const provider = {
      getShopper,
      updateShopper,
    } as unknown as ParksCanadaProvider;
    const client = await connect(provider);

    const confirmed = await callText(client, "update_account", { city: "New City" });
    expect(confirmed).toContain("Updated your Parks Canada account");
    expect(updateShopper).toHaveBeenCalledTimes(1);
    expect(updateShopper.mock.calls[0]![0]["addresses"][0]["city"]).toBe("New City");
  });

  it("performs no profile write when the citizen declines", async () => {
    saveSession(session);
    const getShopper = vi.fn(async () => structuredClone(profile));
    const updateShopper = vi.fn();
    const client = await connect(
      { getShopper, updateShopper } as unknown as ParksCanadaProvider,
      "decline",
    );
    const result = await callText(client, "update_account", { city: "New City" });
    expect(result).toContain("declined");
    expect(getShopper).toHaveBeenCalledOnce();
    expect(updateShopper).not.toHaveBeenCalled();
  });

  it("fails closed when the MCP host lacks trusted elicitation", async () => {
    saveSession(session);
    const updateShopper = vi.fn();
    const client = await connect(
      {
        getShopper: async () => structuredClone(profile),
        updateShopper,
      } as unknown as ParksCanadaProvider,
      "unsupported",
    );
    const result = await callText(client, "update_account", { city: "New City" });
    expect(result).toContain("does not support trusted confirmation");
    expect(updateShopper).not.toHaveBeenCalled();
  });

  it("removes both vault and dedicated Chrome state only after confirmation", async () => {
    saveSession(session);
    const profileDir = join(defaultVaultDir(), "browser-profile");
    mkdirSync(profileDir, { recursive: true });
    writeFileSync(join(profileDir, "Cookie"), "synthetic");
    const client = await connect({} as ParksCanadaProvider);

    const result = await callText(client, "disconnect_account", {});
    expect(result).toContain("authentication state");
    expect(loadSession()).toBeNull();
    expect(existsSync(profileDir)).toBe(false);
  });
});
