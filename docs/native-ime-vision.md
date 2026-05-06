# SanchoAiIME 原生输入核心展望

本文档记录 SanchoAiIME 未来自研输入法壳与输入核心的方向。它不是当前实现承诺，也不要求现在替换鼠须管 / Squirrel。

## 当前立场

短期内，SanchoAiIME 继续使用兼容模式：

```text
SanchoAiIME 菜单栏 App
-> 写入 Rime 用户配置和 custom_phrase.txt 托管区
-> 鼠须管 / Squirrel 负责 macOS 输入法接入、候选栏和上屏
```

这样可以先验证个人词库、AI action、profile、本地模型下载、Dashboard 和发布打包体验，同时避免过早承担原生输入法壳的复杂度。

## 为什么考虑自研

长期看，SanchoAiIME 如果要成为完整商业产品，只依赖 Rime/鼠须管会有几个限制：

* 候选生成、候选排序、上屏策略受 Rime 配置模型限制。
* AI 模型只能通过词库、Lua hook 或外部桥接间接参与输入链路。
* 鼠须管是独立 GPL 组件，不适合作为 SanchoAiIME 闭源商业主程序的一部分直接捆绑。
* 用户安装、启用输入源、重新部署等流程无法完全由 Electron 菜单栏 App 静默完成。

自研输入法壳可以让 Sancho 直接控制：

* 按键事件和 composing buffer
* 拼音解析和分词
* 候选窗口
* 候选排序和动态权重
* 本地小模型预测
* 个人记忆和 profile action
* 上屏后的学习与审计

## 双模式架构

未来建议保持双模式，而不是一次性推翻现有链路。

### 兼容模式

```text
Keyboard
-> Squirrel / Rime
-> Rime schema + custom_phrase.txt + Sancho managed region
-> commit text
-> Sancho memory / cloud teacher / dashboard
```

用途：

* 当前可用版本
* 兼容万象等现有 Rime 方案
* 低风险用户迁移
* 快速验证 Sancho 的词库和模型管理能力

### 原生模式

```text
Keyboard
-> SanchoInputMethod
-> Sancho Core Engine
-> personal lexicon + local predictor + profile actions
-> candidate window
-> commit text
-> Sancho memory / cloud teacher / dashboard
```

用途：

* 完整产品体验
* 可控候选和上屏行为
* 更清晰的商业化和许可证边界
* 更深的本地模型集成

## 建议技术分层

### macOS 输入法壳

建议新建独立原生 target，例如：

```text
apps/sancho-input-method-mac
```

职责：

* 注册为 macOS 输入法
* 接收键盘事件
* 管理 composing text
* 显示候选窗口
* 支持数字选词、空格上屏、回车提交、Esc 取消
* 与 Sancho Core 或本地服务通信

技术建议：

* Swift / Objective-C
* InputMethodKit
* 必要时桥接 C ABI 或 Rust FFI

### Sancho Core Engine

建议保持平台无关：

```text
crates/sancho-core
```

职责：

* 拼音切分
* 词典查询
* 用户词频
* 候选合并
* 动态权重
* profile action 映射
* 本地 predictor 结果融合

技术建议：

* Rust
* SQLite / DuckDB 或自定义紧凑词典
* 明确的输入输出协议，方便 macOS、Windows、Linux 复用

### 本地模型服务

建议作为独立进程：

```text
Sancho Predictor Service
```

职责：

* 加载 GGUF / MLX / Core ML 模型
* 接收最近上下文和当前 composing buffer
* 返回候选重排、下一词预测、短语建议
* 控制延迟预算和隐私边界

技术建议：

* 初期使用 GGUF + llama.cpp
* macOS 后续评估 MLX 或 Core ML
* 与输入法壳使用 Unix socket 或 localhost HTTP 通信

### Electron 菜单栏 App

继续保留，不进入实时输入链路。

职责：

* 下载模型
* 设置输入法
* 管理词库
* 展示 Dashboard
* 管理 profile
* 备份和恢复配置
* 账号、订阅、许可证、审计

## 最小原生输入法里程碑

### Phase A: 原生壳可安装

目标：

* 构建 `SanchoInputMethod.app`
* 能出现在 macOS 输入法列表
* 能被用户选中
* 能接收按键事件

不做：

* 不接模型
* 不做复杂词库
* 不做云端同步

### Phase B: 最小拼音输入

目标：

* `nihao -> 你好`
* 拼音 buffer 显示
* 候选窗口显示
* 空格上屏
* 数字选词
* Backspace 编辑

不做：

* 不追求大词库覆盖
* 不追求智能排序

### Phase C: Sancho Core 接入

目标：

* 输入法壳调用 Sancho Core Engine
* Core 返回候选列表
* 词频和个人短语开始生效
* Dashboard 能看到原生模式状态

### Phase D: 本地模型接入

目标：

* predictor 服务启动和健康检查
* 输入上下文发送到 predictor
* 模型返回候选重排或短语建议
* 延迟超预算时自动降级到纯词典路径

### Phase E: 商业发布准备

目标：

* Developer ID 签名
* 公证
* 崩溃恢复
* 自动更新
* 许可证和 NOTICE 完整
* 隐私说明
* 付费功能边界

## 不做的事情

在原生输入法未稳定前，不建议做：

* 删除或替换用户现有鼠须管/万象配置
* 静默切换系统输入法
* 把鼠须管直接捆进 SanchoAiIME 主程序
* 把模型推理放进 Electron renderer
* 在实时输入链路里调用云端 API

## 商业化边界

SanchoAiIME 可以收费，但建议收费点放在 Sancho 自有能力上：

* 本地模型管理和自动加载
* 个人词库管理
* profile 和 AI action
* 私有记忆、备份和恢复
* 云端教师分析
* 跨设备同步
* 团队词库和配置
* 技术支持和订阅服务

鼠须管、Rime、万象等第三方组件应保持独立依赖或兼容目标，不作为闭源收费主程序的一部分混合分发。

## 结论

当前版本继续走：

```text
SanchoAiIME + 鼠须管/Rime 兼容模式
```

未来可以并行探索：

```text
SanchoInputMethod + Sancho Core 原生模式
```

只有当原生输入法壳、基础拼音输入、候选窗口和上屏流程都稳定后，才考虑把原生模式作为默认体验。
