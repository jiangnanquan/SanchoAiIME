import assert from "node:assert/strict";
import test from "node:test";

import {
  createDashboardViewModel,
  createSampleDashboardInput,
  isSensitiveEnvEntry
} from "../src/index.js";

test("creates a dashboard model that separates snippets from executable actions", () => {
  const model = createDashboardViewModel(createSampleDashboardInput());

  const snippet = model.actions.find((action) => action.id === "snippet.qwen");
  const command = model.actions.find((action) => action.id === "command.release-check");

  assert.equal(snippet.category, "snippet");
  assert.equal(snippet.requiresConfirmation, false);
  assert.equal(command.category, "executable");
  assert.equal(command.requiresConfirmation, true);
  assert.equal(model.summary.executableActions, 2);
  assert.equal(model.summary.confirmationActions, 1);
});

test("redacts sensitive profile environment entries", () => {
  assert.equal(isSensitiveEnvEntry("DEEPSEEK_API_KEY", "abc"), true);
  assert.equal(isSensitiveEnvEntry("OPENAI_BASE_URL", "https://api.deepseek.com"), false);

  const model = createDashboardViewModel(createSampleDashboardInput());
  const env = model.profiles[0].env;

  assert.deepEqual(
    env.find((entry) => entry.name === "DEEPSEEK_API_KEY"),
    {
      name: "DEEPSEEK_API_KEY",
      value: "[redacted]",
      redacted: true
    }
  );
  assert.equal(
    env.find((entry) => entry.name === "OPENAI_BASE_URL").value,
    "https://api.deepseek.com"
  );
});

test("omits private lexicon import entries from the dashboard model", () => {
  const model = createDashboardViewModel({
    imports: [
      {
        source: "private.tsv",
        format: "tsv",
        summary: {
          parsedRows: 1,
          acceptedRows: 1,
          rejectedRows: 0,
          duplicateRows: 0,
          importedEntries: 1
        },
        entries: [
          {
            surface: "private project phrase",
            reading: "secret",
            weight: 100
          }
        ]
      }
    ]
  });

  assert.equal(model.imports[0].privateEntriesOmitted, true);
  assert.equal("entries" in model.imports[0], false);
  assert.equal(JSON.stringify(model).includes("private project phrase"), false);
});

test("defaults to the Qwen local predictor model card", () => {
  const model = createDashboardViewModel();

  assert.equal(model.models[0].id, "qwen3.5-0.8b");
  assert.equal(model.models[0].source.license, "Apache-2.0");
});
