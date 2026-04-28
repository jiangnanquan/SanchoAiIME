# @sancho-ai-ime/cloud-teacher

Cloud teacher integrations for offline SanchoAiIME maintenance jobs.

The first provider is DeepSeek V4 Flash. It is intended for user-authorized
background analysis such as lexicon review, phrase tagging, and maintenance
advice. It must not run in the real-time typing path.

## Credential Sources

DeepSeek credentials are read only from:

1. `DEEPSEEK_API_KEY`
2. macOS Keychain generic password service `SanchoAiIME DeepSeek API Key`

The package does not read API keys from Rime config, `custom_phrase.txt`, JSON
registries, CLI flags, frontend bundles, logs, or repository files. CLI status
and dry-run output report only whether a credential is available and which
approved source provided it.

Store the key with Keychain Access, or from a shell prompt that does not leave
the secret in history:

```sh
read -rsp "DeepSeek API key: " SANCHO_DEEPSEEK_KEY
printf "\n"
security add-generic-password -U -a "$USER" -s "SanchoAiIME DeepSeek API Key" -w "$SANCHO_DEEPSEEK_KEY"
unset SANCHO_DEEPSEEK_KEY
```

## CLI

Check credential availability without making a network request:

```sh
sancho-cloud-teacher deepseek status
```

Preview the request shape without sending it:

```sh
sancho-cloud-teacher deepseek dry-run --message "Analyze these Rime TSV rows."
```

Call DeepSeek V4 Flash only when network access is explicitly enabled:

```sh
sancho-cloud-teacher deepseek chat --message "Analyze these Rime TSV rows." --allow-network
```

Network calls return redacted metadata, usage, and the assistant text. They do
not return or print credential values.
