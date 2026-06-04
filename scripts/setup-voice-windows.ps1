# Настройка Whisper на Windows (делегирует в setup-voice.js)
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
node "$Root\scripts\setup-voice.js"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
