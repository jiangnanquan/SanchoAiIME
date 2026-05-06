import { callDeepSeekChat } from "@sancho-ai-ime/cloud-teacher";

import {
  DEFAULT_CUSTOM_SKIN,
  normalizeRimeSettings
} from "./rime-settings.js";

const SYSTEM_PROMPT = `你是 SanchoAiIME 的输入法皮肤设计助手。
只返回 JSON，不要 Markdown，不要解释。
JSON 格式：
{
  "name": "不超过 40 个字符的英文或中文皮肤名",
  "description": "一句中文说明",
  "skin": {
    "name": "皮肤名",
    "backColor": "#RRGGBB",
    "borderColor": "#RRGGBB",
    "textColor": "#RRGGBB",
    "candidateTextColor": "#RRGGBB",
    "commentTextColor": "#RRGGBB",
    "labelColor": "#RRGGBB",
    "highlightedBackColor": "#RRGGBB",
    "highlightedTextColor": "#RRGGBB",
    "highlightedLabelColor": "#RRGGBB",
    "highlightedCommentColor": "#RRGGBB"
  }
}
设计约束：
- 输入法候选窗必须克制、易读、低干扰。
- 高亮项必须有足够对比度。
- 不要使用大面积高饱和紫色、棕橙色或单一蓝紫渐变。
- 所有颜色必须是 6 位十六进制 CSS 颜色。`;

export async function suggestRimeSkin(input = {}, options = {}) {
  const prompt = cleanPrompt(input.prompt);
  const settings = normalizeRimeSettings(input.currentSettings ?? {});
  const callChat = options.callChat ?? callDeepSeekChat;
  const result = await callChat(
    {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            request: prompt,
            currentSkin: settings.customSkin,
            currentLayout: {
              colorScheme: settings.colorScheme,
              candidateLayout: settings.candidateLayout,
              textOrientation: settings.textOrientation,
              fontPoint: settings.fontPoint,
              cornerRadius: settings.cornerRadius
            }
          })
        }
      ],
      temperature: 0.35,
      maxTokens: 700
    },
    {
      allowNetwork: true,
      budget: {
        maxInputChars: 5000,
        maxOutputTokens: 900
      },
      timeoutMs: options.timeoutMs ?? 45000,
      env: options.env,
      platform: options.platform,
      execFile: options.execFile,
      fetchImpl: options.fetchImpl
    }
  );
  const parsed = parseSkinSuggestion(result.outputText);
  return {
    ...parsed,
    provider: result.provider,
    model: result.model,
    usage: result.usage ?? null
  };
}

export function parseSkinSuggestion(outputText) {
  const parsed = JSON.parse(extractJsonObject(outputText));
  const skin = normalizeRimeSettings({
    customSkin: {
      ...DEFAULT_CUSTOM_SKIN,
      ...(parsed.skin ?? parsed)
    }
  }).customSkin;
  return {
    name: cleanName(parsed.name ?? skin.name),
    description: cleanDescription(parsed.description),
    skin: {
      ...skin,
      name: cleanName(parsed.skin?.name ?? parsed.name ?? skin.name)
    }
  };
}

function cleanPrompt(value) {
  const prompt = String(value ?? "").trim();
  if (!prompt) {
    throw new Error("请输入你想要的皮肤风格。");
  }
  if (prompt.length > 1200) {
    throw new Error("皮肤描述太长，请控制在 1200 字以内。");
  }
  return prompt;
}

function cleanName(value) {
  const name = String(value ?? "Sancho AI Skin").trim().replace(/[\r\n\t]/g, " ");
  return (name || "Sancho AI Skin").slice(0, 40);
}

function cleanDescription(value) {
  return String(value ?? "").trim().replace(/[\r\n\t]+/g, " ").slice(0, 160);
}

function extractJsonObject(text) {
  const raw = String(text ?? "").trim();
  if (raw.startsWith("{") && raw.endsWith("}")) {
    return raw;
  }
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("Flash 没有返回可解析的皮肤 JSON。");
  }
  return raw.slice(start, end + 1);
}
