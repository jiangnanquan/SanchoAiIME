import { callDeepSeekChat } from "./deepseek.js";

export function parseFlashJson(text, fallback = undefined) {
  if (!text || typeof text !== "string") {
    if (fallback !== undefined) return fallback;
    throw new Error("Empty response from DeepSeek Flash.");
  }

  try {
    return JSON.parse(text);
  } catch {
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) {
      try {
        return JSON.parse(fence[1]);
      } catch { /* fall through */ }
    }
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    if (fallback !== undefined) return fallback;
    throw new Error(`Failed to parse Flash JSON response: ${text.slice(0, 200)}`);
  }
}

export function createFlashTask(options) {
  const system = String(options.system ?? "").trim();
  if (!system) throw new Error("Flash task requires a system prompt.");

  const temperature = Number(options.temperature ?? 0.2);
  const maxTokens = Number.isSafeInteger(options.maxTokens) && options.maxTokens > 0
    ? options.maxTokens
    : 600;
  const timeoutMs = Number.isSafeInteger(options.timeoutMs) && options.timeoutMs > 0
    ? options.timeoutMs
    : 30000;

  return async (input, callOptions = {}) => {
    const userMessage = typeof options.buildPrompt === "function"
      ? options.buildPrompt(input)
      : String(input ?? "");

    const result = await callDeepSeekChat(
      {
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMessage }
        ],
        ...(temperature === undefined ? {} : { temperature }),
        ...(maxTokens === undefined ? {} : { maxTokens })
      },
      {
        allowNetwork: callOptions.allowNetwork ?? true,
        timeoutMs: callOptions.timeoutMs ?? timeoutMs,
        fetchImpl: callOptions.fetchImpl,
        auditLogPath: callOptions.auditLogPath,
        budget: callOptions.budget,
        env: callOptions.env
      }
    );

    let parsed;
    if (options.parseResponse) {
      const json = parseFlashJson(result.outputText);
      parsed = options.parseResponse(json, input);
    } else {
      parsed = parseFlashJson(result.outputText);
    }

    return {
      ...parsed,
      _meta: {
        model: result.model,
        usage: result.usage,
        responseId: result.responseId,
        finishReason: result.finishReason
      }
    };
  };
}
