import { callDeepSeekChat } from "@sancho-ai-ime/cloud-teacher";

const MIN_CHARS_FOR_CHECK = 30;

export async function checkTypos(options = {}) {
  const text = options.text;
  if (!text || text.length < MIN_CHARS_FOR_CHECK) {
    return { corrections: [] };
  }

  const response = await callDeepSeekChat({
    message: buildTypoCheckPrompt(text),
    system: buildTypoCheckSystem(),
    temperature: 0.1,
    maxTokens: 600,
    allowNetwork: true,
    timeoutMs: 30000
  });

  return parseTypoCorrections(response.content, text);
}

function buildTypoCheckSystem() {
  return [
    "你是中文错别字检测器。只输出 JSON，不要解释。",
    "",
    "规则：",
    "1. 只标记明显语义不通的同音错字、语境冲突字",
    "2. 不确定的不要标记（宁可漏报不要误报）",
    "3. 人名、地名、技术术语、英文不标记",
    "4. 明显的拼音输入同音错误（在→再、的→得、码→吗、超时→超市）优先",
    "5. 最多标记 5 处"
  ].join("\n");
}

function buildTypoCheckPrompt(text) {
  return [
    "检查以下文本中的疑似错别字：",
    "",
    text,
    "",
    "输出 JSON：",
    '{"corrections":[{"original":"原文","suggested":"建议","reason":"理由"}]}',
    "如果没有发现错别字，输出 {\"corrections\":[]}"
  ].join("\n");
}

function parseTypoCorrections(raw, originalText) {
  try {
    const json = JSON.parse(raw);
    if (Array.isArray(json.corrections)) {
      return {
        corrections: json.corrections
          .filter((c) =>
            c.original && c.suggested &&
            c.original !== c.suggested &&
            originalText.includes(c.original)
          )
          .slice(0, 5)
      };
    }
  } catch {
    const match = String(raw).match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const json = JSON.parse(match[0]);
        if (Array.isArray(json.corrections)) {
          return {
            corrections: json.corrections
              .filter((c) => c.original && c.suggested)
              .slice(0, 5)
          };
        }
      } catch { /* fall through */ }
    }
  }
  return { corrections: [] };
}
