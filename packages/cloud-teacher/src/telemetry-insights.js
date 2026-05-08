import { createFlashTask } from "./flash-tasks.js";

const MIN_EVENTS = 20;

const insightsTask = createFlashTask({
  system: [
    "你是中文输入法数据分析师。基于用户的输入埋点数据，给出有价值的个性化建议。只输出 JSON，不要解释。",
    "",
    "分析维度：",
    "1. 输入效率：top1Rate（首候选采纳率）、backspaceRate（退格率）、字符/预测比",
    "2. 模型效果：各 runner 的命中率对比（lexicon vs ollama vs deepseek-flash）",
    "3. 编码习惯：平均编码长度、简拼/全拼偏好、混输比例",
    "4. 快捷方式：哪些高频短语还没有短码",
    "5. 异常发现：退格率异常高、首候选采纳率下降趋势",
    "",
    "JSON 输出格式：",
    '{',
    '  "efficiency": {"top1Rate":0.72,"backspaceRate":0.05,"assessment":"good|fair|poor"},',
    '  "modelEffectiveness": {"bestRunner":"lexicon","runnerComparison":[{"runner":"lexicon","hitRate":0.8,"recommendation":"keep"}]},',
    '  "codingStyle": {"avgCodeLen":3.2,"prefersShortCode":true,"mixedInputRatio":0.15},',
    '  "shortcutSuggestions": [{"phrase":"短语","suggestedCode":"pinyin","frequency":15,"reason":"高频无短码"}],',
    '  "anomalies": [{"type":"退格率偏高","detail":"Code 应用中退格率 12%，全应用均值 5%"}],',
    '  "summary": "一句话总结"',
    '}',
    "",
    "约束：",
    "- 建议必须基于实际数据，不要编造",
    "- shortcutSuggestions 最多 5 条",
    "- anomalies 最多 3 条",
    "- 数据不足时 assessment 用 unknown"
  ].join("\n"),

  buildPrompt(aggregation) {
    return [
      "以下用户输入行为统计：",
      "",
      JSON.stringify(aggregation, null, 2),
      "",
      "请分析并输出 JSON："
    ].join("\n");
  },

  parseResponse(json) {
    return {
      efficiency: json.efficiency ?? {},
      modelEffectiveness: json.modelEffectiveness ?? {},
      codingStyle: json.codingStyle ?? {},
      shortcutSuggestions: (Array.isArray(json.shortcutSuggestions)
        ? json.shortcutSuggestions : []).slice(0, 5),
      anomalies: (Array.isArray(json.anomalies)
        ? json.anomalies : []).slice(0, 3),
      summary: json.summary ?? ""
    };
  },

  temperature: 0.2,
  maxTokens: 1500,
  timeoutMs: 45000
});

export function aggregateTelemetry(events = []) {
  if (!Array.isArray(events) || events.length === 0) {
    return { eventCount: 0, insufficient: true };
  }

  const preds = events.filter((e) => e.type === "pred");
  const commits = events.filter((e) => e.type === "commit");
  const sessions = events.filter((e) => e.type === "session");

  const top1Count = commits.filter((c) => c.pickPos === 1).length;
  const top1Rate = commits.length > 0 ? top1Count / commits.length : null;

  const backspaceRatio = sessions.length > 0
    ? sessions.reduce((sum, s) => sum + (s.backspaces ?? 0), 0)
      / Math.max(1, sessions.reduce((sum, s) => sum + (s.keystrokes ?? 0), 0))
    : null;

  const byApp = new Map();
  for (const s of sessions) {
    const app = s.app || "unknown";
    const prev = byApp.get(app) || { chars: 0, keystrokes: 0, backspaces: 0 };
    byApp.set(app, {
      chars: prev.chars + (s.chars ?? 0),
      keystrokes: prev.keystrokes + (s.keystrokes ?? 0),
      backspaces: prev.backspaces + (s.backspaces ?? 0)
    });
  }
  const appBreakdown = Array.from(byApp.entries()).map(([app, stats]) => ({
    app,
    ...stats
  }));

  const byRunner = new Map();
  for (const p of preds) {
    const runner = p.runner || "lexicon";
    const prev = byRunner.get(runner) || { calls: 0, cacheHits: 0 };
    byRunner.set(runner, {
      calls: prev.calls + 1,
      cacheHits: prev.cacheHits + (p.cacheHit ? 1 : 0)
    });
  }
  const runnerStats = Array.from(byRunner.entries()).map(([runner, stats]) => ({
    runner,
    ...stats
  }));

  const codeLens = preds.map((p) => p.codeLen ?? 0).filter((l) => l > 0);
  const avgCodeLen = codeLens.length > 0
    ? codeLens.reduce((sum, l) => sum + l, 0) / codeLens.length
    : null;

  return {
    eventCount: events.length,
    predCount: preds.length,
    commitCount: commits.length,
    sessionCount: sessions.length,
    insufficient: events.length < MIN_EVENTS,
    efficiency: { top1Rate, backspaceRatio },
    byRunner: runnerStats,
    byApp: appBreakdown,
    avgCodeLen,
    topPhrases: topPhrases(commits, 20)
  };
}

export async function analyzeTelemetry(events = [], options = {}) {
  const aggregation = aggregateTelemetry(events);
  if (aggregation.insufficient) {
    return {
      ...aggregation,
      insights: null,
      reason: `需要至少 ${MIN_EVENTS} 条事件，当前 ${aggregation.eventCount} 条`
    };
  }

  let insights;
  try {
    insights = await insightsTask(aggregation, {
      timeoutMs: options.timeoutMs,
      env: options.env,
      fetchImpl: options.fetchImpl
    });
  } catch {
    return {
      ...aggregation,
      insights: null,
      reason: "flash-api-error"
    };
  }

  const { _meta, ...result } = insights;
  return {
    ...aggregation,
    insights: result,
    _meta
  };
}

function topPhrases(commits, limit) {
  const counts = new Map();
  for (const c of commits) {
    const text = String(c.text ?? "").trim();
    if (text.length < 2) continue;
    counts.set(text, (counts.get(text) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([text, count]) => ({ text, count }));
}
