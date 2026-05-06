import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createLocalPredictorService,
  predictForRime
} from "../src/predictor-service.js";

test("predicts custom phrases from the current pinyin code", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sancho-predictor-"));
  const customPhrasePath = join(directory, "custom_phrase.txt");

  try {
    await writeFile(customPhrasePath, [
      "# @sancho candidate_position=2",
      "青蛙趴\tqw\t60",
      "请问\tqw\t20",
      "# >>> SanchoAiIME managed: quick-dictionary",
      "Qwen 本地预测\tqwp\t90",
      "# <<< SanchoAiIME managed: quick-dictionary",
      ""
    ].join("\n"));

    const prediction = await predictForRime({
      code: "qw",
      candidates: ["请问", "期望"]
    }, {
      customPhrasePath,
      settings: {
        enabled: true,
        candidateLimit: 12,
        timeoutMs: 80,
        minCodeLength: 2
      }
    });

    assert.equal(prediction.mode, "lexicon");
    assert.equal(prediction.suggestions[0].text, "青蛙趴");
    assert.equal(prediction.suggestions[0].position, 2);
    assert.equal(prediction.rank[0].text, "请问");
    assert.equal(prediction.rank[0].comment, "Sancho");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("serves Rime TSV predictions over localhost", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sancho-predictor-server-"));
  const customPhrasePath = join(directory, "custom_phrase.txt");
  const modelStateReader = async () => ({
    status: "loaded",
    modelDir: join(directory, "models"),
    manifest: {
      name: "Fixture Model"
    }
  });

  try {
    await writeFile(customPhrasePath, "青蛙趴\tqw\t60\n");
    const service = createLocalPredictorService({
      customPhrasePath,
      modelStateReader,
      settings: {
        port: 18841,
        timeoutMs: 80,
        candidateLimit: 12,
        minCodeLength: 2
      }
    });
    const status = await service.start();
    assert.equal(status.running, true);

    const statusResponse = await fetch("http://127.0.0.1:18841/v1/status");
    const statusBody = await statusResponse.json();
    assert.equal(statusBody.running, true);

    const response = await fetch("http://127.0.0.1:18841/v1/predict.tsv?code=qw&candidates=%E8%AF%B7%E9%97%AE");
    const body = await response.text();
    assert.match(body, /^# sancho-predictor-v1/m);
    assert.match(body, /suggest\t青蛙趴/);
    await service.stop();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("merges cached async runner predictions on later requests", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sancho-predictor-runner-"));
  const customPhrasePath = join(directory, "custom_phrase.txt");

  try {
    await writeFile(customPhrasePath, "");
    const service = createLocalPredictorService({
      customPhrasePath,
      settings: {
        timeoutMs: 80,
        candidateLimit: 12,
        minCodeLength: 2
      },
      runnerOptions: {
        provider: "http",
        endpoint: "http://runner.test/predict",
        fetchImpl: async () => Response.json({
          suggestions: [
            { text: "模型预测短语", score: 100, comment: "AI" }
          ]
        })
      }
    });

    const first = await service.predict({ code: "mx", candidates: ["明显"] });
    assert.equal(first.suggestions.length, 0);

    await new Promise((resolve) => setTimeout(resolve, 0));
    const second = await service.predict({ code: "mx", candidates: ["明显"] });
    assert.equal(second.suggestions[0].text, "模型预测短语");
    assert.equal(second.suggestions[0].comment, "AI 预测");
    assert.equal(second.mode, "external-runner+lexicon");
    assert.equal(service.runner.status().cacheSize, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
