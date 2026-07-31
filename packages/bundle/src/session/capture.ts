/**
 * Camping's session capture: the kit's citizen-driven browser capture
 * (Constitution Arts. 1, 10; see @open-state/kit) configured for Parks Canada.
 * The citizen signs in themselves in their own Chrome (Google, GCKey, or
 * Facebook); this module supplies only the Parks-specific pieces — the login
 * URL, the cookie origin, and the userInfo-based "signed in" signal — plus
 * the checkout hand-off that opens the citizen's cart so they pay themselves.
 */
import { join } from "node:path";
import { dirname, resolve } from "node:path";
import { existsSync, rmSync } from "node:fs";
import {
  captureSession as kitCapture,
  launchCitizenBrowser,
  type CaptureOptions as KitCaptureOptions,
  type Session,
} from "@open-state/kit";
import { defaultVaultDir } from "./vault.js";

const ORIGIN = "https://reservation.pc.gc.ca";
const checkoutBrowsers = new Set<Awaited<ReturnType<typeof launchCitizenBrowser>>>();

export interface CaptureOptions {
  loginUrl?: string;
  /** Where the persistent browser profile lives (keeps you signed in next time). */
  profileDir?: string;
  /** How long to wait for the citizen to finish signing in. */
  timeoutMs?: number;
}

export interface CapturedSession {
  session: Session;
  generation: number;
}

let captureGeneration = 0;
let captureBlocked = false;
const activeCaptures = new Map<AbortController, Promise<void>>();

/**
 * Open Chrome, let the citizen sign in to Parks Canada, and return their
 * captured session. Throws a plain-language error if Chrome can't be opened
 * or the login times out.
 */
export async function captureSession(opts: CaptureOptions = {}): Promise<CapturedSession> {
  if (captureBlocked) {
    throw new Error(
      "I can't start a Parks Canada sign-in while authentication state is being disconnected.",
    );
  }
  const generation = captureGeneration;
  const controller = new AbortController();
  let finished!: () => void;
  const completion = new Promise<void>((resolve) => {
    finished = resolve;
  });
  activeCaptures.set(controller, completion);
  try {
    const session = await kitCapture({
      loginUrl: opts.loginUrl ?? `${ORIGIN}/login`,
      cookieOrigin: ORIGIN,
      provider: "parks_canada",
      serviceName: "Parks Canada",
      profileDir: opts.profileDir ?? join(defaultVaultDir(), "browser-profile"),
      timeoutMs: opts.timeoutMs ?? 5 * 60_000,
      isSignedIn: parksSignedIn,
      signal: controller.signal,
    });
    return { session, generation };
  } finally {
    activeCaptures.delete(controller);
    finished();
  }
}

/** Whether a completed capture still predates no disconnect operation. */
export function isCaptureGenerationCurrent(generation: number): boolean {
  return generation === captureGeneration && !captureBlocked;
}

/**
 * Poll the app's own `userInfo` endpoint until it reports an authenticated
 * citizen. Logged-out responses are 401/empty; once signed in it returns the
 * account, which is our signal that the session cookies are good to capture.
 */
async function parksSignedIn(
  page: Parameters<NonNullable<KitCaptureOptions["isSignedIn"]>>[0],
): Promise<boolean> {
  return page.evaluate(async () => {
    try {
      const r = await fetch("/api/account/userInfo", {
        headers: { Accept: "application/json" },
      });
      if (!r.ok) return false;
      const j = (await r.json().catch(() => null)) as Record<string, unknown> | null;
      if (!j || typeof j !== "object") return false;
      return Boolean(
        j["email"] ||
          j["userId"] ||
          j["id"] ||
          j["shopperUid"] ||
          j["firstName"] ||
          j["isAuthenticated"],
      );
    } catch {
      return false;
    }
  });
}

/**
 * Open the citizen's Chrome at their cart so they review the prepared booking and
 * pay themselves. We assemble everything up to payment via the API; entering a
 * card is the one step we never take for them (Constitution Art. 2).
 *
 * The booking is committed under the citizen's session, but the SPA decides which
 * cart to show from `localStorage` (`cartUid` / `cartTransactionUid`) — so we seed
 * those keys with the cart we built before loading /cart, otherwise the page shows
 * a fresh empty cart. Uses the same persistent profile as sign-in (same session).
 * The window is left open for them; we don't await its close.
 */
export async function openCheckout(
  opts: CaptureOptions & {
    cartUrl?: string;
    cartUid?: string;
    cartTransactionUid?: string;
  } = {},
): Promise<void> {
  const cartUrl = opts.cartUrl ?? `${ORIGIN}/cart`;
  const profileDir = opts.profileDir ?? join(defaultVaultDir(), "browser-profile");
  const browser = await launchCitizenBrowser({ profileDir });
  checkoutBrowsers.add(browser);
  browser.on("disconnected", () => checkoutBrowsers.delete(browser));
  const page = (await browser.pages())[0] ?? (await browser.newPage());
  if (opts.cartUid) {
    // Establish the origin so localStorage is the reservation site's, then point
    // the SPA at the cart we built (its keys are literally "cartUid"/"cartTransactionUid").
    await page.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded" });
    await page.evaluate(
      (cartUid: string, cartTransactionUid: string) => {
        try {
          localStorage.setItem("cartUid", cartUid);
          if (cartTransactionUid) localStorage.setItem("cartTransactionUid", cartTransactionUid);
        } catch {
          /* localStorage may be unavailable; the cart link still works */
        }
      },
      opts.cartUid,
      opts.cartTransactionUid ?? "",
    );
  }
  await page.goto(cartUrl, { waitUntil: "domcontentloaded" });
  // Intentionally leave the browser open so the citizen can complete payment.
}

/** Whether the dedicated application-managed Chrome profile exists. */
export function browserProfileExists(): boolean {
  return existsSync(join(defaultVaultDir(), "browser-profile"));
}

/**
 * Close checkout windows managed by this process and remove the dedicated
 * Chrome profile so disconnect revokes reusable browser authentication too.
 */
export async function clearBrowserProfile(): Promise<boolean> {
  captureBlocked = true;
  captureGeneration++;
  try {
    const captures = [...activeCaptures.entries()];
    for (const [controller] of captures) controller.abort();
    await Promise.all(captures.map(([, completion]) => completion));

    for (const browser of [...checkoutBrowsers]) {
      await browser.close();
      checkoutBrowsers.delete(browser);
    }
    const home = resolve(defaultVaultDir());
    const profile = resolve(home, "browser-profile");
    if (dirname(profile) !== home) {
      throw new Error("Refusing to remove a browser profile outside OPEN_STATE_HOME.");
    }
    if (!existsSync(profile)) return captures.length > 0;
    rmSync(profile, { recursive: true, force: true });
    return true;
  } finally {
    captureBlocked = false;
  }
}
