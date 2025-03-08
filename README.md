# Function Calling vs MCP Server

This repository is meant to illustrate the difference between LLM function calling and the Model Context Protocol (MCP).
Function calling has been around for a while, while MCP is a newer standardization attempt.
Comparing the two approaches showcases the value of MCP and how it builds on top of function calling.

This repository contains two examples:

- `/func-calling`: CLI app using OpenAI's function calling to control Home Assistant lights
- `/mcp-server`: Node.js MCP server exposing a `control_lights` function to LLMs that use the MCP protocol

Want to see it in action? Check out my walkthrough on YouTube: [MCP vs. Function Calling - Controlling my office lights with Cursor](https://www.youtube.com/watch?v=DCp3SkPPq2A)

## Home Assistant

[Home Assistant](https://www.home-assistant.io/) is an open-source home automation platform. I run it on a Raspberry Pi in my home.
Home Assistant controls my lights, and you can control it via the Home Assistant WebSocket API.

I built out the `./data-manager` and `./hass-ws-client` utils while playing around with Home Assistant a while ago. I thought it would be a fun example for an external tool. However, the Home Assistant code isn't the focus of this repository.

## Function Calling

[OpenAI function calling docs](https://platform.openai.com/docs/guides/function-calling)

Function calling lets AI assistants invoke predefined functions or tools. These functions run directly in the assistant's environment and can do anything from file searches to API calls. The LLM receives function descriptions in JSON format and specifies which function to call with what arguments. The application then handles the execution.

-> Functions live in your LLM application code.

## MCP Server

[MCP docs](https://modelcontextprotocol.io/introduction)

MCP servers bridge AI applications with third-party services. They expose functions through a standardized protocol that any MCP-compatible LLM can use. While function calling happens locally, MCP servers handle external service communication, auth, and command execution separately.

-> MCP servers are standalone apps any MCP-compatible LLM can use.

### Setting up the MCP server

1. Create a `.env` file in the `mcp-server` directory:

```bash
cp mcp-server/.env.example mcp-server/.env
```

2. Add your Home Assistant API token to the `.env` file:

```bash
HOME_ASSISTANT_API_TOKEN=<your-home-assistant-api-token>
```

3. Build the MCP server:

```bash
bun i
bun run build
```

4. Add the MCP server to your LLM app config (e.g., Cursor):

```json
{
  "name": "home-assistant",
  "command": "node /Users/andrelandgraf/workspaces/mcps/mcp-server/dist/index.js"
}
```

That's it! Your LLM app can now control Home Assistant lights through the MCP server.
