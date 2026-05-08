# SanchoAiIME

> AI 原生的个人输入系统：用本地小模型保证跟手感，用大模型离线理解你，再把理解编译回输入体验。

SanchoAiIME 不是一个"大而全"的传统拼音方案，也不是在万象这类复杂方案外面再套一层 AI。它的目标是做一个极小、可控、可进化的输入层：打字主链路保持零网络依赖和低延迟，个人记忆、词库导入、AI 命令、环境 profile 切换都由后端异步管理。

---

> An AI-native personal input system: use a small local model for real-time feel, a large model for offline understanding, and compile that understanding back into the input experience.

---

## 快速开始 / Quick Start

下载 [最新 DMG](https://github.com/jiangnanquan/SanchoAiIME/releases/latest)，拖入 Applications，启动。
首次打开：右键 → 打开（ad-hoc 签名需绕过 Gatekeeper）。

Download the [latest DMG](https://github.com/jiangnanquan/SanchoAiIME/releases/latest), drag to Applications, launch.
First launch: right-click → Open (ad-hoc signing requires Gatekeeper bypass).

启动后菜单栏出现圆角矩形 logo，按顺序执行：

1. **设置输入法** → 自动同步 Rime 快速字典，打开系统输入法设置
2. 添加/切换到 **鼠须管 / Squirrel** → 鼠须管菜单执行 **重新部署**
3. 菜单栏打开 **输入法外观与行为** → 设置字体、候选数量、配色、英文标点等
4. （可选）配置 **DeepSeek API Key** → 可使用 Flash 皮肤助手
5. （可选）**下载本地小模型** → 一键下载 Qwen2.5-0.5B GGUF（约 398MB，Ollama 推理）

---

## v0.2.0 功能 / Features

| 功能 Feature | 说明 Description |
|---|---|
| macOS 菜单栏 App | Electron 封装，开机启动，默认简体中文 |
| Dashboard 控制台 | 管理候选预测、快速字典、动作、profile、模型、词库导入 |
| AI 候选预测 | Rime Lua 过滤器 → 本地预测服务(127.0.0.1:18840) → 候选重排 |
| 英文 IT 词组联想 | 16k+ 编程词汇（SQL/Python/JS/Node/npm/Git），前缀自动补全 |
| English word prediction | 16k+ IT words (SQL/Python/JS/Node/npm/Git), prefix autocomplete |
| 英文标点 | 一键切换中文模式下输出英文标点 ( . , ? ! ) |
| English punctuation | Toggle to use English punctuation in Chinese mode |
| 中英混输 | 中文模式下直接输入英文，联想候选栏同时出现 EN 词和中文短语 |
| Mixed input | Type English directly in Chinese mode, get both EN and CN candidates |
| 本地小模型 / Local model | 一键下载 Qwen2.5-0.5B GGUF（Ollama），SHA256 校验 |
| DeepSeek Flash 预测 | 可选云端候选重排和下一词预测（需 Key） |
| DeepSeek Flash cloud prediction | Optional cloud candidate reranking and next-word prediction (needs Key) |
| Rime 皮肤 / Skin | 4 套预设 + 自定义编辑器 + DeepSeek Flash AI 生成 |
| 快速字典 | marker 托管区同步 `custom_phrase.txt`，不覆盖用户手写 |
| i18n | 简体中文（默认）/ English (via `SANCHO_LOCALE=en-US`) |
| 词库导入 / Import | 搜狗/QQ 拼音/百度/Rime/macOS 等格式 + Flash AI 分析 |
| 发布工具链 / Release | release gate、SBOM、npm tarball、DMG + ZIP 打包 |

## 构建 / Build

```sh
npm test                         # 124 tests
npm run release:check            # release gate
npm run release:sbom             # SBOM generation
npm run menubar:package:mac      # DMG packaging
open dist/menubar-app/SanchoAiIME-arm64-v*.dmg
```

产物 / Artifacts：

```text
dist/menubar-app/mac-arm64/SanchoAiIME.app
dist/menubar-app/SanchoAiIME-arm64-v*.dmg    (124MB)
```

## 包含的包 / Packages

| 包 / Package | 描述 / Description |
|---|---|
| `packages/menubar-app` | macOS Electron 菜单栏 App |
| `packages/dashboard` | 静态 HTML 管理面板 / Static HTML management panel |
| `packages/quick-dictionary` | Rime `custom_phrase.txt` 读写 / read-write |
| `packages/model-orchestrator` | GGUF 模型下载/校验/benchmark |
| `packages/cloud-teacher` | DeepSeek V4 Flash 离线分析 / offline analysis |
| `packages/lexicon-importer` | 外部词库导入 / external lexicon import |

### CLI

```sh
sancho-quick-dictionary --help
sancho-model-orchestrator --help
sancho-cloud-teacher --help
sancho-lexicon-importer --help
sancho-dashboard --help
```

### i18n

默认 **简体中文 `zh-CN`**，英文界面 / English UI：

```sh
SANCHO_LOCALE=en-US sancho-dashboard render --output data/dashboard.html
SANCHO_LOCALE=en-US npm run menubar:dev
```

## 技术栈 / Tech Stack

- **Node.js 22+ / ESM / npm workspaces / node:test**
- 候选预测 / Prediction：Rime Lua filter → HTTP → 本地词库评分 + 外部 runner（HTTP/Ollama 异步缓存）
- macOS 外壳 / Shell：Electron → Rime 配置管理 + Squirrel 部署 + 本地 HTTP 预测服务
- 底层输入引擎 / Input engine：Squirrel/Rime（BSD-3-Clause，不作为依赖打包 / not bundled）

## 测试 / Tests

```sh
npm test    # 124 tests
```

覆盖：predictor-service（词库预测、英文联想、Flash runner 合并）、dashboard view-model 与 HTML 渲染、quick-dictionary 解析与同步、model-orchestrator bootstrap 与 manifest、cloud-teacher DeepSeek CLI + flash-tasks + lexicon-analyzer、lexicon-importer 导入与适配器、rime-settings 读写与部署、release gate 与 SBOM 生成。

## 许可证 / License

项目自有代码 / Project code: **Apache-2.0**

- Rime `librime` — BSD-3-Clause; Squirrel — GPL-3.0（Sancho 不捆绑，只生成配置和 Lua 扩展）
- Qwen 模型权重 — Apache-2.0
- cspell-dicts 词库 — MIT
