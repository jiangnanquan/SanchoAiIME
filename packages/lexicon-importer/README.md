# @sancho-ai-ime/lexicon-importer

Lexicon import preview, normalization, and rollback helpers for SanchoAiIME.

The first supported formats are:

| Format | Input |
| --- | --- |
| `rime-custom-phrase` | Rime `custom_phrase.txt` rows: `surface<TAB>reading<TAB>weight`. |
| `rime-dict` | Rime `dict.yaml` body rows after the `...` metadata marker. |
| `macos-text-replacements` | macOS Text Replacements XML plist exports with `shortcut` and `phrase` keys. |
| `tsv` | Generic tab-separated rows with optional header. |
| `csv` | Generic comma-separated rows with optional header and quoted fields. |

For popular IME formats that require GPL-covered converters, Sancho uses an
external-process adapter instead of embedding parser code. The first adapter is
`imewlconverter`, which can be pointed at a user-installed converter and asked
to emit one of the supported text formats above. Declared source formats are
`sogou-scel`, `sogou-text`, `qq-pinyin`, `baidu-ime`, `microsoft-pinyin`, and
`macos-text-replacements`. macOS Text Replacements also has a native parser for
the XML plist export, so it does not require an external converter.

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

Preview a macOS Text Replacements plist export without an external converter:

```sh
sancho-lexicon-importer preview \
  --format macos-text-replacements \
  --input ~/Downloads/Text\ Substitutions.plist
```

Preview a popular IME export through an external converter:

```sh
sancho-lexicon-importer external-preview \
  --adapter imewlconverter \
  --source-format sogou-scel \
  --converted-format tsv \
  --input ~/Downloads/user.scel \
  --tool /usr/local/bin/imewlconverter \
  -- --converter-input "{input}" --converter-stdout
```

`{input}` is replaced with the private user dictionary path. If the converter
requires an output file, include `{output}` in the adapter args; Sancho creates a
temporary file, reads the converted text, and removes the file after preview or
import. Replace the example converter flags with the arguments required by the
locally installed converter. The converter is launched with `execFile` and
`shell: false`.

Each import creates a rollback snapshot next to the output by default:

```sh
sancho-lexicon-importer rollback \
  --output ./data/lexicons/rime-import.json \
  --rollback-id 2026-04-28T10-20-30-000Z-example
```

`data/` is ignored by the repository. Imported dictionaries, normalized import
documents, and rollback snapshots are user data and must not be committed.
