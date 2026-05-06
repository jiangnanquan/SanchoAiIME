# SanchoAiIME

> AI 原生的个人输入系统：用本地小模型保证跟手感，用大模型离线理解你，再把理解编译回输入体验。

SanchoAiIME 不是一个“大而全”的传统拼音方案，也不是在万象这类复杂方案外面再套一层 AI。它的目标是做一个极小、可控、可进化的输入层：打字主链路保持零网络依赖和低延迟，个人记忆、词库导入、AI 命令、环境 profile 切换都由后端异步管理。

## 当前状态

当前仓库已经具备一个可本机使用的 macOS 菜单栏 App，以及一组可打包安装的 Node
CLI/库包：

* **macOS 菜单栏 App**：Electron 封装，默认简体中文，使用圆角矩形 logo，支持打开 Dashboard、在控制台内管理输入法外观与行为、Rime 皮肤编辑与预览、同步 Rime 快速字典、打开 Rime 配置目录、开机启动和退出。
* **可使用软件包**：`npm run menubar:package:mac` 会生成本机 ad-hoc 签名的 `.app`、带左侧 App/右侧 Applications 拖拽布局的 `.dmg` 和 `.zip`。当前还未做 Apple Developer ID 签名与公证，适合本机和内部测试使用。
* **Dashboard**：静态 HTML 管理面板，展示用户自定义词、Sancho 托管短码、输入法外观与行为设置、AI action、profile、本地模型、词库导入、维护任务和 release check 状态。
* **本地小模型**：菜单栏 App 提供“一键下载并加载本地小模型”，当前下载 `Qwen2.5-0.5B-Instruct GGUF Q4_K_M`；下载过程会显示进度窗口，下载后校验 SHA256 并写入 active model 状态，二次点击会直接显示已加载状态。
* **预测接入状态**：菜单栏 App 会启动 `127.0.0.1:18840` 本地预测服务，并写入 Rime Lua filter，把当前拼音编码和候选发送给 Sancho。实时层先做低延迟词库预测和候选重排，超时会立即回退到原始 Rime 候选；神经 runner 采用异步缓存机制，第一次请求触发后台推理，后续同编码命中缓存后再合并进候选，不在每次按键里阻塞候选栏。
* **i18n**：用户可见界面默认 **简体中文 `zh-CN`**；需要英文时显式设置 `SANCHO_LOCALE=en-US` 或 `--locale en-US`。
* **发布检查**：已有测试、release gate、SBOM 和 npm workspace tarball 打包脚本。

## 核心方向

* **本地实时预测**：以 `Qwen3.5-0.8B` 作为本地输入预测基线，负责候选重排、下一词预测和轻量意图识别。
* **云端教师分析**：以 `DeepSeek V4 Flash API` 做离线大模型分析，提取个人术语、表达风格、项目上下文和词库优化建议。
* **快速字典与命令入口**：保留 `/Users/jnq/Library/Rime/custom_phrase.txt` 作为用户喜好的快速字典，同时由 Sancho 管理 AI 命令、skills 和 profile 快捷入口。
* **不污染本机环境**：AI 工具的 provider、API base、模型、环境变量、MCP、skills 配置都放进 Sancho profile；运行时通过 wrapper 注入到子进程，不默认修改 `.zshrc`、`.bashrc` 或全局 `.env`。
* **外部词库导入**：支持从搜狗、QQ 拼音、百度、Rime、macOS/微软拼音等流行输入软件导入用户词库，并转成 Sancho 的个人风格数据。
* **大模型维护工**：在用户授权后启动 DeepSeek V4 Flash、Gemma 4、Qwen3.6 等大模型任务，处理复杂归纳、词库合并、配置迁移、规则生成和本地模型蒸馏。
* **Rime 只是轻壳**：Rime/鼠须管负责输入事件、候选 UI 和上屏，Sancho 负责记忆、预测、命令和进化。
* **发布级许可证治理**：所有可分发组件、模型权重、词库转换器、Rime 依赖、skills 和第三方资源都必须有明确许可证与 NOTICE 记录。

