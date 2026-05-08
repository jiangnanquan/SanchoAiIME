import { createFlashTask, parseFlashJson } from "@sancho-ai-ime/cloud-teacher";

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

const suggestSkinTask = createFlashTask({
  system: SYSTEM_PROMPT,

  buildPrompt(input) {
    return JSON.stringify({
      request: input.prompt,
      currentSkin: input.currentSettings?.customSkin,
      currentLayout: {
        colorScheme: input.currentSettings?.colorScheme,
        candidateLayout: input.currentSettings?.candidateLayout,
        textOrientation: input.currentSettings?.textOrientation,
        fontPoint: input.currentSettings?.fontPoint,
        cornerRadius: input.currentSettings?.cornerRadius
      }
    });
  },

  parseResponse: parseSkinFromJson,

  temperature: 0.35,
  maxTokens: 700,
  timeoutMs: 45000
});

export async function suggestRimeSkin(input = {}, options = {}) {
  const prompt = cleanPrompt(input.prompt);
  const settings = normalizeRimeSettings(input.currentSettings ?? {});

  if (options.callChat) {
    const response = await options.callChat(
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
        budget: { maxInputChars: 5000, maxOutputTokens: 900 },
        timeoutMs: options.timeoutMs ?? 45000,
        env: options.env,
        platform: options.platform,
          execFile: options.execFile,
          fetchImpl: options.fetchImpl
        }
      );
      const json = parseFlashJson(response.outputText);
      const parsed = parseSkinFromJson(json);
      return {
        ...parsed,
        provider: response.provider ?? "deepseek",
        model: response.model ?? "deepseek-v4-flash",
        usage: response.usage ?? null
      };
    }

  const result = await suggestSkinTask({ prompt, currentSettings: settings }, {
    timeoutMs: options.timeoutMs,
    env: options.env,
    platform: options.platform,
    execFile: options.execFile,
    fetchImpl: options.fetchImpl,
    budget: { maxInputChars: 5000, maxOutputTokens: 900 }
  });

  const { _meta, ...parsed } = result;
  return {
    ...parsed,
    provider: "deepseek",
    model: _meta?.model ?? "deepseek-v4-flash",
    usage: _meta?.usage ?? null
  };
}

function parseSkinFromJson(json) {
  const skin = normalizeRimeSettings({
    customSkin: {
      ...DEFAULT_CUSTOM_SKIN,
      ...(json.skin ?? json)
    }
  }).customSkin;
  return {
    name: cleanName(json.name ?? skin.name),
    description: cleanDescription(json.description),
    skin: {
      ...skin,
      name: cleanName(json.skin?.name ?? json.name ?? skin.name)
    }
  };
}

export function parseSkinSuggestion(outputText) {
  const json = parseFlashJson(outputText);
  return parseSkinFromJson(json);
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
