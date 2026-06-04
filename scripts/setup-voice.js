#!/usr/bin/env node
/**
 * Настройка Whisper (faster-whisper + ffmpeg) для macOS и Windows.
 * Создаёт resources/whisper/.venv и ставит зависимости из requirements.txt.
 */

const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const WHISPER_DIR = path.join(ROOT, 'resources', 'whisper')
const VENV = path.join(WHISPER_DIR, '.venv')
const REQ = path.join(WHISPER_DIR, 'requirements.txt')
const FFMPEG_DIR = path.join(ROOT, 'resources', 'ffmpeg')
const isWin = process.platform === 'win32'
const isMac = process.platform === 'darwin'

function log(msg) {
	console.log(msg)
}

function run(cmd, args, opts = {}) {
	const r = spawnSync(cmd, args, {
		stdio: 'inherit',
		cwd: opts.cwd || ROOT,
		env: { ...process.env, ...opts.env },
		shell: isWin && opts.shell !== false,
	})
	if (r.status !== 0) {
		process.exit(r.status == null ? 1 : r.status)
	}
}

function venvPython() {
	return isWin
		? path.join(VENV, 'Scripts', 'python.exe')
		: path.join(VENV, 'bin', 'python3')
}

function venvPip() {
	return isWin ? path.join(VENV, 'Scripts', 'pip.exe') : path.join(VENV, 'bin', 'pip')
}

function findSystemPython() {
	const tries = isWin
		? [
				['py', ['-3']],
				['python', []],
				['python3', []],
			]
		: [['python3', []], ['python', []]]

	for (const [cmd, prefix] of tries) {
		const r = spawnSync(cmd, [...prefix, '--version'], {
			encoding: 'utf8',
			shell: isWin,
		})
		if (r.status === 0) {
			return { cmd, prefix }
		}
	}
	return null
}

function ffmpegInPath() {
	const check = isWin ? ['where', 'ffmpeg'] : ['which', 'ffmpeg']
	const r = spawnSync(check[0], check.slice(1), { encoding: 'utf8', shell: isWin })
	if (r.status !== 0) return null
	const line = (r.stdout || '').trim().split(/\r?\n/)[0]
	return line || null
}

function bundledFfmpeg() {
	const name = isWin ? 'ffmpeg.exe' : 'ffmpeg'
	const p = path.join(FFMPEG_DIR, name)
	return fs.existsSync(p) ? p : null
}

function printFfmpegHelp() {
	log('')
	log('==> FFmpeg не найден в PATH и в resources/ffmpeg/')
	if (isMac) {
		log('    macOS: brew install ffmpeg')
		log('    или скачайте бинарник в resources/ffmpeg/ffmpeg')
	} else if (isWin) {
		log('    Windows: winget install Gyan.FFmpeg')
		log('    или положите ffmpeg.exe в resources/ffmpeg/')
		log('    https://www.gyan.dev/ffmpeg/builds/')
	} else {
		log('    Установите ffmpeg в PATH или в resources/ffmpeg/')
	}
	log('    либо задайте переменную FFMPEG_PATH')
}

function main() {
	log(`==> Nexa: настройка распознавания голоса (${process.platform})`)

	if (!fs.existsSync(REQ)) {
		console.error(`Ошибка: не найден ${REQ}`)
		process.exit(1)
	}

	const py = findSystemPython()
	if (!py) {
		console.error(
			isWin
				? 'Ошибка: Python 3.9+ не найден. Установите с https://www.python.org/downloads/ (галочка "Add to PATH")'
				: 'Ошибка: python3 не найден. Установите Python 3.9+.',
		)
		process.exit(1)
	}

	if (!fs.existsSync(VENV)) {
		log(`==> Создание venv: ${VENV}`)
		run(py.cmd, [...py.prefix, '-m', 'venv', VENV], { shell: false })
	} else {
		log(`==> venv уже есть: ${VENV}`)
	}

	const pip = venvPip()
	const python = venvPython()
	if (!fs.existsSync(pip) || !fs.existsSync(python)) {
		console.error('Ошибка: venv создан некорректно (нет pip/python). Удалите .venv и запустите снова.')
		process.exit(1)
	}

	log('==> Установка зависимостей faster-whisper')
	run(pip, ['install', '--upgrade', 'pip'])
	run(pip, ['install', '-r', REQ])

	log('==> Проверка faster_whisper')
	run(python, ['-c', "import faster_whisper; print('faster_whisper OK')'])

	const ff = bundledFfmpeg() || ffmpegInPath()
	if (ff) {
		log(`==> ffmpeg: ${ff}`)
	} else {
		printFfmpegHelp()
		if (!fs.existsSync(FFMPEG_DIR)) {
			fs.mkdirSync(FFMPEG_DIR, { recursive: true })
		}
	}

	log('')
	log('Готово. Запуск приложения:')
	if (isMac) {
		log(`  cd "${ROOT}" && env -u ELECTRON_RUN_AS_NODE npm start`)
	} else {
		log(`  cd "${ROOT}" && npm start`)
	}
}

main()
