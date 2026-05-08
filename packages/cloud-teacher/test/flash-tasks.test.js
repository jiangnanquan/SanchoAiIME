import assert from "node:assert/strict";
import test from "node:test";

import {
  DEEPSEEK_API_KEY_ENV,
  callDeepSeekChat,
  createFlashTask,
  parseFlashJson
} from "../src/index.js";

test("parseFlashJson parses clean JSON directly", () => {
  assert.deepEqual(parseFlashJson('{"ok":true}'), { ok: true });
});

test("parseFlashJson extracts JSON from markdown code fence", () => {
  const text = 'Here is the result:\n```json\n{"key":"value"}\n```\nDone.';
  assert.deepEqual(parseFlashJson(text), { key: "value" });
});

test("parseFlashJson extracts JSON without language tag in fence", () => {
  const text = '```\n{"x":1}\n```';
  assert.deepEqual(parseFlashJson(text), { x: 1 });
});

test("parseFlashJson extracts outermost JSON object from mixed text", () => {
  const text = 'Some text {"a": 1, "b": 2} more text';
  assert.deepEqual(parseFlashJson(text), { a: 1, b: 2 });
});

test("parseFlashJson returns fallback when JSON extraction fails", () => {
  assert.deepEqual(parseFlashJson("no json here", { fallback: true }), { fallback: true });
});

test("parseFlashJson throws on empty text without fallback", () => {
  assert.throws(() => parseFlashJson(""), /Empty response/);
});

test("parseFlashJson throws on unparseable text without fallback", () => {
  assert.throws(() => parseFlashJson("just some words"), /Failed to parse/);
});

test("createFlashTask rejects missing system prompt", () => {
  assert.throws(() => createFlashTask({}), /system prompt/);
});

test("createFlashTask uses custom buildPrompt and parseResponse", async () => {
  const expectedMessages = [];
  const task = createFlashTask({
    system: "You are a test assistant.",
    buildPrompt(input) {
      return `Process: ${input.text}`;
    },
    parseResponse(json) {
      return { processed: json.result, extra: "tag" };
    },
    temperature: 0.1,
    maxTokens: 100
  });

  const result = await task(
    { text: "hello" },
    {
      allowNetwork: true,
      fetchImpl: async (url, init) => {
        const body = JSON.parse(init.body);
        expectedMessages.push(...body.messages);
        return new Response(JSON.stringify({
          id: "test-id",
          choices: [{ message: { content: '{"result":"OK"}' }, finish_reason: "stop" }],
          usage: { total_tokens: 10 }
        }));
      },
      env: {
        [DEEPSEEK_API_KEY_ENV]: "test-key"
      }
    }
  );

  assert.equal(result.processed, "OK");
  assert.equal(result.extra, "tag");
  assert.equal(result._meta.model, "deepseek-v4-flash");
  assert.equal(result._meta.responseId, "test-id");

  assert.equal(expectedMessages[0].role, "system");
  assert.equal(expectedMessages[0].content, "You are a test assistant.");
  assert.equal(expectedMessages[1].role, "user");
  assert.equal(expectedMessages[1].content, "Process: hello");
});

test("createFlashTask parses output directly when no custom parser", async () => {
  const task = createFlashTask({
    system: "Reply with JSON.",
    buildPrompt(input) {
      return `Input: ${input}`;
    }
  });

  const result = await task("data", {
    allowNetwork: true,
    fetchImpl: async () => {
      return new Response(JSON.stringify({
        id: "test-2",
        choices: [{ message: { content: '{"value":42}' }, finish_reason: "stop" }],
        usage: null
      }));
    },
    env: {
      [DEEPSEEK_API_KEY_ENV]: "test-key"
    }
  });

  assert.equal(result.value, 42);
  assert.equal(result._meta.responseId, "test-2");
});
