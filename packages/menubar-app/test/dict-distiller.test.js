import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildQuickDictionaryEntries,
  readSuggestions
} from "../src/dict-distiller.js";

test("reads empty suggestions when file does not exist", async () => {
  const result = await readSuggestions("/tmp/no-such-file.json");
  assert.deepEqual(result, { suggestions: [], generatedAt: null });
});

test("reads existing suggestions file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sancho-distiller-"));
  const path = join(directory, "suggestions.json");

  try {
    await writeFile(path, JSON.stringify({
      generatedAt: "2026-01-01T00:00:00Z",
      suggestions: [{ phrase: "微服务", code: "wfw", weight: 90, reason: "高频" }]
    }));

    const result = await readSuggestions(path);
    assert.equal(result.suggestions.length, 1);
    assert.equal(result.suggestions[0].phrase, "微服务");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("builds quick dictionary entries from suggestions", () => {
  const entries = buildQuickDictionaryEntries([
    { phrase: "微服务", code: "wfw", weight: 90 },
    { phrase: "", code: "x", weight: 90 },
    { phrase: "K8s", code: "", weight: 80 }
  ]);

  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0], { surface: "微服务", code: "wfw", weight: 90 });
});
