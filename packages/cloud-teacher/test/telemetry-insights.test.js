import assert from "node:assert/strict";
import test from "node:test";

import { aggregateTelemetry, analyzeTelemetry } from "../src/index.js";
import { DEEPSEEK_API_KEY_ENV } from "../src/deepseek.js";

const SAMPLE_EVENTS = [
  ...Array.from({ length: 30 }, (_, i) => ({
    type: "pred",
    ts: 1000 + i,
    code: `code${i}`,
    codeLen: 3 + (i % 3),
    candN: 5,
    runner: i % 5 === 0 ? "deepseek-flash" : "lexicon",
    cacheHit: i % 3 === 0,
    rankN: 3,
    suggN: 2
  })),
  ...Array.from({ length: 20 }, (_, i) => ({
    type: "commit",
    ts: 1000 + i,
    text: `测试短语${i}`,
    code: `csdy${i}`,
    codeLen: 4,
    pickPos: i < 14 ? 1 : (i < 18 ? 2 : 3),
    pickSource: i < 14 ? "model_rank" : "default"
  })),
  {
    type: "session",
    ts: 2000,
    app: "Code",
    chars: 500,
    keystrokes: 600,
    backspaces: 30,
    top1Rate: 0.7,
    enRatio: 0.1,
    dictHits: 5,
    durationSec: 1800
  }
];

test("aggregateTelemetry returns insufficient for empty input", () => {
  const result = aggregateTelemetry([]);
  assert.equal(result.eventCount, 0);
  assert.equal(result.insufficient, true);
});

test("aggregateTelemetry computes top1 rate and runner stats", () => {
  const result = aggregateTelemetry(SAMPLE_EVENTS);

  assert.equal(result.predCount, 30);
  assert.equal(result.commitCount, 20);
  assert.equal(result.insufficient, false);

  assert.ok(result.efficiency.top1Rate > 0.6);
  const deepseekRunner = result.byRunner.find((r) => r.runner === "deepseek-flash");
  assert.ok(deepseekRunner);
  assert.ok(deepseekRunner.calls > 0);
});

test("aggregateTelemetry extracts top phrases from commits", () => {
  const events = Array.from({ length: 30 }, (_, i) => ({
    type: "commit",
    ts: 1000 + i,
    text: i < 10 ? "你好" : `短语${i % 5}`,
    code: "nh",
    codeLen: 2,
    pickPos: 1
  }));
  const result = aggregateTelemetry(events);

  const topPhrase = result.topPhrases[0];
  assert.equal(topPhrase.text, "你好");
  assert.equal(topPhrase.count, 10);
});

test("analyzeTelemetry returns early with insufficient data", async () => {
  const result = await analyzeTelemetry([{ type: "pred", ts: 1 }]);
  assert.equal(result.insights, null);
  assert.ok(result.reason.includes("20"));
});

test("analyzeTelemetry calls Flash with aggregated data and returns insights", async () => {
  let capturedBody;
  const result = await analyzeTelemetry(SAMPLE_EVENTS, {
    fetchImpl: async (url, init) => {
      capturedBody = JSON.parse(init.body);
      return new Response(JSON.stringify({
        id: "insights-test",
        choices: [{
          message: {
            content: JSON.stringify({
              efficiency: { top1Rate: 0.7, backspaceRate: 0.05, assessment: "good" },
              modelEffectiveness: {
                bestRunner: "lexicon",
                runnerComparison: [{ runner: "lexicon", hitRate: 0.8, recommendation: "keep" }]
              },
              codingStyle: { avgCodeLen: 3.5, prefersShortCode: false, mixedInputRatio: 0.1 },
              shortcutSuggestions: [{ phrase: "测试短语0", suggestedCode: "csdy", frequency: 15, reason: "高频无短码" }],
              anomalies: [],
              summary: "整体输入效率良好"
            })
          },
          finish_reason: "stop"
        }],
        usage: { total_tokens: 500 }
      }));
    },
    env: { [DEEPSEEK_API_KEY_ENV]: "test-key" }
  });

  assert.ok(capturedBody);
  assert.ok(result.insights);
  assert.equal(result.insights.efficiency.assessment, "good");
  assert.equal(result.insights.shortcutSuggestions.length, 1);
});
