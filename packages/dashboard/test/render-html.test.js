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
  assert.match(html, /data-tab="input-method"/);
  assert.match(html, /data-input-method-form/);
  assert.match(html, /data-save-rime-settings/);
  assert.match(html, /name="predictorEnabled"/);
  assert.match(html, /name="predictorRunner"/);
  assert.match(html, /data-save-custom-phrases/);
  assert.match(html, /data-custom-phrase-field="candidatePosition"/);
  assert.match(html, /data-preview-code/);
  assert.match(html, /class="dashboard-chrome"/);
  assert.match(html, /用户自定义词|User Custom Phrases/);
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

test("renders a non-executing confirmation dialog for risky actions", () => {
  const html = renderDashboardHtml(createSampleDashboardInput());

  assert.match(html, /<dialog id="action-confirm-dialog"/);
  assert.match(html, /data-action-id="command\.release-check"/);
  assert.match(html, /data-action-kind="run_command"/);
  assert.match(html, /data-action-risk="confirm"/);
  assert.match(html, /sancho-dashboard-action-confirmed/);
  assert.doesNotMatch(html, /window\.confirm/);
});
