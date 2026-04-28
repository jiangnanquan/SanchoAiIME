import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { renderDashboardHtml } from "./render-html.js";
import { createDashboardViewModel, createSampleDashboardInput } from "./view-model.js";

const HELP = `Usage:
  sancho-dashboard render [--state <path>] [--output <path>]
  sancho-dashboard sample-state [--output <path>]

Render creates a static HTML dashboard from redacted Sancho state. When using
private runtime data, write generated files under ignored storage such as data/.
`;

export async function runCli(argv, streams = {}) {
  const stdout = streams.stdout ?? process.stdout;
  const [command, ...rest] = argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    stdout.write(HELP);
    return 0;
  }

  const options = parseOptions(rest);

  if (command === "render") {
    const input = options.state
      ? JSON.parse(await readFile(options.state, "utf8"))
      : createSampleDashboardInput();
    const html = renderDashboardHtml(createDashboardViewModel(input));
    await writeOrPrint(html, options.output, stdout);
    return 0;
  }

  if (command === "sample-state") {
    const json = `${JSON.stringify(createSampleDashboardInput(), null, 2)}\n`;
    await writeOrPrint(json, options.output, stdout);
    return 0;
  }

  throw new Error(`Unknown command: ${command}\n\n${HELP}`);
}

async function writeOrPrint(content, outputPath, stdout) {
  if (!outputPath) {
    stdout.write(content);
    return;
  }
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, content, "utf8");
  stdout.write(`${outputPath}\n`);
}

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    const name = arg.slice(2);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${name}`);
    }
    options[name] = value;
    index += 1;
  }
  return options;
}
