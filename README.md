# Function Calling vs MCP Server

## Function Calling

Function calling is a general concept where an AI assistant can invoke predefined functions or tools to perform specific tasks. These functions can be anything from searching files to making API calls, and they run directly in the environment where the assistant is operating.

-> Functions are part of your LLM application codebase.

## MCP (Mission Control Protocol) Server

MCP Server is a specialized server that acts as a bridge between AI applications (agents/assistants) and third-party services (tools). The way MCP servers expose functions to LLMs is standardized, and LLMs can interact with MCP servers either through HTTP requests or by executing CLI commands (like Node.js scripts). While function calling happens directly in the assistant's environment, MCP Server manages the communication, authentication, and execution of commands with external services in a controlled and secure manner.

-> MCP servers are standalone applications that the LLM can interact with.

## Implementation Examples

### `/func-calling`

This folder contains an example implementation of direct function calling with OpenAI. It's a CLI application that demonstrates how to build an LLM app that controls Home Assistant lights using OpenAI's function calling feature. The functions are defined within the application itself and are directly available to the LLM during execution.

### `/mcp-server`

This folder contains a Node.js MCP server implementation that can be integrated into any LLM application. Instead of implementing function calling directly, this server provides a standardized way to expose Home Assistant controls through the MCP protocol. This makes it easier to reuse the same functionality across different LLM applications without reimplementing the Home Assistant integration each time.

You would integrate the MCP server into your LLM application by providing it the following information:

First, build the MCP server:
```bash
bun i
bun run build
```

Then, copy the absolute path to the MCP server script to your LLM application's MCP server configuration:

```json
{
    "name": "home-assistant",
    "command": "node /Users/andrelandgraf/workspaces/mcps/mcp-server/dist/index.js"
}
```

Now, your LLM application can use the MCP server to control Home Assistant lights.