import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { renderDashboardHtml } from "./render-html.js";
import { createDashboardViewModel, createSampleDashboardInput } from "./view-model.js";
import { localeFromEnv } from "./i18n.js";

const HELP_ZH = `用法：
  sancho-dashboard render [--state <path>] [--output <path>] [--locale zh-CN|en-US]
  sancho-dashboard sample-state [--output <path>] [--locale zh-CN|en-US]

render 会把已脱敏的 Sancho 状态渲染成一个静态 HTML 管理面板。真实运行数据请写入
data/ 这类被忽略的本地运行目录。
`;

const HELP_EN = `Usage:
  sancho-dashboard render [--state <path>] [--output <path>] [--locale zh-CN|en-US]
  sancho-dashboard sample-state [--output <path>] [--locale zh-CN|en-US]

Render creates a static HTML dashboard from redacted Sancho state. When using
private runtime data, write generated files under ignored storage such as data/.
`;

export async function runCli(argv, streams = {}) {
  const stdout = streams.stdout ?? process.stdout;
  const locale = streams.locale ?? localeFromEnv(streams.env);
  const [command, ...rest] = argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    stdout.write(helpText(locale));
    return 0;
  }

  const options = parseOptions(rest);
  const outputLocale = options.locale ?? locale;

  if (command === "render") {
    const input = options.state
      ? JSON.parse(await readFile(options.state, "utf8"))
      : createSampleDashboardInput({ locale: outputLocale });
    const html = renderDashboardHtml(
      createDashboardViewModel(input, { locale: outputLocale }),
      { locale: outputLocale }
    );
    await writeOrPrint(html, options.output, stdout);
    return 0;
  }

  if (command === "sample-state") {
    const json = `${JSON.stringify(createSampleDashboardInput({ locale: outputLocale }), null, 2)}\n`;
    await writeOrPrint(json, options.output, stdout);
    return 0;
  }

  throw new Error(`Unknown command: ${command}\n\n${helpText(locale)}`);
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

function helpText(locale) {
  return locale === "en-US" ? HELP_EN : HELP_ZH;
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
