import { readFile } from "node:fs/promises";
import { isAbsolute, normalize, posix } from "node:path";

export const QWEN25_05B_INSTRUCT_GGUF_MODEL_ID = "qwen2.5-0.5b-instruct-q4_k_m";

const BUILTIN_QWEN25_05B_INSTRUCT_GGUF = {
  schemaVersion: 1,
  id: QWEN25_05B_INSTRUCT_GGUF_MODEL_ID,
  name: "Qwen2.5-0.5B-Instruct GGUF Q4_K_M",
  role: "local-realtime-predictor",
  source: {
    type: "huggingface",
    repository: "lmstudio-community/Qwen2.5-0.5B-Instruct-GGUF",
    url: "https://huggingface.co/lmstudio-community/Qwen2.5-0.5B-Instruct-GGUF",
    revision: "main",
    license: "Apache-2.0"
  },
  storage: {
    directory: QWEN25_05B_INSTRUCT_GGUF_MODEL_ID
  },
  artifacts: [
    {
      path: "Qwen2.5-0.5B-Instruct-Q4_K_M.gguf",
      url: "https://huggingface.co/lmstudio-community/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/Qwen2.5-0.5B-Instruct-Q4_K_M.gguf?download=true",
      sha256: "fa4d41b65761ed565cac6b5f62e35135d050408b033114a128ab308c02b2e83a",
      sizeBytes: 397807936,
      license: "Apache-2.0"
    }
  ],
  benchmark: {
    prompt: "Sancho local predictor health check. Reply with OK.",
    iterations: 3,
    warmup: 1,
    timeoutMs: 30000
  }
};

const BUILTIN_MINISTRAL_3_3B = {
  schemaVersion: 1,
  id: "ministral-3-3b",
  name: "Mistral 3 3.8B",
  role: "local-realtime-predictor",
  source: {
    type: "ollama",
    repository: "ministral-3:3b",
    license: "Apache-2.0"
  },
  storage: {
    directory: "ministral-3-3b"
  },
  artifacts: [],
  benchmark: {
    prompt: "Sancho local predictor health check. Reply with OK.",
    iterations: 3,
    warmup: 1,
    timeoutMs: 30000
  }
};

export const BUILTIN_MODEL_MANIFESTS = Object.freeze({
  [QWEN25_05B_INSTRUCT_GGUF_MODEL_ID]: normalizeModelManifest(BUILTIN_QWEN25_05B_INSTRUCT_GGUF),
  [BUILTIN_MINISTRAL_3_3B.id]: normalizeModelManifest(BUILTIN_MINISTRAL_3_3B)
});

export async function loadModelManifest(identifier = QWEN25_05B_INSTRUCT_GGUF_MODEL_ID) {
  if (BUILTIN_MODEL_MANIFESTS[identifier]) {
    return clone(BUILTIN_MODEL_MANIFESTS[identifier]);
  }

  const raw = JSON.parse(await readFile(identifier, "utf8"));
  return normalizeModelManifest(raw);
}

export function normalizeModelManifest(input) {
  const raw = expectPlainObject(input, "Model manifest");
  const id = cleanIdentifier(raw.id, "Model id");
  const name = cleanOptionalString(raw.name, "Model name") ?? id;
  const role = cleanOptionalString(raw.role, "Model role");
  const source = normalizeSource(raw.source ?? {});
  const storage = normalizeStorage(raw.storage ?? {}, { id });
  const artifacts = normalizeArtifacts(raw.artifacts ?? []);
  const benchmark = normalizeBenchmark(raw.benchmark ?? {});

  return {
    schemaVersion: normalizeSchemaVersion(raw.schemaVersion ?? 1),
    id,
    name,
    ...(role === undefined ? {} : { role }),
    source,
    storage,
    artifacts,
    benchmark
  };
}

function normalizeSource(source) {
  const raw = expectPlainObject(source, "Model source");
  const normalized = {};

  for (const field of ["type", "repository", "url", "revision", "license"]) {
    if (raw[field] !== undefined) {
      normalized[field] = cleanRequiredString(raw[field], `Source ${field}`);
    }
  }

  if (normalized.url) {
    validateUrl(normalized.url, "Source url");
  }

  return normalized;
}

function normalizeStorage(storage, context) {
  const raw = expectPlainObject(storage, "Model storage");
  const directory = cleanRelativePath(
    raw.directory ?? context.id,
    "Model storage directory"
  );

  return { directory };
}

