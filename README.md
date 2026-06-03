# Nexa

Локальный AI-ассистент на Electron и Vue с голосовым вводом, чатом, командами, Telegram MTProto и автообновлением через GitHub Releases.

## Установка

```bash
npm install
cmd /c npm install --prefix vue
```

## Запуск

```bash
npm install
npm start
```

На macOS из Cursor/терминала с `ELECTRON_RUN_AS_NODE`:

```bash
env -u ELECTRON_RUN_AS_NODE npm start
```

### Распознавание голоса (macOS)

Whisper требует Python, `faster-whisper` и **ffmpeg** (для конвертации WebM с микрофона):

```bash
npm run setup:voice
```

Или вручную: `brew install ffmpeg` и venv в `resources/whisper/.venv` (см. `scripts/setup-voice-macos.sh`).

## Сборка

```bash
npm run build
npm run dist
```

Для публикации обновления в GitHub Releases:

```bash
npm run dist:publish
```

Для публикации нужен `GH_TOKEN` с правами на создание релизов в репозитории `whydarcy/nexa_assistant`.

## Структура

```text
dist/                 Electron main/preload и IPC-мосты
renderer/             Собранный Vue renderer для Electron
vue/                  Исходники Vue-интерфейса
plugins/              Внешние плагины и расширения
resources/whisper/    Whisper-скрипт, requirements и PyInstaller spec
resources/vosk/       Vosk/WebAudio runtime-файлы и локальные speech-модели
services/jarvis/      Внешний Jarvis access service
build/                Иконки и ресурсы electron-builder
```

## Требования

- Node.js 18+
- Python 3.9+ и ffmpeg для Whisper (macOS / Windows)
- Windows 10/11 x64 (сборка установщика)
- macOS: Homebrew рекомендуется для `ffmpeg`
