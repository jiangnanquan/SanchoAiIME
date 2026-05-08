import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  bootstrapModel,
  defaultModelsDir,
  loadModelManifest,
  planModelBootstrap,
  resolveModelLayout
} from "@sancho-ai-ime/model-orchestrator";

export const LOCAL_PREDICTOR_MODEL_ID = "ministral-3-3b";
export const LOCAL_PREDICTOR_OLLAMA_SOURCE = "ministral-3:3b";
export const LOCAL_PREDICTOR_OLLAMA_MODEL = "sancho-mistral-3b:latest";
export const ACTIVE_MODEL_FILENAME = "active-model.json";
export const LOCAL_PREDICTOR_MODELFILE = "Modelfile.sancho-mistral";

export function localPredictorRunnerSettings(options = {}) {
  return {
    provider: "ollama",
    ollamaModel: options.modelName ?? LOCAL_PREDICTOR_OLLAMA_MODEL,
    timeoutMs: options.timeoutMs ?? 8000
  };
}

export async function getLocalPredictorState(options = {}) {
  const modelName = options.modelName ?? LOCAL_PREDICTOR_OLLAMA_MODEL;
  const ollamaExecutable = options.ollamaExecutable ?? process.env.SANCHO_OLLAMA_BIN ?? "ollama";
  const exists = await ollamaModelExists(ollamaExecutable, modelName, options);
  return {
    manifest: { id: LOCAL_PREDICTOR_MODEL_ID, name: "Mistral 3 3.8B" },
    plan: { artifactCount: 0, artifacts: [] },
    active: exists ? { model: { id: LOCAL_PREDICTOR_MODEL_ID } } : undefined,
    modelsDir: defaultModelsDir(),
    modelDir: defaultModelsDir(),
    activeModelPath: activeModelPath(defaultModelsDir()),
    status: exists ? "loaded" : "missing"
  };
}

export async function ensureLocalPredictorOllamaModel(options = {}) {
  const modelName = options.modelName ?? LOCAL_PREDICTOR_OLLAMA_MODEL;
  const sourceModel = LOCAL_PREDICTOR_OLLAMA_SOURCE;
  const ollamaExecutable = options.ollamaExecutable ?? process.env.SANCHO_OLLAMA_BIN ?? "ollama";

  const sourceExists = await ollamaModelExists(ollamaExecutable, sourceModel, options);
  if (!sourceExists) {
    if (options.onProgress) {
      options.onProgress({ status: "pulling", detail: sourceModel });
    }
    await execFilePromise(ollamaExecutable, ["pull", sourceModel], {
      timeoutMs: options.timeoutMs ?? 600000
    });
  }

  const exists = !options.recreate && await ollamaModelExists(ollamaExecutable, modelName, options);
  if (exists) {
    return {
      modelName,
      created: false,
      runner: localPredictorRunnerSettings({ modelName })
    };
  }

  const modelFilePath = join(defaultModelsDir(), LOCAL_PREDICTOR_MODELFILE);
  await mkdir(defaultModelsDir(), { recursive: true });
  await writeFile(modelFilePath, renderOllamaModelFile(null), "utf8");
  await execFilePromise(ollamaExecutable, ["create", modelName, "-f", modelFilePath], {
    timeoutMs: options.timeoutMs ?? 120000
  });

  return {
    modelName,
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
  if (modelPath) {
    return [
      `FROM ${JSON.stringify(modelPath)}`,
      "PARAMETER temperature 0",
      "PARAMETER num_predict 160",
      "SYSTEM \"你是中文输入法候选重排器。只输出 JSON，不要解释。\"",
      ""
    ].join("\n");
  }
  return [
    `FROM ${LOCAL_PREDICTOR_OLLAMA_SOURCE}`,
    "PARAMETER temperature 0",
    "PARAMETER num_predict 160",
    "PARAMETER num_ctx 512",
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
