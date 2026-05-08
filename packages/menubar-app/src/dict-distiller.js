import { readFile, writeFile } from "node:fs/promises";

import { createFlashTask } from "@sancho-ai-ime/cloud-teacher";
import { parseCustomPhraseText } from "@sancho-ai-ime/quick-dictionary";

const MAX_LOG_CHARS = 8000;

const distillTask = createFlashTask({
  system: [
    "你是中文输入法个人词库优化器。只输出 JSON，不要解释。",
    "",
    "输入包含两部分：用户的打字习惯（频次x短语）和已有的快速字典条目。",
    "已过滤了误触和低频输入，你看到的都是用户真正常用的内容。",
    "",
    "输出规则：",
    "1. phrase(短语), code(拼音编码), weight(1-999), reason(理由) 缺一不可",
    "2. code 必须是小写拼音，不带声调，词语间不加空格",
    "3. 频次高（≥10次）、明显是专业术语或个人惯用语的，weight 建议 95+",
    "4. 不要建议：单字、语助词、已在常见词库中的日常用语",
    "5. 不要在已有快速字典中已经存在的条目（参考\"已有条目\"部分）",
    "6. 如果发现用户打字中同一短语有多种写法（大小写不一致、中英混用不一致），建议统一为一种",
    "7. 对于用户频繁输入但无短码的长短语（≥4字），建议创建短码",
    "8. 最多输出 8 条"
  ].join("\n"),

  buildPrompt(input) {
    const lines = [
      "以下用户的打字习惯（格式：频次x\\t短语）：",
      "",
      input.logContent
    ];
    if (input.existingEntries && input.existingEntries.length > 0) {
      const existing = input.existingEntries.map(
        (e) => `${e.surface}\\t${e.code}\\t权重${e.weight ?? 99}`
      ).join("\\n");
      lines.push(
        "",
        "已有的快速字典条目（不要重复建议）：",
        existing
      );
    }
    lines.push(
      "",
      "输出 JSON：",
      '{"suggestions":[{"phrase":"短语","code":"pinyin","weight":90,"reason":"理由"}]}'
    );
    return lines.join("\n");
  },

  parseResponse(json) {
    const suggestions = (Array.isArray(json.suggestions) ? json.suggestions : [])
      .filter((s) => s.phrase && s.code && String(s.phrase).trim().length >= 2)
      .slice(0, 8);
    return { suggestions };
  },

  temperature: 0.2,
  maxTokens: 1200,
  timeoutMs: 60000
});

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

  let existingEntries = [];
  if (options.customPhrasePath) {
    try {
      const parsed = parseCustomPhraseText(
        await readFile(options.customPhrasePath, "utf8")
      );
      existingEntries = parsed.entries.map((e) => ({
        surface: e.surface,
        code: e.code,
        weight: e.weight
      }));
    } catch { /* custom phrase unavailable, proceed without context */ }
  }

  let result;
  try {
    result = await distillTask({ logContent, existingEntries });
  } catch {
    return { suggestions: [], reason: "flash-api-error" };
  }

  if (result.suggestions.length === 0) {
    return { suggestions: [], reason: "no-suggestions" };
  }

  const results = {
    generatedAt: new Date().toISOString(),
    sourceLogChars: logContent.length,
    suggestions: result.suggestions.map((s) => ({
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
