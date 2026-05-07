export const DEFAULT_RUNNER_TIMEOUT_MS = 8000;
export const DEFAULT_OLLAMA_ENDPOINT = "http://127.0.0.1:11434/api/generate";

export function createAsyncPredictionRunner(options = {}) {
  const runner = createPredictionRunner(options);
  return new CachedAsyncPredictionRunner(runner, {
    cacheLimit: options.cacheLimit ?? 200
  });
}

export function createPredictionRunner(options = {}) {
  const env = options.env ?? process.env;
  const provider = normalizeProvider(
    options.provider
      ?? env.SANCHO_PREDICTOR_RUNNER
      ?? (options.endpoint ?? env.SANCHO_PREDICTOR_ENDPOINT ? "http" : undefined)
      ?? (options.ollamaModel ?? env.SANCHO_OLLAMA_MODEL ?? env.SANCHO_PREDICTOR_OLLAMA_MODEL ? "ollama" : "none")
  );
  if (provider === "http") {
    return new HttpPredictionRunner({
      endpoint: options.endpoint ?? env.SANCHO_PREDICTOR_ENDPOINT,
      fetchImpl: options.fetchImpl,
      timeoutMs: options.timeoutMs
    });
  }
  if (provider === "ollama") {
    return new OllamaPredictionRunner({
      endpoint: options.ollamaEndpoint ?? env.SANCHO_OLLAMA_ENDPOINT ?? DEFAULT_OLLAMA_ENDPOINT,
      model: options.ollamaModel ?? env.SANCHO_OLLAMA_MODEL ?? env.SANCHO_PREDICTOR_OLLAMA_MODEL,
      fetchImpl: options.fetchImpl,
      timeoutMs: options.timeoutMs
    });
  }
  return new DisabledPredictionRunner();
}

export function normalizeRunnerPrediction(input, options = {}) {
  if (!input || typeof input !== "object") {
    return undefined;
  }
  const rank = normalizeRows(input.rank ?? input.rankedCandidates ?? input.ranked_candidates);
  const suggestions = normalizeRows(input.suggestions ?? input.predict ?? input.predictions);
  if (rank.length === 0 && suggestions.length === 0) {
    return undefined;
  }
  return {
    mode: options.mode ?? cleanText(input.mode) ?? "runner",
    rank,
    suggestions
  };
}

class CachedAsyncPredictionRunner {
  constructor(runner, options = {}) {
    this.runner = runner;
    this.cache = new Map();
    this.pending = new Map();
    this.cacheLimit = options.cacheLimit;
    this.lastSuccessAt = undefined;
    this.lastError = undefined;
  }

  getCachedPrediction(input = {}) {
    return this.cache.get(predictionKey(input));
  }

  schedule(input = {}) {
    if (!this.runner.enabled) {
      return;
    }
    const key = predictionKey(input);
    if (!key || this.cache.has(key) || this.pending.has(key)) {
      return;
    }
    const task = this.runner.predict(input)
      .then((prediction) => {
        if (prediction) {
          this.cache.set(key, prediction);
          this.trimCache();
          this.lastSuccessAt = new Date();
          this.lastError = undefined;
        }
      })
      .catch((error) => {
        this.lastError = error;
      })
      .finally(() => {
        this.pending.delete(key);
      });
    this.pending.set(key, task);
  }

  status() {
    return {
      ...this.runner.status(),
      cacheSize: this.cache.size,
      pendingCount: this.pending.size,
      lastSuccessAt: this.lastSuccessAt?.toISOString(),
      lastError: this.lastError?.message
    };
  }

  trimCache() {
    while (this.cache.size > this.cacheLimit) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }
  }
}

class DisabledPredictionRunner {
  get enabled() {
    return false;
  }

  async predict() {
    return undefined;
  }

  status() {
    return {
      provider: "none",
      enabled: false,
      configured: false
    };
  }
}

class HttpPredictionRunner {
  constructor(options = {}) {
    this.endpoint = options.endpoint;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_RUNNER_TIMEOUT_MS;
  }

  get enabled() {
    return Boolean(this.endpoint && this.fetchImpl);
  }

  async predict(input = {}) {
    if (!this.enabled) {
      return undefined;
    }
    const response = await fetchWithTimeout(this.fetchImpl, this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(runnerRequest(input)),
      timeoutMs: this.timeoutMs
    });
    if (!response.ok) {
      return undefined;
    }
    return normalizeRunnerPrediction(await response.json(), { mode: "http-runner" });
  }

  status() {
    return {
      provider: "http",
      enabled: this.enabled,
      configured: Boolean(this.endpoint),
      endpoint: this.endpoint,
      timeoutMs: this.timeoutMs
    };
  }
}

class OllamaPredictionRunner {
  constructor(options = {}) {
    this.endpoint = options.endpoint ?? DEFAULT_OLLAMA_ENDPOINT;
    this.model = options.model;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_RUNNER_TIMEOUT_MS;
  }

  get enabled() {
    return Boolean(this.endpoint && this.model && this.fetchImpl);
  }

