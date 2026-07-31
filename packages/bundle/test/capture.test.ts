import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@open-state/kit";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { ParksCanadaProvider } from "@open-state/core";

const mocks = vi.hoisted(() => ({
  kitCapture: vi.fn(),
}));

vi.mock("@open-state/kit", async (importOriginal) => {
  const original = await importOriginal<typeof import("@open-state/kit")>();
  return { ...original, captureSession: mocks.kitCapture };
});

import {
  captureSession,
  clearBrowserProfile,
  isCaptureGenerationCurrent,
} from "../src/session/capture.js";
import { registerAccountTools } from "../src/account-tools.js";

const session: Session = {
  provider: "parks_canada",
  capturedAt: "2099-01-01T00:00:00Z",
  cookies: [{ name: "session", value: "synthetic" }],
};

describe("capture revocation", () => {
  beforeEach(() => {
    mocks.kitCapture.mockReset();
  });

  it("invalidates a capture completed before disconnect", async () => {
    mocks.kitCapture.mockResolvedValue(session);
    const captured = await captureSession();
    expect(isCaptureGenerationCurrent(captured.generation)).toBe(true);

    await clearBrowserProfile();
    expect(isCaptureGenerationCurrent(captured.generation)).toBe(false);
  });

  it("aborts and waits for an active sign-in before clearing authentication", async () => {
    let receivedSignal: AbortSignal | undefined;
    mocks.kitCapture.mockImplementation(
      (opts: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          receivedSignal = opts.signal;
          opts.signal?.addEventListener(
            "abort",
            () => reject(new Error("capture canceled")),
            { once: true },
          );
        }),
    );

    const capture = captureSession();
    await vi.waitFor(() => expect(receivedSignal).toBeDefined());
    const cleared = clearBrowserProfile();
    await expect(capture).rejects.toThrow("capture canceled");
    await expect(cleared).resolves.toBe(true);
    expect(receivedSignal?.aborted).toBe(true);
  });

  it("confirmed disconnect revokes an active capture before a profile exists", async () => {
    let receivedSignal: AbortSignal | undefined;
    mocks.kitCapture.mockImplementation(
      (opts: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          receivedSignal = opts.signal;
          opts.signal?.addEventListener(
            "abort",
            () => reject(new Error("capture canceled")),
            { once: true },
          );
        }),
    );
    const capture = captureSession();
    const canceled = capture.catch((err: unknown) => err);
    await vi.waitFor(() => expect(receivedSignal).toBeDefined());

    const server = new McpServer({ name: "t", version: "0" });
    registerAccountTools(server, {} as ParksCanadaProvider);
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client(
      { name: "t", version: "0" },
      { capabilities: { elicitation: { form: {} } } },
    );
    client.setRequestHandler(ElicitRequestSchema, async () => ({
      action: "accept",
      content: { approved: true },
    }));
    await client.connect(clientTransport);

    const result = (await client.callTool({
      name: "disconnect_account",
      arguments: {},
    })) as { content: Array<{ type: string; text: string }> };
    expect(result.content[0]?.text).toContain("Disconnected");
    expect(await canceled).toEqual(expect.objectContaining({ message: "capture canceled" }));
    expect(receivedSignal?.aborted).toBe(true);
    await client.close();
  });
});
