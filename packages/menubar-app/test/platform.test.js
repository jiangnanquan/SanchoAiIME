import test from "node:test";
import assert from "node:assert/strict";

import {
  assertMacPlatform,
  macCustomPhrasePath,
  macRimeDirectory
} from "../src/platform.js";

test("resolves macOS Rime paths under the user Library", () => {
  assert.equal(macRimeDirectory("/Users/example"), "/Users/example/Library/Rime");
  assert.equal(
    macCustomPhrasePath("/Users/example"),
    "/Users/example/Library/Rime/custom_phrase.txt"
  );
});

test("rejects non-macOS platforms for the first menu bar release", () => {
  assert.doesNotThrow(() => assertMacPlatform("darwin"));
  assert.throws(
    () => assertMacPlatform("win32"),
    /currently supports macOS only/
  );
});
