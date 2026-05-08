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

test("includes input method settings in the dashboard model", () => {
  const model = createDashboardViewModel({
    inputMethodSettings: {
      outputScript: "traditional",
      colorScheme: "sancho_graphite",
      candidateLayout: "linear",
      textOrientation: "horizontal",
      pageSize: 7,
      inlinePreedit: false
    }
  });

  assert.equal(model.navigation.some((item) => item.id === "input-method"), true);
  assert.equal(model.inputMethodSettings.outputScript, "traditional");
  assert.equal(model.inputMethodSettings.colorScheme, "sancho_graphite");
  assert.equal(model.inputMethodSettings.pageSize, 7);
  assert.equal(model.inputMethodSettings.inlinePreedit, false);
  assert.equal(model.inputMethodSettings.customSkin.backColor, "#F7FAFC");
  assert.equal(model.inputMethodSettings.aiSkinAssistant.model, "deepseek-v4-flash");
  assert.equal(model.inputMethodSettings.predictor.enabled, false);
  assert.equal(model.inputMethodSettings.predictor.status, "unknown");
});

test("includes user custom phrases in the dashboard model", () => {
  const model = createDashboardViewModel({
    quickDictionary: {
      customEntries: [
        {
          surface: "静夜思\\n\\s\\s李白",
          preview: "静夜思\n  李白",
          code: "jys",
          weight: 50,
          lineNumber: 2,
          candidatePosition: 2
        }
      ],
      entries: [
        { surface: "Qwen 本地预测", code: "qwp", weight: 90 }
      ],
      customSummary: {
        entryCount: 2,
        userEntryCount: 1,
        managedEntryCount: 1,
        invalidRowCount: 0,
        commentRowCount: 1,
        blankRowCount: 0
      }
    }
  });

  assert.equal(model.quickDictionary.customEntries[0].preview, "静夜思\n  李白");
  assert.equal(model.quickDictionary.customEntries[0].candidatePosition, 2);
  assert.equal(model.quickDictionary.customSummary.userEntryCount, 1);
  assert.equal(model.summary.quickDictionaryEntries, 2);
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

test("redacts sensitive action command arguments from the dashboard model", () => {
  const secret = ["sk", "1234567890abcdefghijklmnop"].join("-");
  const model = createDashboardViewModel({
    actions: [
      {
        id: "command.secret",
        code: "sec",
        label: "Secret command",
        kind: "run_command",
        command: "tool",
        args: ["--api-key", secret],
        risk: "confirm"
      }
    ]
  });

  assert.deepEqual(model.actions[0].target.args, ["--api-key", "[redacted]"]);
  assert.equal(JSON.stringify(model).includes(secret), false);
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

  assert.equal(model.models[0].id, "ministral-3-3b");
  assert.equal(model.models[0].source.license, "Apache-2.0");
});