  async predict(input = {}) {
    if (!this.enabled) {
      return undefined;
    }
    const request = runnerRequest(input);
    const response = await fetchWithTimeout(this.fetchImpl, this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        format: "json",
        options: {
          temperature: 0,
          num_predict: 160
        },
        prompt: buildOllamaPrompt(request)
      }),
      timeoutMs: this.timeoutMs
    });
    if (!response.ok) {
      return undefined;
    }
    const payload = await response.json();
    return sanitizeOllamaPrediction(
      normalizeRunnerPrediction(parseJsonObject(payload.response), { mode: "ollama" }),
      request
    );
  }

  status() {
    return {
      provider: "ollama",
      enabled: this.enabled,
      configured: Boolean(this.model),
      endpoint: this.endpoint,
      model: this.model,
      timeoutMs: this.timeoutMs
    };
  }
}

async function fetchWithTimeout(fetchImpl, url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    return await fetchImpl(url, {
      method: options.method,
      headers: options.headers,
      body: options.body,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

function runnerRequest(input = {}) {
  return {
    code: cleanCode(input.code),
    candidates: normalizeCandidateTexts(input.candidates).slice(0, 12),
    context: cleanText(input.context ?? input.commits ?? ""),
    commits: cleanText(input.commits ?? "").slice(-200)
  };
}

function buildOllamaPrompt(request) {
  const commits = request.commits || request.context || "";
  return [
    "你是中文输入法候选重排器。只输出 JSON，不要解释。",
    "根据拼音编码、最近输入历史和候选列表，返回最可能的候选重排和最多 2 个短语预测。",
    "rank 只能使用候选列表里真实存在的文字；suggestions 可以为空。",
    "suggestions 可以根据最近输入预测下一个词或短语。",
    "必须尊重拼音读音；不确定时保持候选原顺序，不要把发音不匹配的候选提前。",
    "不要输出 候选 预测 等占位词。",
    "JSON 结构：{\"rank\":[{\"text\":\"真实候选\",\"score\":120}],\"suggestions\":[{\"text\":\"真实预测\",\"score\":100,\"comment\":\"AI\"}]}",
    `拼音编码：${request.code}`,
    `最近输入：${commits}`,
    `候选：${request.candidates.join(" | ")}`
  ].join("\n");
}

function sanitizeOllamaPrediction(prediction, request) {
  if (!prediction) {
    return undefined;
  }
  const candidateTexts = new Set(request.candidates);
  const originalIndex = new Map(request.candidates.map((text, index) => [text, index]));
  const placeholderTexts = new Set(["候选", "预测", "真实候选", "真实预测", "candidate", "prediction"]);
  let rank = prediction.rank
    .filter((row) => candidateTexts.has(row.text))
    .map((row) => ({
      ...row,
      comment: aiComment(row.comment, "AI 重排")
    }));
  if (rank.length > 0 && (originalIndex.get(rank[0].text) ?? 0) > 0) {
    rank = [];
  }
  const seenSuggestions = new Set();
  const suggestions = [];
  for (const row of prediction.suggestions) {
    if (
      Array.from(row.text).length < 2
      || placeholderTexts.has(row.text)
      || candidateTexts.has(row.text)
      || seenSuggestions.has(row.text)
    ) {
      continue;
    }
    seenSuggestions.add(row.text);
    suggestions.push({
      ...row,
      comment: aiComment(row.comment, "AI 预测")
    });
  }
  if (rank.length === 0 && suggestions.length === 0) {
    return undefined;
  }
  return {
    ...prediction,
    rank,
    suggestions
  };
}

function aiComment(value, fallback) {
  const text = cleanText(value);
  if (!text || text.toLowerCase() === "ai" || text === "Sancho AI") {
    return fallback;
  }
  return text.includes("AI") ? text : `${fallback} ${text}`;
}

function parseJsonObject(value) {
  const text = String(value ?? "").trim();
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return undefined;
    }
    try {
      return JSON.parse(match[0]);
    } catch {
      return undefined;
    }
  }
}

function normalizeRows(input) {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .map((item) => {
      const raw = typeof item === "string" ? { text: item } : item;
      const text = cleanText(raw?.text ?? raw?.candidate ?? raw?.surface);
      if (!text) {
        return undefined;
      }
      return {
        text,
        score: Number.isFinite(Number(raw.score)) ? Number(raw.score) : 100000,
        comment: cleanText(raw.comment) || "Sancho AI",
        code: cleanText(raw.code)
      };
    })
    .filter(Boolean);
}

function predictionKey(input = {}) {
  const code = cleanCode(input.code);
  if (!code) {
    return "";
  }
  const commits = cleanText(input.commits ?? input.context ?? "").slice(-100);
  return `${code}\n${normalizeCandidateTexts(input.candidates).join("\n")}\n${commits}`;
}

function normalizeCandidateTexts(value) {
  if (Array.isArray(value)) {
    return value.map(candidateText).filter(Boolean);
  }
  return String(value ?? "")
    .split(/\n|\|/)
    .map(cleanText)
    .filter(Boolean);
}

function candidateText(value) {
  if (value && typeof value === "object") {
    return cleanText(value.text ?? value.candidate ?? value.surface);
  }
  return cleanText(value);
}

function cleanText(value) {
  return String(value ?? "").replace(/[\r\n\t]/g, " ").trim();
}

function cleanCode(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9;'.]/g, "");
}

function normalizeProvider(value) {
  const provider = String(value ?? "none").trim().toLowerCase();
  if (["none", "http", "ollama"].includes(provider)) {
    return provider;
  }
  return "none";
}
