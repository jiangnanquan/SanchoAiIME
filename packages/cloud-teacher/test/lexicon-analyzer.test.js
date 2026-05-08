import assert from "node:assert/strict";
import test from "node:test";

import { DEEPSEEK_API_KEY_ENV, analyzeLexicon } from "../src/index.js";

const SAMPLE_ENTRIES = [
  { surface: "DuckDB", reading: "duck db", weight: 90, source: "rime" },
  { surface: "Playwright", reading: "play wright", weight: 80, source: "rime" },
  { surface: "快速排序", reading: "kuai su pai xu", weight: 70, source: "sogou" },
  { surface: "你好", reading: "ni hao", weight: 100, source: "rime" }
];

test("analyzeLexicon returns empty result for empty input", async () => {
  const result = await analyzeLexicon([]);
  assert.equal(result.entries.length, 0);
  assert.equal(result.batches, 0);
});

test("analyzeLexicon batches entries and calls Flash", async () => {
  const batchInputs = [];
  const result = await analyzeLexicon(SAMPLE_ENTRIES, {
    batchSize: 2,
    fetchImpl: async (url, init) => {
      const body = JSON.parse(init.body);
      const userMsg = body.messages[1].content;
      batchInputs.push(userMsg);
      return new Response(JSON.stringify({
        id: "analyze-test",
        choices: [{
          message: {
            content: JSON.stringify({
              entries: [
                { surface: "DuckDB", reading: "duck db", domain: "tech", style_tags: ["technical", "english-mixed"], quality: "keep", reason: "技术术语" },
                { surface: "Playwright", reading: "play wright", domain: "tech", style_tags: ["technical", "english-mixed"], quality: "keep", reason: "测试框架" }
              ],
              merge_suggestions: []
            })
          },
          finish_reason: "stop"
        }],
        usage: { total_tokens: 100 }
      }));
    },
    env: { [DEEPSEEK_API_KEY_ENV]: "test-key" }
  });

  assert.equal(result.batches, 2);
  assert.equal(result.analyzed, 4);
  assert.equal(batchInputs.length, 2);
  assert.ok(batchInputs[0].includes("DuckDB"));
  assert.ok(batchInputs[1].includes("快速排序"));
});

test("analyzeLexicon includes merge suggestions", async () => {
  const result = await analyzeLexicon(SAMPLE_ENTRIES, {
    batchSize: 4,
    fetchImpl: async () => {
      return new Response(JSON.stringify({
        id: "merge-test",
        choices: [{
          message: {
            content: JSON.stringify({
              entries: SAMPLE_ENTRIES.map((e) => ({
                surface: e.surface,
                reading: e.reading,
                domain: "tech",
                style_tags: ["technical"],
                quality: "keep",
                reason: "OK"
              })),
              merge_suggestions: [
                {
                  surfaces: ["DuckDB", "duckdb"],
                  suggested_surface: "DuckDB",
                  reading: "duck db",
                  reason: "统一大小写"
                }
              ]
            })
          },
          finish_reason: "stop"
        }],
        usage: null
      }));
    },
    env: { [DEEPSEEK_API_KEY_ENV]: "test-key" }
  });

  assert.equal(result.entries.length, 4);
  assert.equal(result.merge_suggestions.length, 1);
  assert.equal(result.merge_suggestions[0].suggested_surface, "DuckDB");
});

test("analyzeLexicon handles batch errors gracefully", async () => {
  let callCount = 0;
  const result = await analyzeLexicon(SAMPLE_ENTRIES, {
    batchSize: 2,
    fetchImpl: async () => {
      callCount += 1;
      if (callCount === 1) {
        return new Response(JSON.stringify({
          id: "ok",
          choices: [{
            message: {
              content: JSON.stringify({
                entries: [
                  { surface: "DuckDB", reading: "duck db", quality: "keep" },
                  { surface: "Playwright", reading: "play wright", quality: "keep" }
                ],
                merge_suggestions: []
              })
            },
            finish_reason: "stop"
          }],
          usage: null
        }));
      }
      throw new Error("batch failed");
    },
    env: { [DEEPSEEK_API_KEY_ENV]: "test-key" }
  });

  assert.equal(result.entries.length, 4);
  assert.equal(result.analyzed, 2);
  const fallbackEntries = result.entries.slice(2);
  assert.equal(fallbackEntries[0].quality, "keep");
  assert.equal(fallbackEntries[0].surface, "快速排序");
});

test("analyzeLexicon respects maxEntries limit", async () => {
  const manyEntries = Array.from({ length: 20 }, (_, i) => ({
    surface: `词${i}`,
    reading: `ci${i}`,
    weight: 80,
    source: "test"
  }));

  let analyzedCount = 0;
  await analyzeLexicon(manyEntries, {
    maxEntries: 10,
    batchSize: 5,
    fetchImpl: async () => {
      analyzedCount += 5;
      return new Response(JSON.stringify({
        id: "limit-test",
        choices: [{
          message: {
            content: JSON.stringify({
              entries: [],
              merge_suggestions: []
            })
          },
          finish_reason: "stop"
        }],
        usage: null
      }));
    },
    env: { [DEEPSEEK_API_KEY_ENV]: "test-key" }
  });

  assert.equal(analyzedCount, 10);
});
