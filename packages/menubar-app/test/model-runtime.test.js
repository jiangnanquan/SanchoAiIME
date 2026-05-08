import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ensureLocalPredictorOllamaModel,
  getLocalPredictorState,
  LOCAL_PREDICTOR_OLLAMA_MODEL,
  LOCAL_PREDICTOR_OLLAMA_SOURCE
} from "../src/model-runtime.js";

test("getLocalPredictorState reports loaded when sancho model exists", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sancho-menubar-state-"));
  const callsPath = join(directory, "ollama-calls.log");
  const fakeOllamaPath = join(directory, "fake-ollama.cjs");

  try {
    await writeFile(fakeOllamaPath, [
      "#!/usr/bin/env node",
      "const { appendFileSync } = require('node:fs');",
      `appendFileSync(${JSON.stringify(callsPath)}, process.argv.slice(2).join(' ') + '\\n');`,
      "process.exit(0);", // show succeeds → model exists
      ""
    ].join("\n"), "utf8");
    await chmod(fakeOllamaPath, 0o755);

    const state = await getLocalPredictorState({
      ollamaExecutable: fakeOllamaPath,
      modelName: "sancho-mistral-3b:latest"
    });

    assert.equal(state.status, "loaded");
    assert.equal(state.manifest.id, "ministral-3-3b");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("getLocalPredictorState reports missing when model not found", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sancho-menubar-missing-"));
  const callsPath = join(directory, "ollama-calls.log");
  const fakeOllamaPath = join(directory, "fake-ollama.cjs");

  try {
    await writeFile(fakeOllamaPath, [
      "#!/usr/bin/env node",
      "const { appendFileSync } = require('node:fs');",
      `appendFileSync(${JSON.stringify(callsPath)}, process.argv.slice(2).join(' ') + '\\n');`,
      "process.exit(1);", // show fails → model missing
      ""
    ].join("\n"), "utf8");
    await chmod(fakeOllamaPath, 0o755);

    const state = await getLocalPredictorState({
      ollamaExecutable: fakeOllamaPath,
      modelName: "nonexistent:latest"
    });

    assert.equal(state.status, "missing");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("ensureLocalPredictorOllamaModel creates sancho model from source", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sancho-menubar-create-"));
  const callsPath = join(directory, "ollama-calls.log");
  const fakeOllamaPath = join(directory, "fake-ollama.cjs");

  try {
    await writeFile(fakeOllamaPath, [
      "#!/usr/bin/env node",
      "const { appendFileSync } = require('node:fs');",
      `appendFileSync(${JSON.stringify(callsPath)}, process.argv.slice(2).join(' ') + '\\n');`,
      // First call is "show source-model" → succeed (source exists)
      // Second call is "show sancho-model" → fail (sancho not created yet)
      // Third call is "create sancho-model"
      "let count = +(require('node:fs').readFileSync(" + JSON.stringify(callsPath) + ", 'utf8').split('\\n').filter(Boolean).length || '0');",
      "if (process.argv[2] === 'show' && process.argv[3] === '" + LOCAL_PREDICTOR_OLLAMA_MODEL + "') process.exit(1);",
      "process.exit(0);",
      ""
    ].join("\n"), "utf8");
    await chmod(fakeOllamaPath, 0o755);

    const result = await ensureLocalPredictorOllamaModel({
      ollamaExecutable: fakeOllamaPath,
      recreate: true
    });

    assert.equal(result.created, true);
    assert.equal(result.modelName, LOCAL_PREDICTOR_OLLAMA_MODEL);
    assert.equal(result.runner.provider, "ollama");
    assert.equal(result.runner.ollamaModel, LOCAL_PREDICTOR_OLLAMA_MODEL);

    const calls = await readFile(callsPath, "utf8");
    assert.ok(calls.includes(`show ${LOCAL_PREDICTOR_OLLAMA_SOURCE}`));
    assert.ok(calls.includes(`create ${LOCAL_PREDICTOR_OLLAMA_MODEL} -f`));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
