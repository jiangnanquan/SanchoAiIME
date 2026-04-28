import assert from "node:assert/strict";
import test from "node:test";

import {
  createSampleDashboardInput,
  renderDashboardHtml,
  safeJsonForHtml
} from "../src/index.js";

test("renders escaped static dashboard HTML", () => {
  const html = renderDashboardHtml({
    title: "Sancho <Dashboard>",
    quickDictionary: [
      {
        surface: "<script>alert(1)</script>",
        code: "xss",
        weight: 1
      }
    ]
  });

  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<td><script>/);
  assert.match(html, /data-tab="actions"/);
});

test("embeds only redacted safe dashboard JSON", () => {
  const html = renderDashboardHtml(createSampleDashboardInput());

  assert.equal(html.includes("sample-secret-value-that-will-be-redacted"), false);
  assert.match(html, /DEEPSEEK_API_KEY/);
  assert.match(html, /\[redacted\]/);
});

test("escapes JSON for script embedding", () => {
  const json = safeJsonForHtml({ value: "</script><script>alert(1)</script>" });

  assert.equal(json.includes("</script>"), false);
  assert.match(json, /\\u003c\/script\\u003e/);
});
