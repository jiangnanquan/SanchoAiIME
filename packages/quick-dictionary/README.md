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
