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
let chatHistory: OpenAI.Chat.ChatCompletionMessageParam[] = [
  {
    role: "system",
    content: `Available area IDs in the system are: ${availableAreaIds}. If the user's request doesn't specify an area, ask them to specify one from this list.`,
  },
];

function addToHistory(
  role: 'user' | 'assistant' | 'error',
  content: string,
  toolCalls?: OpenAI.Chat.ChatCompletionMessage["tool_calls"],
) {
  // Also update the OpenAI chat history
  const message: OpenAI.Chat.ChatCompletionMessageParam = {
    role: role === "assistant" ? "assistant" : "user",
    content,
  };

  if (toolCalls) {
    (message as OpenAI.Chat.ChatCompletionMessage).tool_calls = toolCalls;
  }

  chatHistory.push(message);
}

async function handleLightControl(params: {
  areaId: string;
  state: "on" | "off";
}) {
  console.log("handleLightControl", params);
  if (params.state === "on") {
    await dataManager.turnOnAllLights(params.areaId);
  } else {
    await dataManager.turnOffAllLights(params.areaId);
  }
}

async function processCommand(command: string) {
  try {
    // Add user's command to history
    addToHistory("user", command);

    const completion = await openAiClient.chat.completions.create({
      model: "gpt-4",
      messages: chatHistory,
      tools: tools,
    });

    const toolCalls = completion.choices[0].message.tool_calls;
    console.log("toolCalls", toolCalls);
    if (toolCalls && toolCalls.length > 0) {
      const call = toolCalls[0];
      if (call.function.name === "control_light") {
        const params = JSON.parse(call.function.arguments);
        await handleLightControl(params);
        const successMessage = "Command executed successfully";
        console.log("✅", successMessage);

        // Add the assistant's message with tool calls
        addToHistory("assistant", "", toolCalls);

        // Add the tool response
        const toolResponse: OpenAI.Chat.ChatCompletionMessageParam = {
          role: "tool",
          content: successMessage,
          tool_call_id: call.id,
        };
        chatHistory.push(toolResponse);
      }
    } else {
      const aiResponse =
        completion.choices[0].message.content || "No response from AI";
      console.log("\n🤖 AI Response:", aiResponse);
      addToHistory("assistant", aiResponse);
    }
  } catch (error) {
    const errorMessage = `Error: ${error instanceof Error ? error.message : "Unknown error occurred"}`;
    console.error("Error processing command:", error);
    addToHistory("error", errorMessage);
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
