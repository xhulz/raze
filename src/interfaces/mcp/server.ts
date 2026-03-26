import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ZodError } from "zod";
import { toolDefinitions } from "./tools";

/**
 * Wraps a payload into the MCP text content response format.
 *
 * @param payload - The value to JSON-serialize into the response.
 * @returns MCP-compatible content array with a single text entry.
 */
function jsonContent(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

const server = new McpServer({
  name: "raze",
  version: "0.1.0",
});

for (const [name, definition] of Object.entries(toolDefinitions)) {
  server.registerTool(
    name,
    {
      description: definition.description,
      inputSchema: definition.schema.shape,
    },
    async (args: Record<string, unknown>) => {
      try {
        const result = await definition.execute(args);
        return jsonContent({
          ok: true,
          result,
        });
      } catch (error) {
        const message =
          error instanceof ZodError
            ? "Invalid tool input"
            : error instanceof Error
              ? error.message
              : String(error);
        return jsonContent({
          ok: false,
          error: {
            message,
            details: error instanceof ZodError ? error.issues : undefined,
          },
        });
      }
    },
  );
}

const transport = new StdioServerTransport();
await server.connect(transport);
