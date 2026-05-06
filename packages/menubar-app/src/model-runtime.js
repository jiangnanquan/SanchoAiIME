import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  bootstrapModel,
  defaultModelsDir,
  loadModelManifest,
  planModelBootstrap,
  QWEN25_05B_INSTRUCT_GGUF_MODEL_ID,
  resolveModelLayout
} from "@sancho-ai-ime/model-orchestrator";

export const LOCAL_PREDICTOR_MODEL_ID = QWEN25_05B_INSTRUCT_GGUF_MODEL_ID;
export const ACTIVE_MODEL_FILENAME = "active-model.json";
export const LOCAL_PREDICTOR_OLLAMA_MODEL = "sancho-qwen2.5-0.5b:latest";
export const LOCAL_PREDICTOR_MODELFILE = "Modelfile.sancho";

export async function getLocalPredictorState(options = {}) {
  const manifest = options.manifest
    ?? await loadModelManifest(options.modelId ?? LOCAL_PREDICTOR_MODEL_ID);
  const layout = resolveModelLayout(manifest, {
    modelsDir: options.modelsDir ?? defaultModelsDir()
  });
  const plan = await planModelBootstrap(manifest, {
    modelsDir: layout.modelsDir
  });
  const active = await readActiveModel(layout.modelsDir);
  const artifactsReady = plan.artifactCount > 0
    && plan.artifacts.every((artifact) => artifact.status === "cached");
  const activeMatches = active?.model?.id === manifest.id;

  return {
    manifest,
    plan,
    active,
    modelsDir: layout.modelsDir,
    modelDir: layout.modelDir,
    activeModelPath: activeModelPath(layout.modelsDir),
    status: activeMatches && artifactsReady
      ? "loaded"
      : artifactsReady
        ? "downloaded"
        : "missing"
  };
}

export async function bootstrapAndLoadLocalPredictor(options = {}) {
  const manifest = options.manifest
    ?? await loadModelManifest(options.modelId ?? LOCAL_PREDICTOR_MODEL_ID);
  const result = await bootstrapModel(manifest, {
    modelsDir: options.modelsDir ?? defaultModelsDir(),
    allowNetwork: true,
    fetchImpl: options.fetchImpl,
    onDownloadProgress: options.onDownloadProgress
  });
  const active = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: "loaded",
    model: result.model,
    modelDir: result.modelDir,
    lockPath: result.lockPath,
    artifacts: result.artifacts.map((artifact) => ({
      path: artifact.path,
      targetPath: artifact.targetPath,
      sha256: artifact.sha256,
      sizeBytes: artifact.sizeBytes
    }))
  };

  const path = activeModelPath(result.modelsDir);
  await mkdir(result.modelsDir, { recursive: true });
  await writeFile(path, `${JSON.stringify(active, null, 2)}\n`, "utf8");

  return {
    ...result,
    active,
    activeModelPath: path,
    loaded: true
  };
}

export function localPredictorRunnerSettings(options = {}) {
  return {
    provider: "ollama",
    ollamaModel: options.modelName ?? LOCAL_PREDICTOR_OLLAMA_MODEL,
    timeoutMs: options.timeoutMs ?? 8000
  };
}

export async function ensureLocalPredictorOllamaModel(options = {}) {
  const state = options.state ?? await getLocalPredictorState(options);
  if (state.status !== "loaded" && state.status !== "downloaded") {
    throw new Error("Local predictor model is not downloaded yet.");
  }

  const modelPath = resolveLocalPredictorArtifactPath(state);
  await access(modelPath);

  const modelName = options.modelName ?? LOCAL_PREDICTOR_OLLAMA_MODEL;
  const ollamaExecutable = options.ollamaExecutable ?? process.env.SANCHO_OLLAMA_BIN ?? "ollama";
  const exists = !options.recreate && await ollamaModelExists(ollamaExecutable, modelName, options);
  if (exists) {
    return {
      modelName,
      modelPath,
      created: false,
      runner: localPredictorRunnerSettings({ modelName })
    };
  }

  const modelFilePath = join(state.modelDir, LOCAL_PREDICTOR_MODELFILE);
  await writeFile(modelFilePath, renderOllamaModelFile(modelPath), "utf8");
  await execFilePromise(ollamaExecutable, ["create", modelName, "-f", modelFilePath], {
    timeoutMs: options.timeoutMs ?? 120000
  });

  return {
    modelName,
    modelPath,
    modelFilePath,
    created: true,
    runner: localPredictorRunnerSettings({ modelName })
  };
}

function activeModelPath(modelsDir) {
  return join(modelsDir, ACTIVE_MODEL_FILENAME);
}

async function readActiveModel(modelsDir) {
  try {
    return JSON.parse(await readFile(activeModelPath(modelsDir), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function resolveLocalPredictorArtifactPath(state) {
  const activeArtifact = state.active?.artifacts?.find((artifact) => artifact.targetPath);
  if (activeArtifact?.targetPath) {
    return activeArtifact.targetPath;
  }
  const manifestArtifact = state.manifest?.artifacts?.[0];
  if (!manifestArtifact?.path) {
    throw new Error("Local predictor model artifact is missing from the manifest.");
  }
  return join(state.modelDir, manifestArtifact.path);
}

function renderOllamaModelFile(modelPath) {
  return [
    `FROM ${JSON.stringify(modelPath)}`,
    "TEMPLATE \"\"\"{{ if .System }}<|im_start|>system",
    "{{ .System }}<|im_end|>",
    "{{ end }}{{ if .Prompt }}<|im_start|>user",
    "{{ .Prompt }}<|im_end|>",
    "<|im_start|>assistant",
    "{{ end }}{{ .Response }}{{ if .Response }}<|im_end|>{{ end }}\"\"\"",
    "PARAMETER stop <|im_end|>",
    "PARAMETER stop <|endoftext|>",
    "PARAMETER temperature 0",
    "PARAMETER num_predict 160",
    "SYSTEM \"你是中文输入法候选重排器。只输出 JSON，不要解释。\"",
    ""
  ].join("\n");
}

async function ollamaModelExists(ollamaExecutable, modelName, options) {
  try {
    await execFilePromise(ollamaExecutable, ["show", modelName], {
      timeoutMs: options.timeoutMs ?? 30000
    });
    return true;
  } catch {
    return false;
  }
}

async function execFilePromise(executable, args, options = {}) {
  return await new Promise((resolve, reject) => {
    execFile(executable, args, { timeout: options.timeoutMs }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}
