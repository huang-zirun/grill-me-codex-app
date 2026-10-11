import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  buildElicitation,
  buildWriteInElicitation,
  createServer,
  normalizeResult,
} from "../src/server.mjs";

test("builds a recommended single-select form", () => {
  const form = buildElicitation({
    question: "优先保证什么？",
    options: [
      { id: "simple", label: "简单", description: "减少维护成本" },
      { id: "broad", label: "兼容", description: "覆盖更多客户端" },
    ],
    is_multi_select: false,
    recommended_option_ids: ["simple"],
    allow_write_in: true,
  });

  assert.equal(form.mode, "form");
  assert.equal(
    form.requestedSchema.properties.selected_option_id.default,
    "simple",
  );
  assert.deepEqual(
    form.requestedSchema.properties.selected_option_id.oneOf[0],
    { const: "simple", title: "简单：减少维护成本（推荐）" },
  );
  assert.deepEqual(
    form.requestedSchema.properties.selected_option_id.oneOf[2],
    { const: "__write_in__", title: "其他答案（手动填写）" },
  );
  assert.equal(form.message, "优先保证什么？");
  assert.equal(form.requestedSchema.properties.write_in_response, undefined);
  assert.deepEqual(form.requestedSchema.required, ["selected_option_id"]);
});

test("builds a multi-select form", () => {
  const form = buildElicitation({
    question: "需要哪些能力？",
    options: [
      { id: "one", label: "一", description: "" },
      { id: "two", label: "二", description: "" },
    ],
    is_multi_select: true,
    recommended_option_ids: ["one", "two"],
    allow_write_in: false,
  });

  assert.deepEqual(
    form.requestedSchema.properties.selected_option_ids.default,
    ["one", "two"],
  );
  assert.deepEqual(form.requestedSchema.required, ["selected_option_ids"]);
});

test("builds an open text form", () => {
  const form = buildElicitation({
    question: "请描述目标。",
    options: [],
    is_multi_select: false,
    recommended_option_ids: [],
    allow_write_in: true,
  });

  assert.deepEqual(form.requestedSchema.required, ["write_in_response"]);
  assert.equal(
    form.requestedSchema.properties.write_in_response.title,
    "回答",
  );
});

test("builds a follow-up form for a written answer", () => {
  const form = buildWriteInElicitation("优先保证什么？");

  assert.equal(form.message, "优先保证什么？");
  assert.deepEqual(form.requestedSchema.required, ["write_in_response"]);
  assert.equal(
    form.requestedSchema.properties.write_in_response.title,
    "其他答案",
  );
});

test("normalizes answers, skips, and cancellations", () => {
  assert.deepEqual(
    normalizeResult({
      action: "accept",
      content: {
        selected_option_id: "simple",
        write_in_response: "补充说明",
      },
    }),
    {
      status: "answered",
      selected_option_ids: ["simple"],
      write_in_response: "补充说明",
    },
  );
  assert.equal(normalizeResult({ action: "decline" }).status, "skipped");
  assert.equal(normalizeResult({ action: "cancel" }).status, "cancelled");
});

test("completes a choice without showing a text field", async () => {
  const server = createServer();
  const client = new Client(
    { name: "test-client", version: "1.0.0" },
    { capabilities: { elicitation: { form: {} } } },
  );
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  client.setRequestHandler(ElicitRequestSchema, async (request) => {
    assert.equal(request.params.message, "优先保证什么？");
    assert.equal(
      request.params.requestedSchema.properties.write_in_response,
      undefined,
    );
    return {
      action: "accept",
      content: { selected_option_id: "simple" },
    };
  });

  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const result = await client.callTool({
    name: "ask_question",
    arguments: {
      question: "优先保证什么？",
      options: [{ id: "simple", label: "简单", description: "" }],
      recommended_option_ids: ["simple"],
    },
  });

  assert.deepEqual(result.structuredContent, {
    status: "answered",
    selected_option_ids: ["simple"],
    write_in_response: "",
  });

  await client.close();
  await server.close();
});

test("asks for text only after the write-in option is selected", async () => {
  const server = createServer();
  const client = new Client(
    { name: "test-client", version: "1.0.0" },
    { capabilities: { elicitation: { form: {} } } },
  );
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  let requestCount = 0;

  client.setRequestHandler(ElicitRequestSchema, async (request) => {
    requestCount += 1;
    if (requestCount === 1) {
      assert.equal(
        request.params.requestedSchema.properties.write_in_response,
        undefined,
      );
      return {
        action: "accept",
        content: { selected_option_id: "__write_in__" },
      };
    }

    assert.equal(
      request.params.requestedSchema.properties.write_in_response.title,
      "其他答案",
    );
    return {
      action: "accept",
      content: { write_in_response: "先做最小版本" },
    };
  });

  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const result = await client.callTool({
    name: "ask_question",
    arguments: {
      question: "优先保证什么？",
      options: [{ id: "simple", label: "简单", description: "减少维护成本" }],
      recommended_option_ids: ["simple"],
    },
  });

  assert.equal(requestCount, 2);
  assert.deepEqual(result.structuredContent, {
    status: "answered",
    selected_option_ids: [],
    write_in_response: "先做最小版本",
  });

  await client.close();
  await server.close();
});
