import { homedir } from "node:os";
import { join } from "node:path";

export function assertMacPlatform(platform = process.platform) {
  if (platform !== "darwin") {
    throw new Error("SanchoAiIME menu bar app currently supports macOS only.");
  }
}

export function macRimeDirectory(home = homedir()) {
  return join(home, "Library", "Rime");
}

export function macCustomPhrasePath(home = homedir()) {
  return join(macRimeDirectory(home), "custom_phrase.txt");
}
