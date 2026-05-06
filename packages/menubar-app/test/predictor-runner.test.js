import assert from "node:assert/strict";
import test from "node:test";

import {
  createAsyncPredictionRunner,
  normalizeRunnerPrediction
} from "../src/predictor-runner.js";

test("normalizes runner predictions from common JSON shapes", () => {
  const prediction = normalizeRunnerPrediction({
    ranked_candidates: [
      { candidate: "请问", score: 12 }
    ],
    suggestions: [
      { text: "请问一下", score: 8, comment: "AI" }
    ]
  });

  assert.equal(prediction.rank[0].text, "请问");
  assert.equal(prediction.suggestions[0].text, "请问一下");
});

test("caches async HTTP runner predictions without blocking first lookup", async () => {
  let calls = 0;
  const runner = createAsyncPredictionRunner({
    provider: "http",
    endpoint: "http://runner.test/predict",
    fetchImpl: async () => {
      calls += 1;
      return Response.json({
        suggestions: [
          { text: "模型预测", score: 100, comment: "AI" }
        ]
      });
    }
  });

  const input = { code: "mx", candidates: ["明显"] };
  assert.equal(runner.getCachedPrediction(input), undefined);
  runner.schedule(input);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const cached = runner.getCachedPrediction(input);
  assert.equal(cached.suggestions[0].text, "模型预测");
  assert.equal(calls, 1);
  assert.equal(runner.status().cacheSize, 1);
});

test("sanitizes Ollama placeholder rows against the current candidates", async () => {
  const runner = createAsyncPredictionRunner({
    provider: "ollama",
    ollamaModel: "fixture-qwen",
    fetchImpl: async () => Response.json({
      response: JSON.stringify({
        rank: [
          { text: "候选", score: 120 },
          { text: "你好", score: 100 }
        ],
        suggestions: [
          { text: "预测", score: 90 },
          { text: "你好呀", score: 80, comment: "AI" }
        ]
      })
    })
  });

  const input = { code: "nihao", candidates: ["你好", "你"] };
  runner.schedule(input);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const cached = runner.getCachedPrediction(input);
  assert.equal(cached.rank.length, 1);
  assert.equal(cached.rank[0].text, "你好");
  assert.equal(cached.rank[0].comment, "AI 重排");
  assert.equal(cached.suggestions.length, 1);
  assert.equal(cached.suggestions[0].text, "你好呀");
  assert.equal(cached.suggestions[0].comment, "AI 预测");
});

test("ignores malformed Ollama JSON without caching a failed prediction", async () => {
  const runner = createAsyncPredictionRunner({
    provider: "ollama",
    ollamaModel: "fixture-qwen",
    fetchImpl: async () => Response.json({
      response: "{\"rank\":[{\"text\":\"你好\"}"
    })
  });

  const input = { code: "nihao", candidates: ["你好"] };
  runner.schedule(input);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(runner.getCachedPrediction(input), undefined);
  assert.equal(runner.status().lastError, undefined);
});
