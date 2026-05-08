# @sancho-ai-ime/model-orchestrator

Local model bootstrap and benchmark helpers for SanchoAiIME.

The built-in manifest includes:

* `qwen2.5-0.5b-instruct-q4_k_m`: downloadable GGUF model (~398 MB) used by
  the macOS menu bar app's one-click local model setup via Ollama.

Weight files, tokenizers, locks, and benchmark output belong under runtime
model directories such as `models/`, `SANCHO_MODEL_DIR`, or
`SANCHO_RUNTIME_DIR/models`.

## CLI

Inspect the built-in Qwen baseline without downloading anything:

```sh
sancho-model-orchestrator models plan --model qwen2.5-0.5b-instruct-q4_k_m
```

Download the lightweight GGUF model used by the macOS app:

```sh
sancho-model-orchestrator models bootstrap --model qwen2.5-0.5b-instruct-q4_k_m --allow-network
```

Bootstrap from a manifest that lists exact artifact URLs and checksums:

```sh
sancho-model-orchestrator models bootstrap --manifest qwen.manifest.json --allow-network
```

Dry-run a bootstrap into an explicit ignored model directory:

```sh
sancho-model-orchestrator models bootstrap --manifest qwen.manifest.json --models-dir ./models --dry-run
```

Run a benchmark through an external local runner:

```sh
sancho-model-orchestrator benchmark run --manifest qwen.manifest.json --runner llama-cli -- --model '{modelDir}/model.gguf' --prompt '{prompt}'
```

Audit runtime model state and create a rollback point before a maintenance job:

```sh
sancho-model-orchestrator maintenance audit --manifest qwen.manifest.json
sancho-model-orchestrator maintenance snapshot --manifest qwen.manifest.json --snapshot-id before-prune
```

Compare or restore after a maintenance job:

```sh
sancho-model-orchestrator maintenance diff --manifest qwen.manifest.json --snapshot-id before-prune
sancho-model-orchestrator maintenance rollback --manifest qwen.manifest.json --snapshot-id before-prune --dry-run
sancho-model-orchestrator maintenance rollback --manifest qwen.manifest.json --snapshot-id before-prune
```

Benchmark runner args support placeholders:

| Placeholder | Value |
| --- | --- |
| `{modelDir}` | Resolved local model directory. |
| `{modelId}` | Manifest model id. |
| `{prompt}` | Benchmark prompt. |
| `{iteration}` | Zero-based warmup/sample index. |

## Manifest Policy

Artifact paths must be relative POSIX paths that stay inside the resolved model
directory. Remote downloads require `--allow-network`, and each artifact must
include a `sha256` digest unless `--allow-unverified` is explicitly passed.

The package writes `sancho-model.lock.json` next to downloaded artifacts. That
file is runtime state and must not be committed.

Maintenance snapshots are written under
`.sancho-maintenance/snapshots/` inside the resolved model directory by
default. Snapshot copies prefer filesystem clone support and fall back to normal
file copies, so rollback artifacts remain runtime data and must stay out of git.
