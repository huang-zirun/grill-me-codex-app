import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const optionSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().default(""),
});

export const questionSchema = z.object({
  question: z.string(),
  options: z.array(optionSchema).default([]),
  is_multi_select: z.boolean().default(false),
  recommended_option_ids: z.array(z.string()).default([]),
  allow_write_in: z.boolean().default(true),
});

export function buildElicitation(input) {
  const recommended = new Set(input.recommended_option_ids);
  const labels = input.options.map((option) => ({
    const: option.id,
    title: `${option.label}${recommended.has(option.id) ? "（推荐）" : ""}`,
  }));
  const details = input.options
    .filter((option) => option.description)
    .map((option) => `- ${option.label}：${option.description}`)
    .join("\n");
  const properties = {};
  const required = [];

  if (input.options.length) {
    if (input.is_multi_select) {
      properties.selected_option_ids = {
        type: "array",
        title: "选择",
        items: { anyOf: labels },
        default: input.recommended_option_ids,
      };
    } else {
      properties.selected_option_id = {
        type: "string",
        title: "选择",
        oneOf: labels,
        default: input.recommended_option_ids[0],
      };
    }

    if (!input.allow_write_in) {
      required.push(input.is_multi_select ? "selected_option_ids" : "selected_option_id");
    }
  }

  if (input.allow_write_in || !input.options.length) {
    properties.write_in_response = {
      type: "string",
      title: input.options.length ? "其他答案（可选）" : "回答",
    };
    if (!input.options.length) required.push("write_in_response");
  }

  return {
    mode: "form",
    message: details ? `${input.question}\n\n${details}` : input.question,
    requestedSchema: {
      type: "object",
      properties,
      ...(required.length ? { required } : {}),
    },
  };
}

export function normalizeResult(result) {
  const content = result.content ?? {};
  const selected = Array.isArray(content.selected_option_ids)
    ? content.selected_option_ids
    : content.selected_option_id
      ? [content.selected_option_id]
      : [];
  return {
    status:
      result.action === "accept"
        ? "answered"
        : result.action === "decline"
          ? "skipped"
          : "cancelled",
    selected_option_ids: selected,
    write_in_response: String(content.write_in_response ?? ""),
  };
}

export function createServer() {
  const server = new McpServer(
    { name: "grill-me-codex-app", version: "0.1.0" },
    {
      instructions:
        "Use ask_question for one unresolved decision at a time. It opens a native form in Codex App and returns the user's structured answer.",
    },
  );

  server.registerTool(
    "ask_question",
    {
      title: "Ask one question",
      description:
        "Ask the user one decision question in a native Codex App form. Use one call per question.",
      inputSchema: questionSchema,
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      const answer = normalizeResult(await server.server.elicitInput(buildElicitation(input)));
      return {
        content: [{ type: "text", text: JSON.stringify(answer) }],
        structuredContent: answer,
      };
    },
  );

  return server;
}

export async function main() {
  await createServer().connect(new StdioServerTransport());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
