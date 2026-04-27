# @sancho-ai-ime/model-orchestrator

Local model bootstrap and benchmark helpers for SanchoAiIME.

The first built-in manifest is `qwen3.5-0.8b`, intended as the local realtime
prediction baseline. The manifest records the upstream source and runtime
storage policy, but it does not vendor model files. Weight files, tokenizers,
locks, and benchmark output belong under runtime model directories such as
`models/`, `SANCHO_MODEL_DIR`, or `SANCHO_RUNTIME_DIR/models`.

## CLI

Inspect the built-in Qwen baseline without downloading anything:

```sh
sancho-model-orchestrator models plan --model qwen3.5-0.8b
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
