import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@open-state/kit";

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
    await expect(cleared).resolves.toBe(false);
    expect(receivedSignal?.aborted).toBe(true);
  });
});
