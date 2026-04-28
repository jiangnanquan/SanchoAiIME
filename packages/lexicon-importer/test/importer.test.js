import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createImportPreview,
  importExternalLexiconFile,
  importLexiconFile,
  parseLexiconText,
  previewExternalLexiconFile,
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

test("parses macOS Text Replacements XML plist exports", () => {
  const preview = createImportPreview({
    format: "macos-text-replacements",
    sourceId: "Text Substitutions.plist",
    text: [
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
      "<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">",
      "<plist version=\"1.0\">",
      "<array>",
      "  <dict>",
      "    <key>shortcut</key>",
      "    <string>dsf</string>",
      "    <key>phrase</key>",
      "    <string>DeepSeek &amp; Qwen</string>",
      "  </dict>",
      "  <dict>",
      "    <key>shortcut</key>",
      "    <string>bad</string>",
      "  </dict>",
      "</array>",
      "</plist>"
    ].join("\n")
  });

  assert.equal(preview.summary.parsedRows, 2);
  assert.equal(preview.summary.acceptedRows, 1);
  assert.equal(preview.summary.rejectedRows, 1);
  assert.deepEqual(preview.entries, [
    {
      surface: "DeepSeek & Qwen",
      reading: "dsf",
      weight: 100,
      source: "Text Substitutions.plist",
      style_tags: ["macos-text-replacement"]
    }
  ]);
  assert.match(preview.rejectedRows[0].reason, /phrase/);
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

test("CLI previews macOS Text Replacements without requiring an external converter", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sancho-lexicon-importer-macos-cli-"));
  const inputPath = join(directory, "Text Substitutions.plist");
  let stdout = "";

  try {
    await writeFile(inputPath, [
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
      "<plist version=\"1.0\">",
      "<array>",
      "  <dict>",
      "    <key>phrase</key><string>Sancho profile</string>",
      "    <key>shortcut</key><string>sp</string>",
      "  </dict>",
      "</array>",
      "</plist>"
    ].join("\n"), "utf8");

    const code = await runCli([
      "preview",
      "--format",
      "macos-text-replacements",
      "--input",
      inputPath,
      "--source",
      "macos-fixture"
    ], {
      stdout: { write: (chunk) => { stdout += chunk; } }
    });

    assert.equal(code, 0);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.summary.importedEntries, 1);
    assert.equal(parsed.entries[0].source, "macos-fixture");
    assert.deepEqual(parsed.entries[0].style_tags, ["macos-text-replacement"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("external imewlconverter preview imports converted stdout without shell execution", async () => {
  const calls = [];
  const preview = await previewExternalLexiconFile({
    adapter: "imewlconverter",
    sourceFormat: "sogou-scel",
    convertedFormat: "tsv",
    inputPath: "/tmp/private.scel",
    toolPath: "imewlconverter",
    adapterArgs: ["--input", "{input}", "--stdout"],
    execFileImpl: async (file, args, options) => {
      calls.push({ file, args, options });
      return {
        stdout: "surface\treading\tweight\n搜狗词库\tsg ck\t300\n",
        stderr: ""
      };
    }
  });

  assert.deepEqual(calls, [
    {
      file: "imewlconverter",
      args: ["--input", "/tmp/private.scel", "--stdout"],
      options: {
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
        shell: false
      }
    }
  ]);
  assert.equal(preview.adapter.adapter, "imewlconverter");
  assert.equal(preview.adapter.sourceFormat, "sogou-scel");
  assert.equal(preview.format, "tsv");
  assert.equal(preview.summary.importedEntries, 1);
  assert.equal(preview.entries[0].source, "private.scel");
});

test("external adapter import writes normalized output with rollback snapshot", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sancho-lexicon-external-"));
  const inputPath = join(directory, "qq-export.txt");
  const outputPath = join(directory, "data", "lexicons", "qq-import.json");

  try {
    await writeFile(inputPath, "external fixture stays private\n", "utf8");
    const result = await importExternalLexiconFile({
      adapter: "imewlconverter",
      sourceFormat: "qq-pinyin",
      convertedFormat: "tsv",
      inputPath,
      outputPath,
      toolPath: "mock-imewlconverter",
      adapterArgs: ["{input}"],
      execFileImpl: async () => ({
        stdout: "surface\treading\tweight\nQQ短语\tqq dy\t210\n",
        stderr: ""
      })
    });

    assert.equal(result.preview.adapter.sourceFormat, "qq-pinyin");
    assert.equal(result.rollback.restoredExistingFile, false);
    const imported = JSON.parse(await readFile(outputPath, "utf8"));
    assert.equal(imported.source, "qq-export.txt");
    assert.equal(imported.adapter.adapter, "imewlconverter");
    assert.equal(imported.entries[0].surface, "QQ短语");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("external adapter rejects undeclared popular IME source formats", async () => {
  await assert.rejects(
    previewExternalLexiconFile({
      adapter: "imewlconverter",
      sourceFormat: "unknown-binary",
      convertedFormat: "tsv",
      inputPath: "/tmp/private.bin",
      adapterArgs: ["{input}"],
      execFileImpl: async () => ({ stdout: "", stderr: "" })
    }),
    /Unsupported source format for imewlconverter: unknown-binary/
  );
});

test("CLI external-preview accepts adapter args after separator", async () => {
  let stdout = "";
  const code = await runCli([
    "external-preview",
    "--adapter",
    "imewlconverter",
    "--source-format",
    "baidu-ime",
    "--converted-format",
    "tsv",
    "--input",
    "/tmp/baidu-user.dat",
    "--tool",
    "mock-imewlconverter",
    "--",
    "--from",
    "{input}"
  ], {
    stdout: { write: (chunk) => { stdout += chunk; } },
    execFileImpl: async () => ({
      stdout: "surface\treading\tweight\n百度短语\tbd dy\t180\n",
      stderr: ""
    })
  });

  assert.equal(code, 0);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.adapter.sourceFormat, "baidu-ime");
  assert.equal(parsed.entries[0].surface, "百度短语");
});
