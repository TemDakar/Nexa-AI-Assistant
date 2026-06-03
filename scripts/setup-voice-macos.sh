#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WHISPER_DIR="$ROOT/resources/whisper"
VENV="$WHISPER_DIR/.venv"

echo "==> Nexa: настройка распознавания голоса (macOS)"

if ! command -v python3 >/dev/null 2>&1; then
	echo "Ошибка: python3 не найден. Установите Python 3.9+."
	exit 1
fi

echo "==> Создание venv: $VENV"
python3 -m venv "$VENV"
"$VENV/bin/pip" install --upgrade pip
"$VENV/bin/pip" install -r "$WHISPER_DIR/requirements.txt"

if ! command -v ffmpeg >/dev/null 2>&1; then
	if command -v brew >/dev/null 2>&1; then
		echo "==> Установка ffmpeg через Homebrew"
		brew install ffmpeg
	else
		echo "Предупреждение: ffmpeg не найден. Установите Homebrew и выполните: brew install ffmpeg"
	fi
fi

echo "==> Проверка faster_whisper"
"$VENV/bin/python3" -c "import faster_whisper; print('faster_whisper OK')"

if command -v ffmpeg >/dev/null 2>&1; then
	echo "==> ffmpeg: $(command -v ffmpeg)"
else
	echo "Предупреждение: ffmpeg по-прежнему не в PATH"
fi

echo ""
echo "Готово. Запуск приложения:"
echo "  cd \"$ROOT\" && env -u ELECTRON_RUN_AS_NODE npm start"
