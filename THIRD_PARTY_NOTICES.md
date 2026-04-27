# Third-Party Notices

SanchoAiIME is currently a design and architecture repository. No third-party
source code is vendored at this stage.

Planned integrations must be reviewed before release:

| Component | Purpose | License / Terms | Distribution stance |
| --- | --- | --- | --- |
| Rime librime | Input method engine | BSD-3-Clause | May be depended on with notice preservation |
| Squirrel | macOS Rime host | GPL-3.0 | Do not bundle by default; generate user config |
| imewlconverter | Dictionary conversion reference/CLI | GPL-3.0 | Use as external CLI or reimplement parsers |
| Qwen3.5-0.8B | Local prediction baseline model | Apache-2.0 model card | Manifest reference only; do not vendor weights without notices |
| DeepSeek API | Cloud teacher model | Service terms | User-provided API key; no model distribution |

Do not add third-party code, fonts, icons, dictionaries, or model artifacts
without updating this file and verifying license compatibility.
