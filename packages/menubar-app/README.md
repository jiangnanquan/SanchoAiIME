# @sancho-ai-ime/menubar-app

Electron menu bar shell for running SanchoAiIME on macOS.

Development launch:

```sh
npm run menubar:dev
```

Build local macOS package artifacts:

```sh
npm run menubar:package:mac
open dist/menubar-app/SanchoAiIME-arm64.dmg
```

Open the DMG, then drag the left-side `SanchoAiIME.app` onto the right-side
`Applications` shortcut.

This creates:

```text
dist/menubar-app/mac-arm64/SanchoAiIME.app
dist/menubar-app/SanchoAiIME-arm64.dmg
dist/menubar-app/SanchoAiIME-arm64.zip
```

Build only the unsigned local macOS `.app` directory:

```sh
npm run menubar:pack:mac
open dist/menubar-app/mac-arm64/SanchoAiIME.app
```

The first version is macOS-only. It provides a menu bar item that can open the
local dashboard, sync the managed quick-dictionary region into
`~/Library/Rime/custom_phrase.txt`, open the Rime configuration directory, and
show a redeploy reminder for Squirrel. It also provides a one-click local model
download and load action for `Qwen2.5-0.5B-Instruct GGUF Q4_K_M`.

After opening the app:

1. Use **Set Up Input Method** to sync the Rime quick dictionary and open macOS
   input method settings.
2. Add or switch to **Squirrel** in macOS settings, then choose **Redeploy**
   from the Squirrel menu.
3. Use **Download and Load Local Model** to download the local GGUF model. The
   app shows a progress window, verifies SHA256, and writes `active-model.json`
   under the Sancho model directory. Clicking again after it is loaded reports
   the existing active model instead of starting over.

macOS does not allow a regular app to silently switch the input method, so this
release opens the system settings instead of switching it invisibly.

The app uses the rounded rectangle icons in `assets/icons` for the menu bar,
window, and macOS bundle icon. The original copied files are kept in
`assets/icons/original`.

The app defaults to Simplified Chinese. Set `SANCHO_LOCALE=en-US` before launch
to preview the English UI.
