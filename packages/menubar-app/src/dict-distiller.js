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
  try {
    const content = await readFile(logPath, "utf8");
    if (content.length <= MAX_LOG_CHARS) return content;
    return content.slice(-MAX_LOG_CHARS);
  } catch {
    return "";
  }
}

function buildDistillationSystem() {
  return [
    "你是中文输入法个人词库优化器。分析用户最近的打字内容，推断用户的高频词汇、",
    "专业术语和个人短语习惯。只输出 JSON，不要解释。",
    "",
    "规则：",
    "1. 每个建议必须包含 phrase(短语), code(拼音编码), weight(1-999), reason(理由)",
    "2. code 必须是小写拼音，不带声调，词语间不加空格",
    "3. 优先建议：重复出现 2 次以上的短语、明显是专业术语的词、用户自创的简称",
    "4. 不要建议：单字、语助词、已在常见词库中的日常用语",
    "5. 最多输出 8 条建议"
  ].join("\n");
}

function buildDistillationPrompt(logContent) {
  return [
    "以下用户最近的中文打字记录（制表符分隔：时间戳\t内容）：",
    "",
    logContent,
    "",
    "请分析后输出 JSON：",
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
