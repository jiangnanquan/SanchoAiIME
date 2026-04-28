# @sancho-ai-ime/lexicon-importer

Lexicon import preview, normalization, and rollback helpers for SanchoAiIME.

The first supported formats are:

| Format | Input |
| --- | --- |
| `rime-custom-phrase` | Rime `custom_phrase.txt` rows: `surface<TAB>reading<TAB>weight`. |
| `rime-dict` | Rime `dict.yaml` body rows after the `...` metadata marker. |
| `tsv` | Generic tab-separated rows with optional header. |
| `csv` | Generic comma-separated rows with optional header and quoted fields. |

Normalized entries use this shape:

```json
{
  "surface": "DeepSeek V4 Flash",
  "reading": "dsf",
  "weight": 600,
  "source": "custom_phrase.txt",
  "domain": "models",
  "style_tags": ["cloud", "teacher"]
}
```

## CLI

Preview without writing imported user data:

```sh
sancho-lexicon-importer preview --format rime-custom-phrase --input ~/Library/Rime/custom_phrase.txt
```

Write a normalized import document under an ignored runtime path:

```sh
sancho-lexicon-importer import \
  --format rime-dict \
  --input ~/Library/Rime/luna_pinyin.extended.dict.yaml \
  --output ./data/lexicons/rime-import.json
```

Each import creates a rollback snapshot next to the output by default:

```sh
sancho-lexicon-importer rollback \
  --output ./data/lexicons/rime-import.json \
  --rollback-id 2026-04-28T10-20-30-000Z-example
```

`data/` is ignored by the repository. Imported dictionaries, normalized import
documents, and rollback snapshots are user data and must not be committed.
