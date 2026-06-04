# FFmpeg для Nexa

Нужен для конвертации записи с микрофона (WebM) перед Whisper.

## macOS

```bash
brew install ffmpeg
```

Либо положите исполняемый файл сюда: `resources/ffmpeg/ffmpeg`

## Windows

```powershell
winget install Gyan.FFmpeg
```

Либо скачайте [ffmpeg release](https://www.gyan.dev/ffmpeg/builds/) и положите `ffmpeg.exe` в эту папку:

`resources/ffmpeg/ffmpeg.exe`

## Linux

```bash
sudo apt install ffmpeg    # Debian / Ubuntu
sudo dnf install ffmpeg    # Fedora
```

Либо `resources/ffmpeg/ffmpeg`

## Проверка

```bash
npm run setup:voice
```
