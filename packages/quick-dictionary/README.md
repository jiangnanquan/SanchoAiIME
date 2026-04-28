# @sancho-ai-ime/quick-dictionary

Managed-region writer for Rime `custom_phrase.txt`.

The package keeps user-authored phrases intact and only creates or replaces
this Sancho-owned block:

```text
# >>> SanchoAiIME managed: quick-dictionary
Sancho quick dictionary	sqd	99
# <<< SanchoAiIME managed: quick-dictionary
```

## CLI

Preview the managed region:

```sh
sancho-quick-dictionary render --entries packages/quick-dictionary/examples/quick-dictionary.entries.example.json
```

Sync to the default macOS Rime path:

```sh
sancho-quick-dictionary sync --entries entries.json
```

Sync to an explicit file:

```sh
sancho-quick-dictionary sync --entries entries.json --custom-phrase ./custom_phrase.txt
```

Use `--dry-run` to print the resulting file content without writing it.

Validate an action registry:

```sh
sancho-quick-dictionary actions validate --registry packages/quick-dictionary/examples/sancho-actions.example.json
```

Render action previews as Rime rows:

```sh
sancho-quick-dictionary actions entries --registry packages/quick-dictionary/examples/sancho-actions.example.json
```

Preview a profile launch without starting the tool:

```sh
sancho-quick-dictionary profiles run --registry sancho-actions.json --action cds --dry-run
```

Start a configured profile and pass extra child-process arguments after `--`:

```sh
sancho-quick-dictionary profiles run --registry sancho-actions.json --profile sanchoexo-codex-deepseek -- --ask-for-approval never
```

## Entry Format

The entries file may be a JSON array or an object with an `entries`, `phrases`,
or `quickDictionary` array.

Each entry accepts:

| Field | Required | Notes |
| --- | --- | --- |
| `surface`, `text`, or `phrase` | yes | Phrase inserted by Rime. |
| `code` or `reading` | yes | Rime code column. |
| `weight` | no | Integer, defaults to `99`. |

Tabs and line breaks are rejected before rendering Rime rows.

## Action Registry

`custom_phrase.txt` should contain only visible insertion previews. Executable
behavior lives in an action registry JSON file with `actions` and optional
`profiles` arrays:

```json
{
  "profiles": [
    {
      "id": "sanchoexo-codex-deepseek",
      "label": "SanchoExo / Codex / DeepSeek",
      "command": "codex",
      "args": [],
      "env": {
        "OPENAI_BASE_URL": "https://api.deepseek.com",
        "OPENAI_MODEL": "deepseek-v4-flash"
      },
      "inheritEnv": true
    }
  ],
  "actions": [
    {
      "id": "sanchoexo.codex.deepseek",
      "code": "cds",
      "label": "SanchoExo + Codex + DeepSeek",
      "kind": "profile_switch",
      "profile": "sanchoexo-codex-deepseek",
      "insertPreview": "SanchoExo Codex DeepSeek"
    }
  ]
}
```

Supported action kinds are `insert_text`, `copy_text`, `run_command`,
`profile_switch`, `open_url`, and `skill_invoke`. `run_command` defaults to
`confirm` risk; other kinds default to `normal`.

## Profile Wrapper

Profiles launch commands with `child_process.spawn` and `shell: false`.
Environment variables are merged into the env object passed to that child
process only. The wrapper does not write `.zshrc`, `.bashrc`, global `.env`, or
Rime files.

Profile descriptions redact sensitive environment variable names such as
`DEEPSEEK_API_KEY`. Store credentials in the OS keychain or another local secret
store and inject them at runtime; do not commit secrets in registry files.
