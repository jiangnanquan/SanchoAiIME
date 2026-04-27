# Model Licenses

SanchoAiIME may support local and cloud models, but this repository does not
currently include model weights.

| Model | Intended role | License / Terms | Distribution stance |
| --- | --- | --- | --- |
| Qwen3.5-0.8B | Local realtime prediction baseline | Apache-2.0 model card | Built-in manifest only; optional user download into ignored model directory |
| Gemma 4 E2B/E4B | Local model alternatives | Apache-2.0 model card | Optional download or bundle with LICENSE/NOTICE |
| DeepSeek V4 Flash API | Offline cloud teacher and maintenance jobs | DeepSeek Open Platform terms | User-provided API key; no weights bundled |

Before bundling a model artifact:

1. Record the exact model name, source URL, revision, hash, and license.
2. Distinguish official weights from third-party quantized artifacts.
3. Include the upstream license and required notices in the release package.
4. Confirm commercial use, redistribution, and fine-tuning permissions.
5. Keep API keys and user data out of model manifests.
