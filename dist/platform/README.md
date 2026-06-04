# Платформенные модули Nexa

Под каждую ОС подключается **один главный файл** через `index.js`:

| ОС | Главный файл | Подмодули |
|----|--------------|-----------|
| macOS | `darwin.js` | `apps-darwin`, `audio-darwin`, `windows-darwin`, `browser-darwin` |
| Windows | `win32.js` | `apps-win32`, `audio-win32`, `windows-win32`, `browser-win32` |
| Linux | `linux.js` | `apps-linux`, `audio-linux`, `windows-linux`, `browser-linux` |

## Без заготовленных команд

- **Приложения** — поиск по установленным программам (`.app` / реестр / `.desktop`), русские алиасы как подсказки.
- **Громкость** — нативные API ОС (osascript / AudioDeviceCmdlets / pactl).
- **Браузер** — список установленных браузеров + Google-поиск по запросу, без фиксированных `chrome.exe` в коде UI.
- **Окна** — по заголовку/имени процесса (System Events / PowerShell / wmctrl).

## IPC (main → platform)

- `system-open-app`, `system-close-app`, `system-minimize-app`
- `system-get-volume`, `system-increase-volume`, `system-decrease-volume`, `system-mute-volume`
- `system-maximize-window`, `system-minimize-window`, `system-close-window`
- `browser-search`, `browser-open-url`, …
