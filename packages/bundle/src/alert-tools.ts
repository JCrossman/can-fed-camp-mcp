/**
 * Cancellation-watch tools. Mutations use the shared bound confirmation gate:
 * previews persist and send nothing; only the exact confirmed preview changes
 * local state or contacts a notification service.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  confirmGated,
  type TwoPhaseOutcome,
} from "@open-state/kit";
import {
  ParksCanadaProvider,
  allowedNotifyHosts,
  generateChannel,
  sendMessage,
  validateNotifyTarget,
  InvalidInputError,
} from "@open-state/core";
import type { BundleConfig } from "./config.js";
import { AlertStore, AlertStoreError } from "./alerts/store.js";
import { confirmationContext, sessionExclusive } from "./session/vault.js";
import { citizenApproval } from "./approval.js";
import * as fmt from "./format.js";

type TextResult = { content: { type: "text"; text: string }[] };
const text = (s: string): TextResult => ({ content: [{ type: "text", text: s }] });

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-07-17 (YYYY-MM-DD).");

interface CreateAlertArgs {
  campground_id: string;
  start_date: string;
  end_date: string;
  party_size: number;
  recreation_area_id?: string;
  equipment_type?: string;
  accessible_only?: boolean;
  nights?: number;
  weekends_only?: boolean;
  notify_target?: string;
}

interface PreparedAlert {
  notifyTarget: string | null;
  channel: ReturnType<typeof generateChannel> | null;
}

interface DeleteAlertArgs {
  alert_id: string;
}

export function registerAlertTools(
  server: McpServer,
  provider: ParksCanadaProvider,
  config: BundleConfig,
  store: AlertStore,
): void {
  const notifyHosts = allowedNotifyHosts({
    ntfyBase: config.ntfyBase,
    extraHosts: config.notifyAllowedHosts,
  });
  const createAlert = confirmGated<CreateAlertArgs, PreparedAlert>(
    {
      prepare: async (args) => prepareAlert(args, config, store, notifyHosts),
      execute: (args, outcome) =>
        executeAlert(args, outcome, config, store, notifyHosts),
    },
    {
      context: confirmationContext,
      approve: citizenApproval(server),
      exclusive: sessionExclusive,
    },
  );
  const deleteAlert = confirmGated<DeleteAlertArgs, { alertId: string }>(
    {
      async prepare(args) {
        const alert = store.get(args.alert_id);
        if (!alert) {
          return { problem: `I couldn't find an alert with id ${args.alert_id}.` };
        }
        return {
          summary:
            `I'll delete alert ${alert.id}: campground ${alert.campgroundId}, ` +
            `${alert.startDate} to ${alert.endDate}, party of ${alert.partySize}.`,
          onConfirm: "confirm and I'll permanently delete this saved watch",
          prepared: { alertId: alert.id },
        };
      },
      async execute(_args, outcome) {
        const id = outcome.prepared!.alertId;
        return store.delete(id)
          ? `Deleted alert ${id}.`
          : `Alert ${id} changed or was already removed, so I did not delete anything.`;
      },
    },
    {
      context: confirmationContext,
      approve: citizenApproval(server),
      exclusive: sessionExclusive,
    },
  );

  server.registerTool(
    "create_alert",
    {
      title: "Set a cancellation alert",
      description:
        "Preview a local cancellation watch and ask the citizen to approve the exact " +
        "dates, party, accessibility filter, and notification destination through " +
        "the MCP host. Acceptance saves the watch " +
        "and, for notify_target='auto', sends a test message. It checks only while " +
        "the assistant is connected and never books.",
      inputSchema: {
        campground_id: z.string(),
        start_date: isoDate,
        end_date: isoDate,
        party_size: z.number().int().positive(),
        recreation_area_id: z.string().optional(),
        equipment_type: z.string().optional(),
        accessible_only: z.boolean().optional(),
        nights: z.number().int().positive().optional(),
        weekends_only: z.boolean().optional(),
        notify_target: z.string().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (args) =>
      runVisible(() => createAlert(args as CreateAlertArgs)),
  );

  server.registerTool(
    "list_alerts",
    { title: "List your cancellation alerts", annotations: { readOnlyHint: true } },
    async () =>
      runVisible(async () => {
        const alerts = store.listAll();
        if (alerts.length === 0) return text("You have no saved alerts.");
        const lines = [`You have ${alerts.length} saved alert(s):`, ""];
        for (const alert of alerts) {
          const status =
            alert.status === "fired"
              ? "a site opened and notification was delivered"
              : "watching";
          let detail =
            `- ${alert.id}: campground ${alert.campgroundId}, ${alert.startDate} ` +
            `to ${alert.endDate}, party of ${alert.partySize}`;
          if (alert.accessibleOnly) detail += ", accessible only";
          detail += ` — ${status}.`;
          if (alert.lastResult) detail += ` Last check: ${alert.lastResult}.`;
          if (alert.lastError) detail += ` Last error: ${alert.lastError}.`;
          lines.push(detail);
        }
        return text(lines.join("\n"));
      }),
  );

  server.registerTool(
    "delete_alert",
    {
      title: "Delete a cancellation alert",
      description:
        "Preview deletion of a saved watch and ask the citizen to approve that " +
        "exact deletion through the MCP host.",
      inputSchema: {
        alert_id: z.string(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => runVisible(() => deleteAlert(args as DeleteAlertArgs)),
  );
}

async function prepareAlert(
  args: CreateAlertArgs,
  config: BundleConfig,
  store: AlertStore,
  notifyHosts: ReadonlySet<string>,
): Promise<TwoPhaseOutcome<PreparedAlert> | { problem: string }> {
  const dateIssue = fmt.stayDatesProblem(args.start_date, args.end_date);
  if (dateIssue) return { problem: dateIssue };
  if (store.countActive() >= config.maxActiveAlerts) {
    return {
      problem:
        "I'm already watching the most campgrounds I can keep track of. Delete " +
        "a watch you no longer need and try again.",
    };
  }

  let notifyTarget = args.notify_target ?? null;
  let channel: ReturnType<typeof generateChannel> | null = null;
  if (notifyTarget === "auto") {
    channel = generateChannel(config.ntfyBase);
    notifyTarget = channel.subscribeUrl;
  } else if (notifyTarget) {
    try {
      validateNotifyTarget(notifyTarget, notifyHosts);
    } catch (err) {
      if (err instanceof InvalidInputError) return { problem: err.message };
      throw err;
    }
  }

  const destination = channel
    ? `a new private notification channel at ${channel.subscribeUrl}`
    : notifyTarget
      ? `the notification link ${notifyTarget}`
      : "no external notification link; status is available through list_alerts";
  return {
    summary:
      "Here's the cancellation watch I'll save:\n" +
      `- Campground id: ${args.campground_id}\n` +
      `- Dates: ${args.start_date} to ${args.end_date}\n` +
      `- Party: ${args.party_size}\n` +
      `- Accessible sites only: ${args.accessible_only ? "yes" : "no"}\n` +
      `- Notification: ${destination}\n` +
      `- Check interval: about every ${config.pollIntervalMinutes} minutes while this assistant is connected.`,
    onConfirm: "confirm and I'll save this watch",
    prepared: { notifyTarget, channel },
  };
}

async function executeAlert(
  args: CreateAlertArgs,
  outcome: TwoPhaseOutcome<PreparedAlert>,
  config: BundleConfig,
  store: AlertStore,
  notifyHosts: ReadonlySet<string>,
): Promise<string> {
  if (store.countActive() >= config.maxActiveAlerts) {
    return "The alert limit was reached after the preview, so I did not save this watch.";
  }
  const prepared = outcome.prepared!;
  const alert = store.add({
    provider: ParksCanadaProvider.providerName,
    recreationAreaId: args.recreation_area_id ?? config.recreationAreaId,
    campgroundId: args.campground_id,
    startDate: args.start_date,
    endDate: args.end_date,
    partySize: args.party_size,
    equipmentType: args.equipment_type ?? null,
    accessibleOnly: args.accessible_only ?? false,
    nights: args.nights ?? null,
    weekendsOnly: args.weekends_only ?? false,
    notifyTarget: prepared.notifyTarget,
  });

  let testOk: boolean | null = null;
  if (prepared.channel) {
    try {
      testOk = await sendMessage(
        prepared.channel.subscribeUrl,
        "This is a test from The Open State. Your campsite alerts will arrive here.",
        {
          title: "Open State alert channel ready",
          allowedHosts: notifyHosts,
        },
      );
    } catch {
      testOk = false;
    }
  }

  const lines = [
    `Saved watch ${alert.id} for ${args.start_date} to ${args.end_date}, party of ${args.party_size}.`,
    `I check about every ${config.pollIntervalMinutes} minutes while this assistant is connected.`,
  ];
  if (prepared.channel) {
    lines.push(
      `Subscribe: ${prepared.channel.subscribeUrl}`,
      `ntfy app: ${prepared.channel.appUrl}`,
      testOk
        ? "The test message was delivered."
        : "The test message did not go through; the watch remains active and delivery will retry when an opening appears.",
    );
  } else if (!prepared.notifyTarget) {
    lines.push("Use list_alerts to check this silent watch.");
  }
  return lines.join("\n");
}

async function runVisible(operation: () => Promise<TextResult>): Promise<TextResult> {
  try {
    return await operation();
  } catch (err) {
    return text(err instanceof AlertStoreError ? err.message : fmt.problem(err));
  }
}
