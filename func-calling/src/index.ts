import OpenAI from "openai";
import { HomeAssistantWebSocketClient } from "./hass-ws-client/client";
import invariant from "tiny-invariant";
import inquirer from "inquirer";
import { DataManager } from "./data-manager/data-manager";
import { dashboardConfigs } from "./data-manager/config";

// Validate environment variables
invariant(process.env.OPEN_AI_API_KEY, "OPEN_AI_API_KEY must be set");
invariant(process.env.HOME_ASSISTANT_HOST, "HOME_ASSISTANT_HOST must be set");
invariant(process.env.HOME_ASSISTANT_TOKEN, "HOME_ASSISTANT_TOKEN must be set");
invariant(
  process.env.HOME_ASSISTANT_SECURE,
  "HOME_ASSISTANT_SECURE must be set",
);

const openAiClient = new OpenAI({
  apiKey: process.env.OPEN_AI_API_KEY,
});

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

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "control_light",
      description: "Control a light in Home Assistant (turn on/off)",
      parameters: {
        type: "object",
        properties: {
          areaId: {
            type: "string",
            description:
              "The area ID of the light in Home Assistant (e.g., office, kitchen)",
          },
          state: {
            type: "string",
            enum: ["on", "off"],
            description: "Whether to turn the light on or off",
          },
        },
        required: ["areaId", "state"],
        additionalProperties: false,
      },
      strict: true,
    },
  },
];

// Get list of available area IDs
const availableAreaIds = dashboardConfigs
  .map((config) => config.areaId)
  .join(", ");

// Initialize chat history for OpenAI
const chatHistory: OpenAI.Chat.ChatCompletionMessageParam[] = [
  {
    role: "system",
    content: `Available area IDs in the system are: ${availableAreaIds}. If the user's request doesn't specify an area, ask them to specify one from this list.`,
  },
];

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

async function processCommand(command: string) {
  try {
    // Add user's command to history
    chatHistory.push({
      role: "user",
      content: command,
    });

    const completion = await openAiClient.chat.completions.create({
      model: "gpt-4",
      messages: chatHistory,
      tools: tools,
    });

    const replyText = completion.choices[0].message.content;
    if (replyText) {
      console.log("\n🤖 Assistant:", replyText);
    }

    const toolCalls = completion.choices[0].message.tool_calls;
    if (toolCalls) {
      console.log("toolCalls", toolCalls);
    }
    if (toolCalls && toolCalls.length > 0) {
      const call = toolCalls[0];
      if (call.function.name === "control_light") {
        const params = JSON.parse(call.function.arguments);
        await handleLightControl(params);

        // Add the assistant's message with tool calls to chat history
        chatHistory.push({
          role: "assistant",
          content: replyText,
          tool_calls: toolCalls,
        });

        // Add the tool response to chat history
        const toolResponse: OpenAI.Chat.ChatCompletionMessageParam = {
          role: "tool",
          content: "Command executed successfully",
          tool_call_id: call.id,
        };
        chatHistory.push(toolResponse);
      }
    }
  } catch (error) {
    const errorMessage = `Error: ${error instanceof Error ? error.message : "Unknown error occurred"}`;
    console.error("\nError processing command:", error);

    // Add the error message to chat history
    chatHistory.push({
      role: "developer",
      content: errorMessage,
    });
  }
}

async function main() {
  console.log("🏠 Welcome to Home Assistant Light Control!");
  console.log("Available areas:", availableAreaIds, "\n");

  while (true) {
    const { command } = await inquirer.prompt([
      {
        type: "input",
        name: "command",
        message: "Enter your command:",
      },
    ]);

    await processCommand(command);
    console.log(); // Empty line for better readability
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
