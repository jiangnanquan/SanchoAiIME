# Third-Party Notices

SanchoAiIME currently ships Apache-2.0 project source, CLI packages, examples,
and release tooling. It does not vendor third-party source code, fonts, icons,
dictionaries, model weights, imported user data, or GPL-covered converter code.
Current workspace packages declare no third-party npm runtime dependencies.

Current integration boundaries:

| Component | Purpose | License / Terms | Distribution stance |
| --- | --- | --- | --- |
| Node.js runtime | Executes the JavaScript CLI packages and release scripts | Node.js runtime license | Required runtime; not redistributed by this repository |
| Rime librime | Input method engine boundary for future native shell work | BSD-3-Clause | May be depended on with notice preservation |
| Squirrel | macOS Rime host | GPL-3.0 | Do not bundle by default; generate user config or release a GPL-compliant distribution unit |
| imewlconverter | Optional dictionary conversion CLI for user-provided exports | GPL-3.0 | Invoke only as a user-installed external process, or replace with clean-room parsers |
| macOS Text Replacements plist exports | User-provided lexicon import source | User data / Apple platform export | Native parser only; do not commit imported dictionaries or normalized outputs |
| Qwen3.5-0.8B | Local prediction baseline model manifest | Apache-2.0 model card | Manifest reference only; do not vendor weights without model notices |
| Gemma 4 E2B/E4B | Optional local model alternatives | Apache-2.0 model card | Optional user download or bundle only with required LICENSE/NOTICE material |
| DeepSeek V4 Flash API | Cloud teacher and maintenance jobs | DeepSeek Open Platform terms | User-provided API key; no model weights or API keys distributed |

Before adding third-party code, fonts, icons, dictionaries, model artifacts, or
new runtime dependencies, update this file, NOTICE, MODEL_LICENSES.md, and the
release gate expectations together.