## 架构模块

1. **`packages/rime-shell`**
   极简 Rime 方案与 Lua 扩展，只保留必要的拼音、候选和上屏能力。

2. **`packages/sensor`**
   监听 commit 事件，将上屏文本、时间戳、应用上下文写入 `.jsonl`。

3. **`packages/realtime-predictor`**
   常驻本地小模型服务，默认使用 `Qwen3.5-0.8B`，输入最近上下文和当前编码，输出候选重排与短语预测。

4. **`packages/memory-engine`**
   使用 DuckDB 管理输入历史、导入词库、短语权重、应用场景和风格标签。

5. **`packages/cloud-teacher`**
   定时调用 DeepSeek V4 Flash，做个人表达分析、词库瘦身、领域分类和小模型蒸馏数据生成。

6. **`packages/model-orchestrator`**
   管理本地小模型、云端大模型和批处理任务队列。复杂维护任务只在后台执行，并带预算、隐私、重试、审计和回滚策略。

7. **`packages/quick-dictionary`**
   管理 `custom_phrase.txt`、Sancho action registry、AI 命令短码、skills 快捷入口和 profile switch。

8. **`packages/lexicon-importer`**
   导入其他输入法词库，统一转为 `surface / reading / weight / source / domain / style_tags`。

9. **`packages/dashboard`**
   提供快速字典、词库导入、模型配置、环境 profile、skills 和 Rime 配置的可视化管理。

10. **`packages/compliance`**
    维护第三方许可证清单、模型许可证清单、NOTICE 文件、SBOM、发布检查和许可证兼容性规则。

## 当前实现

仓库现在包含五个公开 CLI/库包，以及一个 private Electron 菜单栏 App：

* **`packages/quick-dictionary`**：提供 `@sancho-ai-ime/quick-dictionary` 库和 `sancho-quick-dictionary` CLI，用 marker 托管区同步 Rime `custom_phrase.txt`，保留用户手写区域；同时提供 action registry 校验、可见 action preview 渲染，以及只向子进程注入环境变量的 profile wrapper。
* **`packages/model-orchestrator`**：提供 `@sancho-ai-ime/model-orchestrator` 库和 `sancho-model-orchestrator` CLI，内置 `qwen3.5-0.8b` baseline manifest，支持模型 artifact 计划、校验式下载/bootstrap、以及通过外部本地 runner 执行 benchmark；模型文件、lock 和 benchmark 运行产物都留在 ignored runtime model directory。
* **`packages/cloud-teacher`**：提供 `@sancho-ai-ime/cloud-teacher` 库和 `sancho-cloud-teacher` CLI，接入 DeepSeek V4 Flash 作为离线教师层；凭据只从 `DEEPSEEK_API_KEY` 或 macOS Keychain service `SanchoAiIME DeepSeek API Key` 读取，status/dry-run/chat 输出都不打印 API Key。
* **`packages/lexicon-importer`**：提供 `@sancho-ai-ime/lexicon-importer` 库和 `sancho-lexicon-importer` CLI，支持 Rime `custom_phrase.txt`、Rime `dict.yaml`、TSV、CSV，以及通过外部 `imewlconverter` 适配器预览/导入搜狗、QQ 拼音、百度、微软拼音和 macOS text replacement 等用户词库；导入结果属于用户数据，应写入 ignored runtime directory。
* **`packages/dashboard`**：提供 `@sancho-ai-ime/dashboard` 库和 `sancho-dashboard` CLI，把快速字典、输入法外观与行为设置、action registry、profile switch、本地模型、词库导入、维护任务和 release check 状态渲染成静态管理面板；profile env secret 会被 redacted，导入词库只展示 summary counts，不把私人词条写进 dashboard view model。
* **`packages/menubar-app`**：提供 macOS Electron 菜单栏 App，复用 dashboard、quick-dictionary、model-orchestrator 和 cloud-teacher 模块；App 图标、菜单栏图标和窗口图标都使用圆角矩形 logo，默认中文显示，只写入 Rime `custom_phrase.txt` 的 Sancho 托管区域，提供本地小模型一键下载/加载入口，并能写入 `squirrel.custom.yaml`、`default.custom.yaml`、`luna_pinyin.custom.yaml`、`lua/sancho_predictor.lua` 管理鼠须管 UI、皮肤、候选数量、默认繁简和 AI 候选预测接入。

