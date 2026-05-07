import { createReadStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createGunzip } from "node:zlib";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = resolve(SCRIPT_DIR, "..");
const OUTPUT_PATH = resolve(
  PROJECT_DIR,
  "packages",
  "menubar-app",
  "src",
  "en-word-list.json"
);

const DICT_SOURCES = [
  { name: "python", files: ["@cspell/dict-python/dict/python.txt", "@cspell/dict-python/dict/python-common.txt"] },
  { name: "typescript", files: ["@cspell/dict-typescript/dict/typescript.txt"] },
  { name: "node", files: ["@cspell/dict-node/dict/node.txt"] },
  { name: "npm", files: ["@cspell/dict-npm/dict/npm.txt"] },
  { name: "sql", files: ["@cspell/dict-sql/sql.txt.gz"], gzip: true },
  { name: "software-terms", files: [
    "@cspell/dict-software-terms/dict/software-terms-alternative.txt",
    "@cspell/dict-software-terms/dict/networkingTerms.txt",
    "@cspell/dict-software-terms/dict/webServices.txt",
    "@cspell/dict-software-terms/dict/coding-compound-terms.txt",
    "@cspell/dict-software-terms/dict/software-tools.txt",
    "@cspell/dict-software-terms/dict/computing-acronyms.txt"
  ] },
  { name: "fullstack", files: ["@cspell/dict-fullstack/dict/fullstack.txt"] },
  { name: "git", files: ["@cspell/dict-git/dict/git-terms.txt"] }
];

function filterWord(word) {
  const len = word.length;
  if (len < 2 || len > 30) return false;
  if (!/^[a-z]/.test(word)) return false;
  if (/\d/.test(word)) return false;
  if (/[^a-z.'-]/.test(word)) return false;
  return true;
}

async function readLines(filePath) {
  const content = await readFile(filePath, "utf8");
  return content
    .split(/\r?\n/)
    .map((line) => {
      const commentIndex = line.indexOf("#");
      return commentIndex === -1 ? line.trim() : line.slice(0, commentIndex).trim();
    })
    .filter((line) => line.length > 0);
}

async function readGzipLines(filePath) {
  return await new Promise((resolve, reject) => {
    const chunks = [];
    createReadStream(filePath)
      .pipe(createGunzip())
      .on("data", (chunk) => chunks.push(chunk))
      .on("error", reject)
      .on("end", () => {
        const content = Buffer.concat(chunks).toString("utf8");
        const lines = content
          .split(/\r?\n/)
          .map((line) => {
            const commentIndex = line.indexOf("#");
            return commentIndex === -1 ? line.trim() : line.slice(0, commentIndex).trim();
          })
          .filter((line) => line.length > 0);
        resolve(lines);
      });
  });
}

async function main() {
  const stats = {};
  const allWords = new Set();

  for (const source of DICT_SOURCES) {
    const sourceWords = new Set();
    for (const file of source.files) {
      const fullPath = resolve(PROJECT_DIR, "node_modules", file);
      const lines = source.gzip
        ? await readGzipLines(fullPath)
        : await readLines(fullPath);
      for (const line of lines) {
        const lower = line.toLowerCase();
        if (filterWord(lower)) {
          sourceWords.add(lower);
          allWords.add(lower);
        }
      }
    }
    stats[source.name] = sourceWords.size;
  }

  const sorted = Array.from(allWords).sort();

  await writeFile(
    OUTPUT_PATH,
    JSON.stringify({ words: sorted, stats }, null, 2) + "\n",
    "utf8"
  );

  const total = sorted.length;
  console.error(`English IT word list built: ${total} words → ${OUTPUT_PATH}`);
  for (const [name, count] of Object.entries(stats)) {
    console.error(`  ${name}: ${count} words`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
