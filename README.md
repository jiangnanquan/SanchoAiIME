# SanchoAiIME

> AI 原生的个人输入系统：用本地小模型保证跟手感，用大模型离线理解你，再把理解编译回输入体验。

SanchoAiIME 不是一个“大而全”的传统拼音方案，也不是在万象这类复杂方案外面再套一层 AI。它的目标是做一个极小、可控、可进化的输入层：打字主链路保持零网络依赖和低延迟，个人记忆、词库导入、AI 命令、环境 profile 切换都由后端异步管理。

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

仓库现在包含三个可测试实现包：

* **`packages/quick-dictionary`**：提供 `@sancho-ai-ime/quick-dictionary` 库和 `sancho-quick-dictionary` CLI，用 marker 托管区同步 Rime `custom_phrase.txt`，保留用户手写区域；同时提供 action registry 校验、可见 action preview 渲染，以及只向子进程注入环境变量的 profile wrapper。
* **`packages/model-orchestrator`**：提供 `@sancho-ai-ime/model-orchestrator` 库和 `sancho-model-orchestrator` CLI，内置 `qwen3.5-0.8b` baseline manifest，支持模型 artifact 计划、校验式下载/bootstrap、以及通过外部本地 runner 执行 benchmark；模型文件、lock 和 benchmark 运行产物都留在 ignored runtime model directory。
* **`packages/cloud-teacher`**：提供 `@sancho-ai-ime/cloud-teacher` 库和 `sancho-cloud-teacher` CLI，接入 DeepSeek V4 Flash 作为离线教师层；凭据只从 `DEEPSEEK_API_KEY` 或 macOS Keychain service `SanchoAiIME DeepSeek API Key` 读取，status/dry-run/chat 输出都不打印 API Key。

本地检查：

```sh
npm test
npm run release:check
```

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

Qwen baseline 由 `sancho-model-orchestrator` 管理 manifest、下载目录和 benchmark runner：

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
* [ ] **Phase 3: 本地预测模型** - 接入 `Qwen3.5-0.8B`，完成候选重排和下一词预测 benchmark。
* [ ] **Phase 4: DeepSeek 教师层** - 接入 DeepSeek V4 Flash，离线分析个人输入与导入词库。
* [ ] **Phase 5: 外部词库导入** - 支持搜狗、QQ 拼音、百度、Rime、macOS/微软拼音等格式。
* [ ] **Phase 6: 发布合规** - 确认项目许可证、第三方 NOTICE、模型许可证、GPL 隔离和 release SBOM。
