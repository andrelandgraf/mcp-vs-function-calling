import { HomeAssistantWebSocketClient } from "./hass-ws-client/client";
import { DataManager } from "./data-manager/data-manager";
import { dashboardConfigs } from "./data-manager/config";
import invariant from "tiny-invariant";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Validate environment variables
invariant(process.env.HOME_ASSISTANT_HOST, "HOME_ASSISTANT_HOST must be set");
invariant(process.env.HOME_ASSISTANT_TOKEN, "HOME_ASSISTANT_TOKEN must be set");
invariant(
  process.env.HOME_ASSISTANT_SECURE,
  "HOME_ASSISTANT_SECURE must be set",
);

// Initialize Home Assistant client
const hassClient = new HomeAssistantWebSocketClient(
  process.env.HOME_ASSISTANT_HOST,
  process.env.HOME_ASSISTANT_TOKEN,
  {
    isSecure: process.env.HOME_ASSISTANT_SECURE === "true",
    shouldLog: false,
  },
);
const dataManager = new DataManager(hassClient);
dataManager.start();
await new Promise((resolve) => setTimeout(resolve, 2000));

async function handleLightControl(params: {
  areaId: string;
  state: "on" | "off";
}) {
  if (params.state === "on") {
    await dataManager.turnOnAllLights(params.areaId);
  } else {
    await dataManager.turnOffAllLights(params.areaId);
  }
}

// Define the light control schema
const lightControlSchema = {
  areaId: z
    .string()
    .describe(
      "The area ID of the light in Home Assistant (e.g., office, kitchen)",
    ),
  state: z.enum(["on", "off"]).describe("Whether to turn the light on or off"),
} as const;

// Create server instance
const server = new McpServer({
  name: "home-assistant",
  version: "1.0.0",
});

// Register the light control function
server.tool(
  "control_light",
  "Control a light in Home Assistant (turn on/off)",
  lightControlSchema,
  async (params) => {
    await handleLightControl(params);
    return {
      content: [
        {
          type: "text",
          text: "Light control command executed successfully",
        },
      ],
    };
  },
);

// Create transport and start server
const transport = new StdioServerTransport();
await server.connect(transport);

console.log("🏠 Home Assistant MCP Server Started!");
console.log(
  "Available areas:",
  dashboardConfigs.map((config) => config.areaId),
);
