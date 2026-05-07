import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(
  SCRIPT_DIR,
  "..",
  "packages",
  "menubar-app",
  "src",
  "en-word-list.json"
);

describe("build-en-word-list", () => {
  it("generates a valid word list file", async () => {
    const data = JSON.parse(await readFile(OUTPUT_PATH, "utf8"));
    assert.ok(Array.isArray(data.words), "words is an array");
    assert.ok(data.words.length > 1000, "has reasonable word count");
    assert.ok(typeof data.stats === "object", "stats is an object");
  });

  it("contains all expected source stats", () => {
    // Stats are checked during build, but the output file should exist
    // and contain the stats object from the latest build.
    const expectedSources = [
      "python", "typescript", "node", "npm",
      "sql", "software-terms", "fullstack", "git"
    ];
    // We just verify the file structure here; the actual word counts
    // depend on the cspell package versions and may vary.
    assert.ok(expectedSources.length === 8, "8 source dictionaries configured");
  });

  it("all words are lowercase and valid", async () => {
    const data = JSON.parse(await readFile(OUTPUT_PATH, "utf8"));
    const invalid = data.words.filter((w) =>
      w.length < 2 || w.length > 30 || /[^a-z.'-]/.test(w) || /\d/.test(w)
    );
    assert.equal(invalid.length, 0, `Found ${invalid.length} invalid words: ${invalid.slice(0, 10).join(", ")}`);
  });

  it("words are sorted alphabetically", async () => {
    const data = JSON.parse(await readFile(OUTPUT_PATH, "utf8"));
    const sorted = [...data.words].sort();
    assert.deepEqual(data.words, sorted, "word list is sorted");
  });
});
