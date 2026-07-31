/**
 * Local JSON store for cancellation-watch alerts. Stores no citizen identity — each
 * alert is keyed by an opaque generated id, not a person (Constitution Art. 5). The
 * only contact detail kept is an optional `notifyTarget` (a notification link the
 * citizen controls, e.g. an ntfy.sh topic). No account, password, or government
 * credential is ever stored (Art. 1). Lives next to the session vault on the citizen's
 * own device; the file is 0600 on POSIX and governed by user ACLs on Windows.
 *
 * A JSON file is enough for the
 * local bundle's small list of watches.
 */
import { randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { defaultVaultDir } from "../session/vault.js";

const MAX_STORE_BYTES = 1024 * 1024;

export interface Alert {
  id: string;
  provider: string;
  recreationAreaId: string;
  campgroundId: string;
  startDate: string;
  endDate: string;
  partySize: number;
  equipmentType?: string | null;
  accessibleOnly: boolean;
  nights?: number | null;
  weekendsOnly: boolean;
  notifyTarget?: string | null;
  status: "active" | "fired";
  createdAt: string;
  lastChecked?: string | null;
  lastResult?: string | null;
  deliveryAttempts?: number;
  lastError?: string | null;
}

const alertSchema = z.object({
  id: z.string(),
  provider: z.string(),
  recreationAreaId: z.string(),
  campgroundId: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  partySize: z.number().int().positive(),
  equipmentType: z.string().nullable().optional(),
  accessibleOnly: z.boolean(),
  nights: z.number().int().positive().nullable().optional(),
  weekendsOnly: z.boolean(),
  notifyTarget: z.string().nullable().optional(),
  status: z.enum(["active", "fired"]),
  createdAt: z.string(),
  lastChecked: z.string().nullable().optional(),
  lastResult: z.string().nullable().optional(),
  deliveryAttempts: z.number().int().nonnegative().optional(),
  lastError: z.string().nullable().optional(),
});

export class AlertStoreError extends Error {
  override readonly name = "AlertStoreError";
}

function now(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

export class AlertStore {
  private readonly path: string;

  constructor(dir = defaultVaultDir()) {
    this.path = join(dir, "alerts.json");
  }

  private readAll(): Alert[] {
    if (!existsSync(this.path)) return [];
    try {
      const raw = readFileSync(this.path);
      if (raw.byteLength > MAX_STORE_BYTES) {
        throw new Error(`file exceeds ${MAX_STORE_BYTES} bytes`);
      }
      const parsed = alertSchema.array().safeParse(JSON.parse(raw.toString("utf8")));
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "invalid data");
      return parsed.data as Alert[];
    } catch (err) {
      throw new AlertStoreError(
        "I couldn't read the saved campsite alerts because alerts.json is " +
          `damaged or unreadable (${err instanceof Error ? err.message : String(err)}). ` +
          "I left it unchanged. Restore or remove that file before managing alerts.",
      );
    }
  }

  private writeAll(alerts: Alert[]): void {
    const dir = dirname(this.path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
    const temp = join(dir, `.alerts-${randomUUID()}.tmp`);
    try {
      writeFileSync(temp, JSON.stringify(alerts, null, 2), {
        mode: 0o600,
        flag: "wx",
      });
      renameSync(temp, this.path);
      chmodSync(this.path, 0o600);
    } finally {
      if (existsSync(temp)) rmSync(temp, { force: true });
    }
  }

  add(input: Omit<Alert, "id" | "status" | "createdAt" | "lastChecked" | "lastResult">): Alert {
    const alert: Alert = {
      ...input,
      id: randomUUID().replace(/-/g, "").slice(0, 12),
      status: "active",
      createdAt: now(),
      lastChecked: null,
      lastResult: null,
      deliveryAttempts: 0,
      lastError: null,
    };
    const all = this.readAll();
    all.push(alert);
    this.writeAll(all);
    return alert;
  }

  get(id: string): Alert | undefined {
    return this.readAll().find((a) => a.id === id);
  }

  listAll(): Alert[] {
    return this.readAll();
  }

  listActive(): Alert[] {
    return this.readAll().filter((a) => a.status === "active");
  }

  countActive(): number {
    return this.listActive().length;
  }

  delete(id: string): boolean {
    const all = this.readAll();
    const next = all.filter((a) => a.id !== id);
    if (next.length === all.length) return false;
    this.writeAll(next);
    return true;
  }

  private update(id: string, patch: Partial<Alert>): void {
    const all = this.readAll();
    const a = all.find((x) => x.id === id);
    if (!a) return;
    Object.assign(a, patch);
    this.writeAll(all);
  }

  markChecked(id: string, result: string): void {
    this.update(id, { lastChecked: now(), lastResult: result, lastError: null });
  }

  markCheckFailed(id: string, error: string): void {
    this.update(id, {
      lastChecked: now(),
      lastResult: "could not check",
      lastError: error,
    });
  }

  markDeliveryFailed(id: string, error: string): void {
    const alert = this.get(id);
    this.update(id, {
      lastChecked: now(),
      lastResult: "opening found; notification will retry",
      deliveryAttempts: (alert?.deliveryAttempts ?? 0) + 1,
      lastError: error,
    });
  }

  /** Record a hit and retire the watch so it does not re-notify. */
  markFired(id: string, result: string): void {
    this.update(id, {
      status: "fired",
      lastChecked: now(),
      lastResult: result,
      lastError: null,
    });
  }
}
