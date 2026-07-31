import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  previewFooter,
  type ApprovalDecision,
  type ApprovalRequest,
} from "@open-state/kit";

/**
 * Present a consequential-action preview through MCP form elicitation. This is
 * a trusted host-to-citizen interaction; model prose and tool arguments are not
 * accepted as authorization.
 */
export function citizenApproval(
  server: McpServer,
): (request: ApprovalRequest) => Promise<ApprovalDecision> {
  return async (request) => {
    const capabilities = server.server.getClientCapabilities();
    if (!capabilities?.elicitation?.form) return "unavailable";
    try {
      const result = await server.server.elicitInput({
        mode: "form",
        message: request.summary + previewFooter(request.onConfirm),
        requestedSchema: {
          type: "object",
          properties: {
            approved: {
              type: "boolean",
              title: "Approve this exact action",
              description:
                "Select only after reviewing every detail above. The action will " +
                "not occur unless this is selected.",
              default: false,
            },
          },
          required: ["approved"],
        },
      });
      if (result.action === "decline") return "decline";
      if (result.action !== "accept") return "cancel";
      return result.content?.["approved"] === true ? "accept" : "decline";
    } catch {
      return "unavailable";
    }
  };
}
