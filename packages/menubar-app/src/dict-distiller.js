import { readFile, writeFile } from "node:fs/promises";

import { callDeepSeekChat } from "@sancho-ai-ime/cloud-teacher";

const MAX_LOG_CHARS = 8000;

export async function distillSuggestions(options = {}) {
  const logPath = options.commitLogPath;
  const suggestionsPath = options.suggestionsPath;
  if (!logPath || !suggestionsPath) {
    throw new Error("commitLogPath and suggestionsPath are required");
  }

  const logContent = await readRecentLog(logPath);
  if (!logContent.trim()) {
    return { suggestions: [], reason: "no-log-data" };
  }

  const response = await callDeepSeekChat({
    message: buildDistillationPrompt(logContent),
    system: buildDistillationSystem(),
    temperature: 0.2,
    maxTokens: 1200,
    allowNetwork: true,
    timeoutMs: 60000
  });

  const suggestions = parseSuggestions(response.content);
  if (suggestions.length === 0) {
    return { suggestions: [], reason: "no-suggestions", rawResponse: response.content };
  }

  const results = {
    generatedAt: new Date().toISOString(),
    sourceLogChars: logContent.length,
    suggestions: suggestions.map((s) => ({
      phrase: s.phrase ?? "",
      code: s.code ?? "",
      weight: Math.min(999, Math.max(1, Number(s.weight) || 90)),
      reason: s.reason ?? ""
    }))
  };

  await writeFile(suggestionsPath, JSON.stringify(results, null, 2) + "\n", "utf8");
  return results;
}

export async function readSuggestions(suggestionsPath) {
  try {
    return JSON.parse(await readFile(suggestionsPath, "utf8"));
  } catch {
    return { suggestions: [], generatedAt: null };
  }
}

export async function approveSuggestion(suggestionsPath, index) {
  const data = await readSuggestions(suggestionsPath);
  if (index < 0 || index >= data.suggestions.length) {
    throw new Error(`Invalid suggestion index: ${index}`);
  }
  data.suggestions[index].approved = true;
  data.suggestions[index].approvedAt = new Date().toISOString();
  await writeFile(suggestionsPath, JSON.stringify(data, null, 2) + "\n", "utf8");
  return data.suggestions[index];
}

export function buildQuickDictionaryEntries(suggestions) {
  return suggestions
    .filter((s) => s.phrase && s.code)
    .map((s) => ({
      surface: s.phrase,
      code: s.code,
      weight: s.weight
    }));
}

async function readRecentLog(logPath) {
  const MIN_COUNT = 3;
  try {
    const content = await readFile(logPath, "utf8");
    const tail = content.length <= MAX_LOG_CHARS
      ? content
      : content.slice(-MAX_LOG_CHARS);
    const lines = tail.split("\n").filter((line) => line.trim());
    const counts = new Map();
    for (const line of lines) {
      const text = line.split("\t").slice(1).join("\t").trim();
      if (!text) continue;
      counts.set(text, (counts.get(text) ?? 0) + 1);
    }
    const filtered = Array.from(counts.entries())
      .filter(([, count]) => count >= MIN_COUNT)
      .sort((a, b) => b[1] - a[1])
      .map(([text, count]) => `${count}x\t${text}`)
      .join("\n");
    return filtered;
  } catch {
    return "";
  }
}

function buildDistillationSystem() {
  return [
    "你是中文输入法个人词库优化器。只输出 JSON，不要解释。",
    "",
    "输入格式：每行是 \"频次x\\t短语\"，频次是用户打这个短语的次数（至少 3 次）。",
    "已过滤了误触和低频输入，你看到的都是用户真正常用的内容。",
    "",
    "输出规则：",
    "1. phrase(短语), code(拼音编码), weight(1-999), reason(理由) 缺一不可",
    "2. code 必须是小写拼音，不带声调，词语间不加空格",
    "3. 频次高（≥10次）、明显是专业术语或个人惯用语的，weight 建议 95+",
    "4. 不要建议：单字、语助词、已在常见词库中的日常用语",
    "5. 如果发现两个短语的拼音编码相同或相似，建议合并为一条，在 reason 里说明",
    "6. 最多输出 8 条"
  ].join("\n");
}

function buildDistillationPrompt(logContent) {
  return [
    "以下用户的打字习惯（格式：频次x\\t短语）：",
    "",
    logContent,
    "",
    "输出 JSON：",
    '{"suggestions":[{"phrase":"短语","code":"pinyin","weight":90,"reason":"理由"}]}'
  ].join("\n");
}

function parseSuggestions(text) {
  try {
    const json = JSON.parse(text);
    if (Array.isArray(json.suggestions)) {
      return json.suggestions.filter(
        (s) => s.phrase && s.code && String(s.phrase).trim().length >= 2
      );
    }
  } catch {
    const match = String(text).match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const json = JSON.parse(match[0]);
        if (Array.isArray(json.suggestions)) {
          return json.suggestions.filter(
            (s) => s.phrase && s.code
          );
        }
      } catch {
        // fall through
      }
    }
  }
  return [];
}
