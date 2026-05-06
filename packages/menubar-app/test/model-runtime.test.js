import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import {
  bootstrapAndLoadLocalPredictor,
  ensureLocalPredictorOllamaModel,
  getLocalPredictorState
} from "../src/model-runtime.js";

test("bootstraps a local predictor artifact and marks it active", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sancho-menubar-model-"));
  const sourcePath = join(directory, "source.gguf");
  const content = Buffer.from("fixture local model");
  const sha256 = createHash("sha256").update(content).digest("hex");
  const modelsDir = join(directory, "models");
  const manifest = {
    schemaVersion: 1,
    id: "fixture-local-predictor",
    name: "Fixture Local Predictor",
    role: "local-realtime-predictor",
    source: {
      type: "fixture",
      license: "Apache-2.0"
    },
    storage: {
      directory: "fixture-local-predictor"
    },
    artifacts: [
      {
        path: "model.gguf",
        url: pathToFileURL(sourcePath).href,
        sha256,
        sizeBytes: content.length
      }
    ]
  };

  try {
    await writeFile(sourcePath, content);

    const before = await getLocalPredictorState({ manifest, modelsDir });
    assert.equal(before.status, "missing");

    const progressEvents = [];
    const result = await bootstrapAndLoadLocalPredictor({
      manifest,
      modelsDir,
      onDownloadProgress: (progress) => {
        progressEvents.push(progress);
      }
    });
    assert.equal(result.loaded, true);
    assert.equal(result.artifacts[0].status, "downloaded");
    assert.equal(progressEvents.at(-1).percent, 1);

    const active = JSON.parse(await readFile(result.activeModelPath, "utf8"));
    assert.equal(active.status, "loaded");
    assert.equal(active.model.id, "fixture-local-predictor");

    const after = await getLocalPredictorState({ manifest, modelsDir });
    assert.equal(after.status, "loaded");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("registers a loaded GGUF model with Ollama", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sancho-menubar-ollama-"));
  const modelsDir = join(directory, "models");
  const modelDir = join(modelsDir, "fixture-local-predictor");
  const modelPath = join(modelDir, "model.gguf");
  const content = Buffer.from("model");
  const sha256 = createHash("sha256").update(content).digest("hex");
  const activePath = join(modelsDir, "active-model.json");
  const callsPath = join(directory, "ollama-calls.log");
  const fakeOllamaPath = join(directory, "fake-ollama.cjs");
  const manifest = {
    schemaVersion: 1,
    id: "fixture-local-predictor",
    name: "Fixture Local Predictor",
    role: "local-realtime-predictor",
    storage: {
      directory: "fixture-local-predictor"
    },
    source: {
      type: "fixture",
      license: "Apache-2.0"
    },
    artifacts: [
      {
        path: "model.gguf",
        sha256,
        sizeBytes: content.length
      }
    ]
  };

  try {
    await mkdir(modelDir, { recursive: true });
    await writeFile(modelPath, content);
    await writeFile(activePath, `${JSON.stringify({
      schemaVersion: 1,
      status: "loaded",
      model: {
        id: "fixture-local-predictor"
      },
      modelDir,
      artifacts: [
        {
          path: "model.gguf",
          targetPath: modelPath
        }
      ]
    })}\n`, "utf8");
    await writeFile(fakeOllamaPath, [
      "#!/usr/bin/env node",
      "const { appendFileSync } = require('node:fs');",
      `appendFileSync(${JSON.stringify(callsPath)}, process.argv.slice(2).join(' ') + '\\n');`,
      "if (process.argv[2] === 'show') process.exit(1);",
      "process.exit(0);",
      ""
    ].join("\n"), "utf8");
    await chmod(fakeOllamaPath, 0o755);

    const state = await getLocalPredictorState({ manifest, modelsDir });
    const result = await ensureLocalPredictorOllamaModel({
      state,
      ollamaExecutable: fakeOllamaPath,
      modelName: "sancho-fixture:latest"
    });

    assert.equal(result.created, true);
    assert.equal(result.runner.provider, "ollama");
    assert.equal(result.runner.ollamaModel, "sancho-fixture:latest");
    assert.match(await readFile(join(modelDir, "Modelfile.sancho"), "utf8"), /FROM/);
    assert.match(await readFile(callsPath, "utf8"), /create sancho-fixture:latest -f/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