本地检查：

```sh
npm test
npm run release:check
npm run release:sbom -- --output data/release-sbom.spdx.json
npm run release:pack
npm run menubar:package:mac
```

## 封装与使用

当前核心 CLI 技术栈是 **Node.js 22+ / ESM / npm workspaces / node:test**。核心包没有
TypeScript 编译、前端 bundler 或 native addon，所以 CLI 封装方式保持为 npm workspace
tarball；macOS 菜单栏 App 单独使用 Electron 封装：

```sh
npm run release:pack
```

发布产物默认写入 ignored runtime 目录：

```text
data/release-sbom.spdx.json
data/release-packages/sancho-ai-ime-cloud-teacher-0.1.0.tgz
data/release-packages/sancho-ai-ime-dashboard-0.1.0.tgz
data/release-packages/sancho-ai-ime-lexicon-importer-0.1.0.tgz
data/release-packages/sancho-ai-ime-model-orchestrator-0.1.0.tgz
data/release-packages/sancho-ai-ime-quick-dictionary-0.1.0.tgz
```

本机安装使用：

```sh
npm install -g ./data/release-packages/sancho-ai-ime-quick-dictionary-0.1.0.tgz
npm install -g ./data/release-packages/sancho-ai-ime-model-orchestrator-0.1.0.tgz
npm install -g ./data/release-packages/sancho-ai-ime-cloud-teacher-0.1.0.tgz
npm install -g ./data/release-packages/sancho-ai-ime-lexicon-importer-0.1.0.tgz
npm install -g ./data/release-packages/sancho-ai-ime-dashboard-0.1.0.tgz
```

安装后可直接使用这些 CLI：

```sh
sancho-quick-dictionary --help
sancho-model-orchestrator --help
sancho-cloud-teacher --help
sancho-lexicon-importer --help
sancho-dashboard --help
```

### i18n

SanchoAiIME 的用户界面默认使用 **简体中文 `zh-CN`**。当前已接入：

```text
Dashboard 静态管理面板
macOS 菜单栏 App
各 CLI 的 help 和正常提示
```

需要英文界面时，可以显式设置 locale：

```sh
SANCHO_LOCALE=en-US sancho-dashboard render --output data/dashboard.html
sancho-dashboard render --locale en-US --output data/dashboard.html
SANCHO_LOCALE=en-US npm run menubar:dev
```

没有设置 `SANCHO_LOCALE` 或 `--locale` 时，一律按中文输出，不跟随系统语言自动切换。

### macOS 菜单栏 App

第一版 macOS 软件壳位于 `packages/menubar-app`，使用 Electron 封装现有 Node
模块。开发测试优先使用根目录交互脚本：

```sh
npm run dev
```

回车默认启动菜单栏开发版；脚本内也可以选择跑测试、发布检查、重新打包、打开 DMG、
打开 Rime 配置目录或打开 macOS 输入法设置。

生成本机可打开的软件包：

```sh
npm run menubar:package:mac
open dist/menubar-app/SanchoAiIME-arm64.dmg
```

打开 DMG 后，左边是 `SanchoAiIME.app`，右边是 `Applications` 快捷方式；把左边 App 拖到右边即可安装。

产物包括：

```text
dist/menubar-app/mac-arm64/SanchoAiIME.app
dist/menubar-app/SanchoAiIME-arm64.dmg
dist/menubar-app/SanchoAiIME-arm64.zip
```

只生成本地未公证的 `.app` 目录：

```sh
npm run menubar:pack:mac
open dist/menubar-app/mac-arm64/SanchoAiIME.app
```

