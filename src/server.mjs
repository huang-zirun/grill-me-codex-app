import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const WRITE_IN_OPTION_ID = "__write_in__";
const ELICITATION_TIMEOUT_MS = 60 * 60 * 1000;

const optionSchema = z.object({
  id: z.string().describe("Stable option identifier."),
  label: z.string().describe("Short answer name shown in the option."),
  description: z
    .string()
    .default("")
    .describe("Complete answer details shown in the option."),
});

export const questionSchema = z.object({
  question: z
    .string()
    .describe("The question only. Do not include options or answer explanations."),
  options: z.array(optionSchema).default([]),
  is_multi_select: z.boolean().default(false),
  recommended_option_ids: z.array(z.string()).default([]),
  allow_write_in: z.boolean().default(true),
});

export function buildElicitation(input) {
  const recommended = new Set(input.recommended_option_ids);
  const labels = input.options.map((option) => ({
    const: option.id,
    title: `${option.label}${option.description ? `：${option.description}` : ""}${recommended.has(option.id) ? "（推荐）" : ""}`,
  }));
  const properties = {};
  const required = [];

  if (input.options.length) {
    if (input.allow_write_in) {
      labels.push({
        const: WRITE_IN_OPTION_ID,
        title: "其他答案（手动填写）",
      });
    }

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

    required.push(input.is_multi_select ? "selected_option_ids" : "selected_option_id");
  }

  if (!input.options.length) {
    properties.write_in_response = {
      type: "string",
      title: "回答",
    };
    required.push("write_in_response");
  }

  return {
    mode: "form",
    message: input.question,
    requestedSchema: {
      type: "object",
      properties,
      ...(required.length ? { required } : {}),
    },
  };
}

export function buildWriteInElicitation(question) {
  return {
    mode: "form",
    message: question,
    requestedSchema: {
      type: "object",
      properties: {
        write_in_response: {
          type: "string",
          title: "其他答案",
        },
      },
      required: ["write_in_response"],
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
    { name: "grill-me-codex-app", version: "0.1.1" },
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
        "Ask one decision in a native Codex App form. Put only the question in question and each complete answer in its option.",
      inputSchema: questionSchema,
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      const answer = normalizeResult(
        await server.server.elicitInput(buildElicitation(input), {
          timeout: ELICITATION_TIMEOUT_MS,
        }),
      );

      if (
        answer.status === "answered" &&
        answer.selected_option_ids.includes(WRITE_IN_OPTION_ID)
      ) {
        const writeIn = normalizeResult(
          await server.server.elicitInput(buildWriteInElicitation(input.question), {
            timeout: ELICITATION_TIMEOUT_MS,
          }),
        );
        if (writeIn.status !== "answered") return toolResult(writeIn);

        answer.selected_option_ids = answer.selected_option_ids.filter(
          (id) => id !== WRITE_IN_OPTION_ID,
        );
        answer.write_in_response = writeIn.write_in_response;
      }

      return toolResult(answer);
    },
  );

  function toolResult(answer) {
      return {
        content: [{ type: "text", text: JSON.stringify(answer) }],
        structuredContent: answer,
      };
  }

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
