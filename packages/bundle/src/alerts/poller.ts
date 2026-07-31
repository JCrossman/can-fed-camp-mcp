/**
 * In-process alert poller. On a polite interval (floored at 5 minutes), re-runs each
 * active watch's search; when a site opens, notifies the citizen's notify link (if any)
 * and retires the watch so it doesn't re-notify. Runs only while the bundle process is
 * alive — i.e. while the citizen's assistant is connected (local stdio). It never books.
 *
 */
import {
  allowedNotifyHosts,
  sendMessage,
  type ParksCanadaProvider,
} from "@open-state/core";
import type { BundleConfig } from "../config.js";
import type { AlertStore } from "./store.js";

/** Start polling; returns a stop function. */
export function startAlertPoller(
  provider: ParksCanadaProvider,
  config: BundleConfig,
  store: AlertStore,
): () => void {
  let stopped = false;
  const intervalMs = config.pollIntervalMinutes * 60_000;

  async function tick(): Promise<void> {
    if (stopped) return;
    try {
      await pollAlertsOnce(provider, config, store);
    } catch (err) {
      console.error("Could not load campsite alerts:", err);
    }
  }

  const handle = setInterval(() => void tick(), intervalMs);
  // Don't keep the process alive just for polling.
  (handle as { unref?: () => void }).unref?.();
  return () => {
    stopped = true;
    clearInterval(handle);
  };
}

/** One poll pass, exported for deterministic offline tests. */
export async function pollAlertsOnce(
  provider: ParksCanadaProvider,
  config: BundleConfig,
  store: AlertStore,
  notify: typeof sendMessage = sendMessage,
): Promise<void> {
  const alerts = store.listActive();
  const notifyHosts = allowedNotifyHosts({
    ntfyBase: config.ntfyBase,
    extraHosts: config.notifyAllowedHosts,
  });
  for (const alert of alerts) {
    try {
      const sites = await provider.searchSites({
        recreationAreaId: alert.recreationAreaId,
        campgroundId: alert.campgroundId,
        startDate: alert.startDate,
        endDate: alert.endDate,
        partySize: alert.partySize,
        equipmentType: alert.equipmentType ?? null,
        accessibleOnly: alert.accessibleOnly,
        nights: alert.nights ?? null,
        weekendsOnly: alert.weekendsOnly,
      });
      if (sites.length > 0) {
        const message =
          `A site opened at campground ${alert.campgroundId} for ${alert.startDate} ` +
          `to ${alert.endDate} (party of ${alert.partySize}) — ${sites.length} ` +
          "option(s). Open your assistant to prepare the booking; you confirm and pay yourself.";
        if (alert.notifyTarget) {
          try {
            const delivered = await notify(alert.notifyTarget, message, {
              title: "Open State: a campsite opened",
              allowedHosts: notifyHosts,
            });
            if (!delivered) throw new Error("notification service rejected the message");
          } catch (err) {
            store.markDeliveryFailed(
              alert.id,
              err instanceof Error ? err.message : String(err),
            );
            continue;
          }
        }
        store.markFired(alert.id, `${sites.length} site(s) open`);
      } else {
        store.markChecked(alert.id, "no openings");
      }
    } catch (err) {
      store.markCheckFailed(
        alert.id,
        err instanceof Error ? err.message : String(err),
      );
    }
  }
}