启动后菜单栏会出现圆角矩形 logo。当前菜单提供：

```text
打开 Sancho 面板
重新生成面板
输入法外观与行为（打开控制台并切到“输入法”分栏）
设置输入法
检查输入法状态
同步 Rime 快速字典
打开 Rime 配置目录
重新部署鼠须管提示
下载并加载本地小模型
打开模型目录
开机启动
退出
```

`同步 Rime 快速字典` 只更新
`/Users/jnq/Library/Rime/custom_phrase.txt` 里的 Sancho 托管区域，不覆盖用户手写短语。

首次使用建议按这个顺序：

1. 打开 DMG，把 `SanchoAiIME.app` 拖到 `Applications`。
2. 启动 `SanchoAiIME.app`，菜单栏会出现 SanchoAiIME 的圆角 logo。
3. 点菜单里的 **设置输入法**。App 会先同步 Rime 快速字典，再打开 macOS 输入法设置。
4. 在系统设置里添加或切换到 **鼠须管 / Squirrel**，然后从鼠须管菜单执行 **重新部署**。
5. 打开控制台的 **输入法** 分栏，可设置默认简体/繁体、候选数量、候选横竖排、配色、字号、圆角、内嵌编码、**AI 候选预测** 开关和神经增强 runner；也可以选择内置 Sancho 极简皮肤，或编辑 `Sancho Custom` 的背景、边框、候选文字、高亮色、编号和注释色。右侧候选框会按当前字号、圆角、候选数量和横竖排实时预览。若已配置 DeepSeek 凭据，可在同一分栏描述想要的风格，让 Flash 生成一套自定义皮肤。保存后 App 会自动写入 Rime Lua 接入并重新部署鼠须管。
6. 在同一分栏的 **Flash 服务** 里粘贴 DeepSeek API Key 并保存；Key 会进入 macOS 钥匙串服务 `SanchoAiIME DeepSeek API Key`，不会写入项目文件或 Rime 配置。
7. 点 **下载并加载本地小模型**。当前模型约 398 MB，下载时会显示进度窗口；下载完成后会写入 `~/Library/Application Support/SanchoAiIME/models/active-model.json`，Dashboard 的模型状态会变成 ready。模型已加载后再次点击，不会重新下载，只会提示当前 active model。

AI 候选预测依赖菜单栏 App 常驻运行。App 退出后，Rime Lua filter 会因为本地服务不可达而在超时内回退到原始候选，不会阻塞输入。

神经增强 runner 可通过环境变量启用：`SANCHO_PREDICTOR_RUNNER=http` + `SANCHO_PREDICTOR_ENDPOINT=...` 接外部本地预测服务，或 `SANCHO_PREDICTOR_RUNNER=ollama` + `SANCHO_OLLAMA_MODEL=...` 接 Ollama。无 runner 时仍保留低延迟词库预测和候选重排。

macOS 不允许普通 App 静默替用户切换输入法，所以 SanchoAiIME 现在会打开系统输入法设置并引导切换；真正的自动切换需要后续补系统级输入法组件或明确的辅助功能权限方案。

## 快速字典

`/Users/jnq/Library/Rime/custom_phrase.txt` 是 Sancho 的一等入口，不只是传统短语表。它承载三类内容：

```text
普通短语        -> 直接上屏
AI 命令短码     -> 插入或触发 Sancho action
环境 profile    -> 快速切换/启动指定 AI 工具环境
```

Sancho 不直接覆盖用户手写内容，只维护带 marker 的托管区域：

```text
# >>> SanchoAiIME managed: quick-dictionary
SanchoExo Codex DeepSeek	cds	99
DeepSeek V4 Flash 分析	dsf	99
Qwen 本地预测	qwp	99
# <<< SanchoAiIME managed: quick-dictionary
```

真正的命令执行与环境变量注入不依赖 Rime 文本展开，而由 `sancho-actions.json` 或 DuckDB action registry 管理。这样可以保留 Rime 的轻量体验，同时避免把 API Key、provider、skills 或 MCP 配置散落到 shell 环境里。