function normalizeArtifacts(artifacts) {
  if (!Array.isArray(artifacts)) {
    throw new TypeError("Model artifacts must be an array.");
  }

  const seen = new Set();
  return artifacts.map((artifact) => {
    const raw = expectPlainObject(artifact, "Model artifact");
    const path = cleanRelativePath(raw.path, "Artifact path");
    if (seen.has(path)) {
      throw new Error(`Duplicate artifact path: ${path}`);
    }
    seen.add(path);

    const normalized = {
      path,
      ...(raw.url === undefined
        ? {}
        : { url: normalizeArtifactUrl(raw.url) }),
      ...(raw.sha256 === undefined
        ? {}
        : { sha256: normalizeSha256(raw.sha256, `Artifact ${path} sha256`) }),
      ...(raw.sizeBytes === undefined
        ? {}
        : { sizeBytes: normalizePositiveInteger(raw.sizeBytes, `Artifact ${path} sizeBytes`) }),
      ...(raw.license === undefined
        ? {}
        : { license: cleanRequiredString(raw.license, `Artifact ${path} license`) })
    };

    return normalized;
  });
}

function normalizeBenchmark(benchmark) {
  const raw = expectPlainObject(benchmark, "Benchmark config");
  return {
    prompt: cleanOptionalString(raw.prompt, "Benchmark prompt")
      ?? "Sancho benchmark prompt.",
    iterations: normalizePositiveInteger(raw.iterations ?? 3, "Benchmark iterations"),
    warmup: normalizeNonNegativeInteger(raw.warmup ?? 1, "Benchmark warmup"),
    timeoutMs: normalizePositiveInteger(raw.timeoutMs ?? 30000, "Benchmark timeoutMs"),
    ...(raw.runner === undefined
      ? {}
      : { runner: normalizeRunner(raw.runner) })
  };
}

export function normalizeRunner(runner) {
  const raw = expectPlainObject(runner, "Benchmark runner");
  return {
    command: cleanCommand(raw.command, "Benchmark runner command"),
    args: normalizeStringList(raw.args ?? [], "Benchmark runner args"),
    env: normalizeEnv(raw.env ?? {}),
    ...(raw.cwd === undefined
      ? {}
      : { cwd: cleanRequiredString(raw.cwd, "Benchmark runner cwd") })
  };
}

function normalizeEnv(env) {
  const raw = expectPlainObject(env, "Benchmark runner env");
  const normalized = {};
  for (const [name, value] of Object.entries(raw)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      throw new Error(`Invalid environment variable name: ${name}`);
    }
    if (value === null || value === undefined || typeof value === "object") {
      throw new TypeError(`Environment variable "${name}" must be scalar.`);
    }
    normalized[name] = String(value);
  }
  return normalized;
}

function normalizeStringList(values, name) {
  if (!Array.isArray(values)) {
    throw new TypeError(`${name} must be an array.`);
  }
  return values.map((value) => {
    if (value === null || value === undefined || typeof value === "object") {
      throw new TypeError(`${name} must contain only scalar values.`);
    }
    const text = String(value);
    if (text.includes("\0")) {
      throw new Error(`${name} must not contain null bytes.`);
    }
    return text;
  });
}

function normalizeArtifactUrl(value) {
  const url = cleanRequiredString(value, "Artifact url");
  validateUrl(url, "Artifact url");
  return url;
}

function validateUrl(value, name) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} is not a valid URL.`);
  }

  if (!["https:", "http:", "file:"].includes(url.protocol)) {
    throw new Error(`${name} must use https:, http:, or file:.`);
  }
}

function normalizeSchemaVersion(value) {
  const version = Number(value);
  if (version !== 1) {
    throw new Error("Model manifest schemaVersion must be 1.");
  }
  return version;
}

function normalizeSha256(value, name) {
  const text = cleanRequiredString(value, name).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(text)) {
    throw new Error(`${name} must be a 64-character hex digest.`);
  }
  return text;
}

function normalizePositiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return number;
}

function normalizeNonNegativeInteger(value, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return number;
}

function cleanRelativePath(value, name) {
  const text = cleanRequiredString(value, name);
  if (text.includes("\0") || text.includes("\\") || isAbsolute(text)) {
    throw new Error(`${name} must be a relative POSIX path.`);
  }

  const normalized = posix.normalize(text);
  if (
    normalized === "."
    || normalized === ".."
    || normalized.startsWith("../")
    || normalize(text).startsWith("..")
  ) {
    throw new Error(`${name} must stay inside the model directory.`);
  }
  return normalized;
}

function cleanIdentifier(value, name) {
  const text = cleanRequiredString(value, name);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(text)) {
    throw new Error(`${name} must be a stable identifier.`);
  }
  return text;
}

function cleanCommand(value, name) {
  const text = cleanRequiredString(value, name);
  if (text.includes("\0") || /[\r\n]/.test(text)) {
    throw new Error(`${name} must not contain null bytes or line breaks.`);
  }
  return text;
}

function cleanOptionalString(value, name) {
  if (value === undefined || value === null) {
    return undefined;
  }
  return cleanRequiredString(value, name);
}

function cleanRequiredString(value, name) {
  if (typeof value !== "string") {
    throw new TypeError(`${name} must be a string.`);
  }
  const text = value.trim();
  if (text.length === 0) {
    throw new Error(`${name} must not be empty.`);
  }
  return text;
}

function expectPlainObject(value, name) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object.`);
  }
  return value;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
