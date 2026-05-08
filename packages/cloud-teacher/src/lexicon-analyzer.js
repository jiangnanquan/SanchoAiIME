import { createFlashTask } from "./flash-tasks.js";

const BATCH_SIZE = 50;
const DEFAULT_TIMEOUT_MS = 60000;
const MAX_ENTRIES_TOTAL = 500;

const analyzeBatchTask = createFlashTask({
  system: [
    "你是中文输入法词库分析器。只输出 JSON，不要解释。",
    "",
    "分析给定的词库条目列表，为每条目添加标签和评估。",
    "",
    "domain 域（选一）：tech, life, work, academic, entertainment, other",
    "style_tags 标签（可多选）：formal, casual, technical, slang, english-mixed, idiom, name, place, abbreviation",
    "quality 质量评估：keep（保留）, review（需人工确认）, merge（与另一条目合并）, drop（低价值可删除）",
    "reason 理由：简短说明，10字以内",
    "",
    "merge_suggestions 合并建议：发现同音不同字、同义不同码的条目，建议合并为一个。",
    "每条建议包含 surfaces（涉及的条目列表）、suggested_surface（建议保留的）、reading（编码）、reason（理由）",
    "",
    "输出 JSON：",
    '{"entries":[{"surface":"原文","reading":"编码","domain":"tech","style_tags":["technical"],"quality":"keep","reason":"理由"}],"merge_suggestions":[{"surfaces":["A","B"],"suggested_surface":"A","reading":"code","reason":"理由"}]}',
    "",
    "限制：",
    "- 只能分析提供的条目，不要编造",
    "- 不确定时 quality 用 review",
    "- merge_suggestions 最多 10 条",
    "- entries 数量必须与输入一致"
  ].join("\n"),

  buildPrompt(entries) {
    const lines = entries.map((e, i) =>
      `${i + 1}. ${e.surface}\t${e.reading}\t权重${e.weight ?? 100}`
    );
    return [
      `分析以下 ${entries.length} 条词库条目：`,
      "",
      ...lines,
      "",
      "输出 JSON（必须包含全部条目）："
    ].join("\n");
  },

  parseResponse(json, entries) {
    const analyzed = Array.isArray(json.entries) ? json.entries : [];
    const mergeSuggestions = Array.isArray(json.merge_suggestions)
      ? json.merge_suggestions.slice(0, 10)
      : [];

    const merged = entries.map((entry, i) => {
      const tag = analyzed[i];
      return {
        surface: entry.surface,
        reading: entry.reading,
        weight: entry.weight,
        source: entry.source,
        domain: tag?.domain ?? undefined,
        style_tags: normalizeTags(tag?.style_tags),
        quality: normalizeQuality(tag?.quality),
        reason: tag?.reason ?? undefined
      };
    });

    return { entries: merged, merge_suggestions: mergeSuggestions };
  },

  temperature: 0.15,
  maxTokens: 3000,
  timeoutMs: DEFAULT_TIMEOUT_MS
});

const VALID_DOMAINS = new Set([
  "tech", "life", "work", "academic", "entertainment", "other"
]);

const VALID_QUALITIES = new Set(["keep", "review", "merge", "drop"]);

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  const cleaned = tags
    .map((t) => String(t ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_"))
    .filter(Boolean);
  return Array.from(new Set(cleaned)).slice(0, 8);
}

function normalizeQuality(value) {
  const q = String(value ?? "").trim().toLowerCase();
  return VALID_QUALITIES.has(q) ? q : "keep";
}

function normalizeDomain(value) {
  const d = String(value ?? "").trim().toLowerCase();
  return VALID_DOMAINS.has(d) ? d : undefined;
}

export async function analyzeLexicon(entries = [], options = {}) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return { entries: [], merge_suggestions: [], batches: 0, analyzed: 0 };
  }

  const batchSize = options.batchSize ?? BATCH_SIZE;
  const limit = Math.min(entries.length, options.maxEntries ?? MAX_ENTRIES_TOTAL);
  const toAnalyze = entries.slice(0, limit);
  const batches = [];

  for (let i = 0; i < toAnalyze.length; i += batchSize) {
    batches.push(toAnalyze.slice(i, i + batchSize));
  }

  const allEntries = [];
  const allMergeSuggestions = [];
  let analyzedCount = 0;

  for (const batch of batches) {
    try {
      const result = await analyzeBatchTask(batch, {
        timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        env: options.env,
        fetchImpl: options.fetchImpl,
        platform: options.platform,
        execFile: options.execFile
      });

      for (const entry of result.entries) {
        if (entry.domain) entry.domain = normalizeDomain(entry.domain);
        entry.style_tags = normalizeTags(entry.style_tags);
        entry.quality = normalizeQuality(entry.quality);
      }

      allEntries.push(...result.entries);
      allMergeSuggestions.push(...result.merge_suggestions);
      analyzedCount += batch.length;
    } catch {
      for (const entry of batch) {
        allEntries.push({
          surface: entry.surface,
          reading: entry.reading,
          weight: entry.weight,
          source: entry.source,
          quality: "keep"
        });
      }
    }
  }

  return {
    entries: allEntries,
    merge_suggestions: allMergeSuggestions.slice(0, 10),
    batches: batches.length,
    analyzed: analyzedCount
  };
}