## Profile Switch

Sancho 的 profile switch 借鉴 cc-switch 的思路，但入口更轻：

```text
输入短码 -> 候选栏选择 profile -> Sancho wrapper 启动工具
```

例如：

```text
cds  -> SanchoExo + Codex + DeepSeek V4 Flash
cls  -> SanchoExo + Claude Code + Sonnet
ops  -> OpenCode + 本地 Qwen
```

profile 的环境变量只作用于被 Sancho 启动的子进程。默认策略是不写全局 shell 配置，不修改用户主目录下的长期环境文件。

## 本地模型 Bootstrap

Qwen baseline 由 `sancho-model-orchestrator` 管理 manifest、下载目录和 benchmark runner。当前菜单栏 App 的一键下载使用轻量 GGUF：

```sh
sancho-model-orchestrator models plan --model qwen2.5-0.5b-instruct-q4_k_m
sancho-model-orchestrator models bootstrap --model qwen2.5-0.5b-instruct-q4_k_m --allow-network
```

原规划中的 `qwen3.5-0.8b` manifest 仍保留为后续 realtime predictor baseline：

```sh
sancho-model-orchestrator models plan --model qwen3.5-0.8b
sancho-model-orchestrator models bootstrap --manifest qwen.manifest.json --allow-network
sancho-model-orchestrator benchmark run --manifest qwen.manifest.json --runner llama-cli -- --model '{modelDir}/model.gguf' --prompt '{prompt}'
sancho-model-orchestrator maintenance audit --manifest qwen.manifest.json
sancho-model-orchestrator maintenance snapshot --manifest qwen.manifest.json --snapshot-id before-maintenance
sancho-model-orchestrator maintenance diff --manifest qwen.manifest.json --snapshot-id before-maintenance
sancho-model-orchestrator maintenance rollback --manifest qwen.manifest.json --snapshot-id before-maintenance --dry-run
```

远程下载默认关闭，开启下载时每个 artifact 默认需要 `sha256`。所有模型文件必须写入 `SANCHO_MODEL_DIR`、`SANCHO_RUNTIME_DIR/models` 或 ignored `models/`，不能提交到 git。
维护 snapshot 默认写在模型目录下的 `.sancho-maintenance/snapshots/`，仍属于 runtime data，不能提交。

## 大模型维护任务

Sancho 具备启动大模型的能力，但它们不进入实时打字链路。推荐任务包括：

```text
词库归纳       历史输入和导入词库 -> 领域/风格标签
冲突合并       同码词、重复短语、权重冲突 -> 合并建议
配置维护       profile、skills、MCP 配置 -> 迁移和修复
规则生成       用户习惯 -> 本地候选重排规则
蒸馏数据       大模型分析结果 -> Qwen3.5-0.8B 可用样本
健康检查       词库膨胀、低价值词、危险命令 -> 报告和清理建议
```

这些任务必须可审计、可取消、可回滚，并且在上传到云端 API 前提供脱敏和范围选择。

当前 DeepSeek V4 Flash 接入由 `sancho-cloud-teacher` 管理：

```sh
sancho-cloud-teacher deepseek status
sancho-cloud-teacher deepseek dry-run --message "Analyze these Rime TSV rows."
sancho-cloud-teacher deepseek chat --message "Analyze these Rime TSV rows." --allow-network
```

DeepSeek API Key 只能来自 `DEEPSEEK_API_KEY` 或 macOS Keychain service
`SanchoAiIME DeepSeek API Key`。不要把 Key 写入 Rime 配置、快速字典、action
registry、文档、测试 fixture、日志或前端 bundle。

## 外部词库导入

第一版 importer 覆盖 Rime、通用表格格式和 GPL 隔离的外部转换器适配：

