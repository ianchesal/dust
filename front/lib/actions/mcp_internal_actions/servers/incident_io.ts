import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { getAccessTokenForInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/authentication";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { normalizeError } from "@app/types";

// Type definitions for incident.io API responses
interface IncidentUpdateResponse {
  updates: Array<{ body: string; created_at: string; author: { name: string } }>;
}

interface IncidentShowResponse {
  incident: {
    id: string;
    name: string;
    summary?: string;
    permalink?: string;
    call_url?: string;
    postmortem_document_url?: string;
    created_at: string;
    incident_status: {
      name: string;
    };
    severity?: {
      name: string;
    };
    visibility?: string;
    slack_channel_id?: string;
    slack_channel_name?: string;
    creator?: {
      user?: {
        name?: string;
        email?: string;
      };
      api_key?: {
        name?: string;
      };
    };
    incident_role_assignments?: Array<{
      role: {
        shortform?: string;
      };
      assignee?: {
        name?: string;
      };
    }>;
  };
}

const serverInfo: InternalMCPServerDefinitionType = {
  name: "incident_io",
  version: "1.0.0",
  description: "Incident.io tools to interact with the Incident.io API V2.",
  authorization: {
    provider: "incident_io" as const,
    use_case: "platform_actions" as const,
  },
  icon: "IncidentIoLogo",
};

const createServer = (auth: Authenticator, mcpServerId: string): McpServer => {
  const server = new McpServer(serverInfo);

  server.tool(
    "list_incident_updates_v2",
    "List updates for a specified incident using the Incident.io API V2.",
    {
      incidentId: z.string().describe("The ID of the incident to list updates for."),
      limit: z
        .number()
        .optional()
        .describe("The maximum number of updates to return."),
    },
    async ({ incidentId, limit }) => {
      const accessToken = await getAccessTokenForInternalMCPServer(auth, {
        mcpServerId,
      });

      try {
        let endpoint =
          `https://api.incident.io/v2/incidents/${incidentId}/updates`;
        if (limit !== undefined) {
          endpoint += `?limit=${limit}`;
        }

        const response = await fetch(endpoint, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        });
        if (!response.ok) {
          const errBody = await response.text();
          throw new Error(
            `HTTP ${response.status}: ${errBody}`
          );
        }

        const data = (await response.json()) as IncidentUpdateResponse;

        const text = data.updates
          .map(
            (u) =>
              `${new Date(u.created_at).toISOString()} - ${u.author.name}: ${u.body}`
          )
          .join("\n") || "No updates were found for this incident.";

        return {
          isError: false,
          content: [
            {
              type: "text",
              text,
            },
          ],
        };
      } catch (e) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error listing incident updates: ${normalizeError(e).message}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "show_incident_v2",
    "Get detailed information about a specific incident using the Incident.io API V2.",
    {
      incidentId: z.string().describe("The ID of the incident to retrieve details for."),
    },
    async ({ incidentId }) => {
      const accessToken = await getAccessTokenForInternalMCPServer(auth, {
        mcpServerId,
      });

      try {
        const endpoint = `https://api.incident.io/v2/incidents/${incidentId}`;

        const response = await fetch(endpoint, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        });
        
        if (!response.ok) {
          const errBody = await response.text();
          throw new Error(
            `HTTP ${response.status}: ${errBody}`
          );
        }

        const data = (await response.json()) as IncidentShowResponse;
        const incident = data.incident;

        // Format incident details into a readable text format
        const details = [
          `# Incident: ${incident.name}`,
          `ID: ${incident.id}`,
          `Status: ${incident.incident_status.name}`,
          incident.severity?.name ? `Severity: ${incident.severity.name}` : null,
          incident.visibility ? `Visibility: ${incident.visibility}` : null,
          `Created: ${new Date(incident.created_at).toLocaleString()}`,
          incident.creator?.user?.name ? `Created by: ${incident.creator.user.name}` : null,
          incident.slack_channel_name ? `Slack Channel: #${incident.slack_channel_name}` : null,
          incident.call_url ? `Call URL: ${incident.call_url}` : null,
          incident.permalink ? `Permalink: ${incident.permalink}` : null,
          "",
          incident.summary ? `## Summary\n${incident.summary}` : null,
          "",
          incident.incident_role_assignments?.length ? "## Role Assignments" : null,
          ...incident.incident_role_assignments?.map(assignment => 
            `${assignment.role.shortform || "Role"}: ${assignment.assignee?.name || "Unassigned"}`
          ) || []
        ].filter(Boolean); // Remove null/undefined entries

        return {
          isError: false,
          content: [
            {
              type: "text",
              text: details.join("\n"),
            },
          ],
        };
      } catch (e) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error retrieving incident details: ${normalizeError(e).message}`,
            },
          ],
        };
      }
    }
  );

  return server;
};

export default createServer;
