import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createImportPreview,
  importLexiconFile,
  parseLexiconText,
  rollbackImport
} from "../src/importer.js";
import { runCli } from "../src/cli.js";

test("previews Rime custom_phrase rows with dedupe and highest weight", () => {
  const preview = createImportPreview({
    format: "rime-custom-phrase",
    sourceId: "custom_phrase.txt",
    text: [
      "# user comments stay outside the import",
      "DuckDB\tduck\t10",
      "DuckDB\tduck\t80",
      "Sancho profile\tsp\t",
      "bad-row",
      ""
    ].join("\n")
  });

  assert.equal(preview.summary.parsedRows, 4);
  assert.equal(preview.summary.acceptedRows, 3);
  assert.equal(preview.summary.rejectedRows, 1);
  assert.equal(preview.summary.duplicateRows, 1);
  assert.deepEqual(preview.entries, [
    {
      surface: "DuckDB",
      reading: "duck",
      weight: 80,
      source: "custom_phrase.txt",
      style_tags: []
    },
    {
      surface: "Sancho profile",
      reading: "sp",
      weight: 100,
      source: "custom_phrase.txt",
      style_tags: []
    }
  ]);
});

test("parses Rime dict.yaml body after metadata marker", () => {
  const parsed = parseLexiconText([
    "# Rime dictionary",
    "name: luna_pinyin.extended",
    "version: \"2026.04\"",
    "...",
    "深度求索\tshen du qiu suo\t500",
    "千问本地预测\tqian wen ben di yu ce\t420",
    ""
  ].join("\n"), {
    format: "rime-dict",
    source: "rime-dict"
  });

  assert.equal(parsed.parsedRows, 2);
  assert.equal(parsed.rejectedRows.length, 0);
  assert.deepEqual(parsed.entries.map((entry) => entry.surface), [
    "深度求索",
    "千问本地预测"
  ]);
});

test("parses TSV headers, style tags, and default weight", () => {
  const parsed = parseLexiconText([
    "surface\treading\tdomain\tstyle_tags",
    "Qwen\tqw\tmodels\tlocal,shortcode",
    ""
  ].join("\n"), {
    format: "tsv",
    source: "tsv-import",
    defaultWeight: 77
  });

  assert.deepEqual(parsed.entries, [
    {
      surface: "Qwen",
      reading: "qw",
      weight: 77,
      source: "tsv-import",
      style_tags: ["local", "shortcode"],
      domain: "models"
    }
  ]);
});

test("parses quoted CSV fields", () => {
  const preview = createImportPreview({
    format: "csv",
    sourceId: "terms.csv",
    text: [
      "phrase,pinyin,weight,tags",
      "\"DeepSeek, V4 Flash\",dsf,600,\"cloud,teacher\"",
      ""
    ].join("\n")
  });

  assert.deepEqual(preview.entries, [
    {
      surface: "DeepSeek, V4 Flash",
      reading: "dsf",
      weight: 600,
      source: "terms.csv",
      style_tags: ["cloud", "teacher"]
    }
  ]);
});

test("imports normalized lexicon and rolls back the previous output", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sancho-lexicon-importer-"));
  const inputPath = join(directory, "custom_phrase.txt");
  const outputPath = join(directory, "data", "lexicons", "import.json");

  try {
    await writeFile(inputPath, "DuckDB\tduck\t10\n", "utf8");
    await mkdir(join(directory, "data", "lexicons"), { recursive: true });
    await writeFile(outputPath, "{\"old\":true}\n", "utf8");

    const result = await importLexiconFile({
      format: "rime-custom-phrase",
      inputPath,
      outputPath,
      sourceId: "fixture"
    });

    const imported = JSON.parse(await readFile(outputPath, "utf8"));
    assert.equal(imported.schema, "sancho.lexicon.import.v1");
    assert.equal(imported.entries[0].surface, "DuckDB");
    assert.equal(result.rollback.restoredExistingFile, true);

    const dryRunRollback = await rollbackImport({
      outputPath,
      rollbackId: result.rollback.rollbackId,
      dryRun: true
    });
    assert.equal(dryRunRollback.dryRun, true);
    assert.equal(JSON.parse(await readFile(outputPath, "utf8")).schema, "sancho.lexicon.import.v1");

    await rollbackImport({
      outputPath,
      rollbackId: result.rollback.rollbackId
    });
    assert.deepEqual(JSON.parse(await readFile(outputPath, "utf8")), { old: true });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("CLI preview prints JSON summary and entries", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sancho-lexicon-importer-cli-"));
  const inputPath = join(directory, "phrases.tsv");
  let stdout = "";

  try {
    await writeFile(inputPath, "surface\treading\tweight\nSancho\tsa\t90\n", "utf8");
    const code = await runCli([
      "preview",
      "--format",
      "tsv",
      "--input",
      inputPath,
      "--source",
      "cli-fixture"
    ], {
      stdout: { write: (chunk) => { stdout += chunk; } }
    });

    assert.equal(code, 0);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.summary.importedEntries, 1);
    assert.equal(parsed.entries[0].source, "cli-fixture");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