```sh
sancho-lexicon-importer preview --format rime-custom-phrase --input ~/Library/Rime/custom_phrase.txt
sancho-lexicon-importer preview --format rime-dict --input ~/Library/Rime/luna_pinyin.extended.dict.yaml
sancho-lexicon-importer import --format tsv --input ./private.tsv --output ./data/lexicons/private-import.json
sancho-lexicon-importer external-preview --adapter imewlconverter --source-format sogou-scel --converted-format tsv --input ~/Downloads/user.scel -- --converter-input "{input}" --converter-stdout
sancho-lexicon-importer rollback --output ./data/lexicons/private-import.json --rollback-id <id>
```

Importer 输出统一为 `surface / reading / weight / source / domain / style_tags`。
重复词条按 `surface + reading` 合并，保留较高权重并合并风格标签。`data/`、
`imports/` 和 `lexicons/` 都被 `.gitignore` 忽略；第三方或私人词库、导入结果、
rollback snapshot 都不能提交到仓库。

## Dashboard

Dashboard 先以静态 HTML 管理面板落地，方便在不引入前端依赖的情况下检查 Sancho
状态：

```sh
sancho-dashboard render --state packages/dashboard/examples/dashboard-state.example.json --output data/dashboard.html
sancho-dashboard sample-state --output data/dashboard-state.json
```

真实状态生成的 dashboard 可能包含个人快速字典短语，因此输出应放在 `data/` 这类
ignored runtime directory。Profile 环境变量会按名称和值进行 secret redaction；
词库导入 preview 只展示 source、format 和统计摘要，不内嵌私人导入词条。

## 发布与许可证

SanchoAiIME 面向发布，因此从第一天按发布级许可证治理设计：

* 项目自有代码建议使用 **Apache-2.0**，保留专利授权空间，和 Qwen/Gemma 等 Apache-2.0 模型更兼容。
* `Qwen3.5-0.8B` 与 `Gemma 4 E2B/E4B` 可作为可选本地模型，但如果随安装包分发权重，必须附带对应 LICENSE/NOTICE。
* DeepSeek V4 Flash 通过用户 API Key 调用，不随软件分发模型，也不把 API Key 写入前端、Rime 词库或日志。
* Rime `librime` 是 BSD-3-Clause；Squirrel/鼠须管是 GPL-3.0。Sancho 默认不捆绑 Squirrel，只生成用户配置和 Lua 扩展，降低 GPL 传染风险。
* 深蓝词库转换 `imewlconverter` 是 GPL-3.0。Sancho 可以把它作为用户自装的外部 CLI 适配器，或重新实现需要的解析器；不要直接把 GPL 代码嵌入非 GPL 主程序。
* 不随软件分发第三方商业输入法词库。导入功能只处理用户自己提供的词库文件。
* 每次 release 生成 `THIRD_PARTY_NOTICES.md`、模型清单和 SBOM。

## 路线图

* [ ] **Phase 1: AI 原生输入最小闭环** - 极简 Rime shell、commit 探针、`custom_phrase.txt` 托管区域。
* [ ] **Phase 2: 快速字典与 Profile UI** - Dashboard 管理短语、AI 命令、skills、profile switch。
* [ ] **Phase 3: 本地预测模型（进行中）** - 已完成 Rime Lua -> 本地预测服务 -> 候选重排的低延迟闭环，并接入可配置的常驻神经 runner（HTTP / Ollama 异步缓存）；下一步继续做小模型下一词预测 benchmark 和默认 runner 体验优化。
* [ ] **Phase 4: DeepSeek 教师层** - 接入 DeepSeek V4 Flash，离线分析个人输入与导入词库。
* [ ] **Phase 5: 外部词库导入** - 支持搜狗、QQ 拼音、百度、Rime、macOS/微软拼音等格式。
* [ ] **Phase 6: 发布合规** - 确认项目许可证、第三方 NOTICE、模型许可证、GPL 隔离和 release SBOM。

未来自研输入法壳和输入核心的方向记录在
[docs/native-ime-vision.md](docs/native-ime-vision.md)。当前版本仍以鼠须管/Rime
兼容模式为主，不替换用户现有输入法配置。
