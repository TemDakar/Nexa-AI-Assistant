'use strict'
var __createBinding =
	(this && this.__createBinding) ||
	(Object.create
		? function (o, m, k, k2) {
				if (k2 === undefined) k2 = k
				var desc = Object.getOwnPropertyDescriptor(m, k)
				if (
					!desc ||
					('get' in desc ? !m.__esModule : desc.writable || desc.configurable)
				) {
					desc = {
						enumerable: true,
						get: function () {
							return m[k]
						},
					}
				}
				Object.defineProperty(o, k2, desc)
			}
		: function (o, m, k, k2) {
				if (k2 === undefined) k2 = k
				o[k2] = m[k]
			})
var __setModuleDefault =
	(this && this.__setModuleDefault) ||
	(Object.create
		? function (o, v) {
				Object.defineProperty(o, 'default', { enumerable: true, value: v })
			}
		: function (o, v) {
				o['default'] = v
			})
var __importStar =
	(this && this.__importStar) ||
	(function () {
		var ownKeys = function (o) {
			ownKeys =
				Object.getOwnPropertyNames ||
				function (o) {
					var ar = []
					for (var k in o)
						if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k
					return ar
				}
			return ownKeys(o)
		}
		return function (mod) {
			if (mod && mod.__esModule) return mod
			var result = {}
			if (mod != null)
				for (var k = ownKeys(mod), i = 0; i < k.length; i++)
					if (k[i] !== 'default') __createBinding(result, mod, k[i])
			__setModuleDefault(result, mod)
			return result
		}
	})()
Object.defineProperty(exports, '__esModule', { value: true })
const electron_1 = require('electron')
const path = __importStar(require('path'))
const child_process_1 = require('child_process')
const os = __importStar(require('os'))
const util_1 = require('util')
const execAsync = (0, util_1.promisify)(child_process_1.exec)
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile)
const fs = require('fs')
const platform = require('./platform')
const { spawn } = require('child_process')
const { Tray, Menu, nativeImage } = electron_1
let mainWindow = null
let whisperProcess = null // Процесс Whisper Python скрипта
let appTray = null // Системный трей

// =========================
// Helpers: safer URL opening + browser detection
// =========================
async function openExternalUrl(url) {
	try {
		// Самый надежный способ в Electron
		await electron_1.shell.openExternal(url)
		return { success: true, message: `URL "${url}" открыт` }
	} catch (e) {
		return { error: `Не удалось открыть URL через shell: ${e.message}` }
	}
}

async function getInstalledBrowsersMac() {
	return [
		{ id: 'safari', name: 'Safari', command: 'open -a Safari' },
		{ id: 'chrome', name: 'Google Chrome', command: 'open -a "Google Chrome"' },
		{ id: 'firefox', name: 'Firefox', command: 'open -a Firefox' },
		{ id: 'edge', name: 'Microsoft Edge', command: 'open -a "Microsoft Edge"' },
		{ id: 'opera', name: 'Opera', command: 'open -a Opera' },
		{ id: 'brave', name: 'Brave', command: 'open -a Brave' },
	]
}

function runOsascript(script) {
	const escaped = script.replace(/'/g, "'\\''")
	return execAsync(`osascript -e '${escaped}'`)
}

async function runOsascriptSafe(script) {
	try {
		const { stdout, stderr } = await runOsascript(script)
		return { success: true, output: (stdout || stderr || '').trim() }
	} catch (e) {
		return { success: false, error: e.message }
	}
}

async function getInstalledBrowsersWin() {
	try {
		if (process.platform !== 'win32') return []
		// Реестр StartMenuInternet + известные exe
		const ps = [
			`$ErrorActionPreference = "SilentlyContinue";`,
			`$items = @();`,
			`$roots = @("HKLM:\\SOFTWARE\\Clients\\StartMenuInternet","HKCU:\\SOFTWARE\\Clients\\StartMenuInternet");`,
			`foreach ($root in $roots) {`,
			`  if (Test-Path $root) {`,
			`    Get-ChildItem $root | ForEach-Object {`,
			`      $k = $_;`,
			`      $id = $k.PSChildName;`,
			`      $name = (Get-ItemProperty $k.PSPath)."(default)";`,
			`      if (-not $name -or $name -eq "") { $name = $id }`,
			`      $cmdKey = Join-Path $k.PSPath "shell\\open\\command";`,
			`      $cmd = (Get-ItemProperty $cmdKey)."(default)";`,
			`      if ($cmd) { $items += [pscustomobject]@{ id=$id; name=$name; command=$cmd } }`,
			`    }`,
			`  }`,
			`}`,
			`$known = @(`,
			`  @{ id="chrome";  name="Google Chrome"; exe="chrome.exe" },`,
			`  @{ id="edge";    name="Microsoft Edge"; exe="msedge.exe" },`,
			`  @{ id="firefox"; name="Mozilla Firefox"; exe="firefox.exe" },`,
			`  @{ id="opera";   name="Opera"; exe="opera.exe" },`,
			`  @{ id="brave";   name="Brave"; exe="brave.exe" },`,
			`  @{ id="yandex";  name="Яндекс.Браузер"; exe="browser.exe" }`,
			`);`,
			`foreach ($b in $known) {`,
			`  $p = (Get-Command $b.exe).Source;`,
			`  if ($p) { $items += [pscustomobject]@{ id=$b.id; name=$b.name; command=("\"{0}\"" -f $p) } }`,
			`}`,
			`$items | Group-Object id | ForEach-Object { $_.Group | Select-Object -First 1 } | ConvertTo-Json -Compress`,
		].join(' ')
		const command = `powershell -Command "${ps.replace(/"/g, '\\"')}"`
		const { stdout, stderr } = await execAsync(command)
		const raw = (stdout || stderr || '').trim()
		if (!raw) return []
		// Вырезаем JSON
		let jsonText = raw
		const firstBracket = raw.indexOf('[')
		const firstBrace = raw.indexOf('{')
		const start =
			firstBracket === -1
				? firstBrace
				: firstBrace === -1
					? firstBracket
					: Math.min(firstBracket, firstBrace)
		if (start !== -1) {
			const lastBracket = raw.lastIndexOf(']')
			const lastBrace = raw.lastIndexOf('}')
			const end = Math.max(lastBracket, lastBrace)
			if (end !== -1 && end > start) {
				jsonText = raw.slice(start, end + 1)
			}
		}
		const parsed = JSON.parse(jsonText)
		if (Array.isArray(parsed)) return parsed
		if (parsed && typeof parsed === 'object') return [parsed]
		return []
	} catch (e) {
		console.error('Get installed browsers error:', e)
		return []
	}
}

// Флаг для определения, выходим ли мы из приложения
electron_1.app.isQuiting = false

// КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Настройки для предотвращения вылетов GPU
// Проблема: конфликт GPU между Electron и Яндекс Музыкой
electron_1.app.commandLine.appendSwitch('disable-gpu-compositing') // Отключаем GPU композитинг
electron_1.app.commandLine.appendSwitch('disable-software-rasterizer') // Отключаем программный растеризатор
electron_1.app.commandLine.appendSwitch('disable-gpu-sandbox') // Отключаем GPU sandbox
electron_1.app.commandLine.appendSwitch('disable-webgl') // Отключаем WebGL для предотвращения конфликтов
electron_1.app.commandLine.appendSwitch('disable-2d-canvas-image-chromium') // Отключаем 2D canvas ускорение
electron_1.app.commandLine.appendSwitch('disable-accelerated-2d-canvas') // Отключаем ускорение 2D canvas
electron_1.app.commandLine.appendSwitch('disable-accelerated-video-decode') // Отключаем ускорение декодирования видео
electron_1.app.commandLine.appendSwitch('disable-background-networking') // Отключаем фоновые сетевые запросы
electron_1.app.commandLine.appendSwitch('disable-background-timer-throttling') // Отключаем throttling таймеров
electron_1.app.commandLine.appendSwitch('disable-renderer-backgrounding') // Предотвращаем фоновый рендеринг
electron_1.app.commandLine.appendSwitch(
	'disable-features',
	'VizDisplayCompositor',
) // Отключаем Viz композитор

// Ограничиваем использование GPU памяти
electron_1.app.commandLine.appendSwitch('max-gum-fps', '60') // Ограничиваем FPS
electron_1.app.commandLine.appendSwitch('disable-gpu-vsync') // Отключаем VSync

// Обработка ошибок GPU
electron_1.app.on('gpu-process-crashed', (event, killed) => {
	console.error('⚠️ GPU процесс упал:', killed ? 'убит' : 'не убит')
	// Не перезапускаем GPU процесс автоматически
	event.preventDefault()
})

electron_1.app.on('render-process-gone', (event, webContents, details) => {
	console.error('⚠️ Render процесс упал:', details.reason)
	if (details.reason === 'crashed' || details.reason === 'killed') {
		console.error('⚠️ Критическая ошибка рендеринга. Перезапуск окна...')
		// Перезапускаем окно при критической ошибке
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.reload()
		}
	}
})

// Оптимизированный автообновлятель
function initAutoUpdater() {
	try {
		const { autoUpdater } = require('electron-updater')

		// Оптимизация: быстрая проверка и загрузка обновлений
		autoUpdater.autoDownload = false // Не загружаем автоматически
		autoUpdater.autoInstallOnAppQuit = true // Устанавливаем при выходе

		// Оптимизация скорости загрузки
		autoUpdater.requestHeaders = {
			'Cache-Control': 'no-cache',
			Pragma: 'no-cache',
		}

		// Увеличиваем скорость загрузки
		autoUpdater.downloadedUpdateHelper = null

		// Проверяем обновления при запуске (не блокируем запуск)
		setTimeout(() => {
			autoUpdater.checkForUpdatesAndNotify().catch(err => {
				console.warn('Ошибка проверки обновлений при запуске:', err.message)
			})
		}, 3000) // Проверяем через 3 секунды после запуска

		// Событие: обновление доступно
		autoUpdater.on('update-available', info => {
			console.log('🔄 Обновление доступно:', info.version)
			if (mainWindow && !mainWindow.isDestroyed()) {
				mainWindow.webContents.send('update-available', info)
			}
		})

		// Событие: прогресс загрузки
		autoUpdater.on('download-progress', progressObj => {
			const percent = Math.round(progressObj.percent)
			const transferred =
				Math.round((progressObj.transferred / 1024 / 1024) * 100) / 100
			const total = Math.round((progressObj.total / 1024 / 1024) * 100) / 100
			console.log(
				`📥 Загрузка обновления: ${percent}% (${transferred} MB / ${total} MB)`,
			)
			if (mainWindow && !mainWindow.isDestroyed()) {
				mainWindow.webContents.send('download-progress', {
					percent,
					transferred,
					total,
					bytesPerSecond: progressObj.bytesPerSecond,
				})
			}
		})

		// Событие: обновление загружено
		autoUpdater.on('update-downloaded', info => {
			console.log('✅ Обновление загружено:', info.version)
			if (mainWindow && !mainWindow.isDestroyed()) {
				mainWindow.webContents.send('update-downloaded', info)
			}
		})

		// Событие: ошибка при обновлении
		autoUpdater.on('error', error => {
			console.error('❌ Ошибка автообновления:', error)
			let errorMessage = error.message

			// Более понятные сообщения об ошибках
			if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
				errorMessage =
					'Файл обновлений не найден на сервере. Убедитесь, что файл latest.yml загружен на сервер по адресу https://nexa-api.ballistik.tech/app/updates'
			} else if (
				errorMessage.includes('network') ||
				errorMessage.includes('ECONNREFUSED')
			) {
				errorMessage =
					'Не удалось подключиться к серверу обновлений. Проверьте подключение к интернету.'
			}

			if (mainWindow && !mainWindow.isDestroyed()) {
				mainWindow.webContents.send('update-error', errorMessage)
			}
		})

		// Событие: проверка обновлений
		autoUpdater.on('checking-for-update', () => {
			console.log('🔍 Проверка обновлений...')
			if (mainWindow && !mainWindow.isDestroyed()) {
				mainWindow.webContents.send('checking-for-update')
			}
		})

		// Событие: обновлений нет
		autoUpdater.on('update-not-available', info => {
			console.log('✅ Обновлений нет, текущая версия актуальна')
			if (mainWindow && !mainWindow.isDestroyed()) {
				mainWindow.webContents.send('update-not-available', info)
			}
		})

		// IPC обработчик: загрузить обновление
		electron_1.ipcMain.handle('download-update', async () => {
			try {
				await autoUpdater.downloadUpdate()
				return { success: true }
			} catch (error) {
				console.error('Ошибка загрузки обновления:', error)
				return { success: false, error: error.message }
			}
		})

		// IPC обработчик: установить обновление и закрыть приложение
		electron_1.ipcMain.handle('install-update', async () => {
			try {
				console.log('🔄 Начинаем установку обновления...')

				// Устанавливаем флаг выхода
				electron_1.app.isQuiting = true

				// Закрываем трей перед установкой обновления
				if (appTray && !appTray.isDestroyed()) {
					appTray.destroy()
					appTray = null
					console.log('✅ Трей закрыт')
				}

				// Закрываем все окна
				const windows = electron_1.BrowserWindow.getAllWindows()
				console.log(`🔄 Закрываем ${windows.length} окон...`)
				windows.forEach(window => {
					if (!window.isDestroyed()) {
						window.removeAllListeners('close')
						window.destroy()
					}
				})

				// Даем время на закрытие окон
				await new Promise(resolve => setTimeout(resolve, 500))

				// Устанавливаем обновление и перезапускаем
				// false = не перезапускаем немедленно, true = закрываем все окна перед установкой
				console.log('🔄 Вызываем quitAndInstall...')
				autoUpdater.quitAndInstall(false, true)

				// Принудительно выходим из приложения через небольшую задержку
				setTimeout(() => {
					console.log('🔄 Принудительный выход из приложения...')
					electron_1.app.quit()
				}, 1000)

				return { success: true }
			} catch (error) {
				console.error('❌ Ошибка установки обновления:', error)
				return { success: false, error: error.message }
			}
		})

		// IPC обработчик: проверить обновления вручную
		electron_1.ipcMain.handle('check-for-updates', async () => {
			try {
				const result = await autoUpdater.checkForUpdates()
				return { success: true, updateInfo: result?.updateInfo }
			} catch (error) {
				console.error('Ошибка проверки обновлений:', error)
				let errorMessage = error.message

				// Более понятные сообщения об ошибках
				if (
					errorMessage.includes('404') ||
					errorMessage.includes('Not Found')
				) {
					errorMessage =
						'Файл обновлений не найден на сервере. Убедитесь, что файл latest.yml загружен на сервер по адресу https://nexa-api.ballistik.tech/app/updates'
				} else if (
					errorMessage.includes('network') ||
					errorMessage.includes('ECONNREFUSED')
				) {
					errorMessage =
						'Не удалось подключиться к серверу обновлений. Проверьте подключение к интернету.'
				}

				return { success: false, error: errorMessage }
			}
		})

		console.log('✅ Автообновление инициализировано')
	} catch (error) {
		console.warn(
			'⚠️ Автообновление недоступно (возможно, не установлен electron-updater):',
			error.message,
		)
	}
}

function getIconPath() {
	const res =
		process.resourcesPath ||
		path.join(path.dirname(process.execPath), 'resources')
	const buildDir = path.join(__dirname, '..', 'build')
	const iconNames =
		process.platform === 'darwin'
			? ['icon.icns', 'icon.ico', 'icon.png']
			: ['icon.ico', 'icon.png']
	const bases = electron_1.app.isPackaged
		? [res, buildDir]
		: [buildDir, electron_1.app.getAppPath(), res, process.cwd()]
	const candidates = []
	for (const base of bases) {
		for (const name of iconNames) {
			candidates.push(path.join(base, name), path.join(base, 'build', name))
		}
	}
	for (const p of candidates) {
		if (p && fs.existsSync(p)) return p
	}
	return path.join(buildDir, 'icon.ico')
}

function createWindow() {
	mainWindow = new electron_1.BrowserWindow({
		width: 1200,
		height: 800,
		title: 'Nexa',
		frame: false,
		transparent: false,
		backgroundColor: '#000000',
		icon: getIconPath(),
		show: false, // Не показываем окно до полной загрузки
		webPreferences: {
			preload: (function () {
				var p = path.join(__dirname, 'preload.js')
				if (fs.existsSync(p)) return p
				var appPath = electron_1.app.getAppPath()
				var fallback = path.join(appPath, 'dist', 'preload.js')
				return fs.existsSync(fallback) ? fallback : p
			})(),
			nodeIntegration: false,
			contextIsolation: true,
			webSecurity: true, // Включена безопасность веб-контента
			allowRunningInsecureContent: false, // Запрещаем небезопасный контент
			experimentalFeatures: false, // Отключаем экспериментальные функции для безопасности
			devTools: !electron_1.app.isPackaged, // Отключаем DevTools в production
			enableRemoteModule: false,
			sandbox: false, // Отключаем sandbox (может потребоваться для некоторых функций)
			partition: 'persist:main', // Используем персистентную сессию для сохранения localStorage
			// Content Security Policy для уменьшения предупреждений
			// В dev режиме разрешаем unsafe-eval для работы с динамическим кодом
			// В production это предупреждение не будет показываться
			contentSecurityPolicy: electron_1.app.isPackaged
				? "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' https: http:; img-src 'self' data: https: http:; media-src 'self' blob: data:; worker-src 'self' blob:;"
				: "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' https: http:; img-src 'self' data: https: http:; media-src 'self' blob: data:; worker-src 'self' blob:;",
			// КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Отключаем аппаратное ускорение для предотвращения конфликтов с GPU
			offscreen: false, // Отключаем offscreen рендеринг
			backgroundThrottling: false, // Отключаем throttling фоновых процессов
		},
		resizable: true,
		show: true,
	})
	var appRoot = electron_1.app.getAppPath()
	var htmlPath = path.join(__dirname, '..', 'renderer', 'index.html')
	if (!fs.existsSync(htmlPath)) {
		htmlPath = path.join(appRoot, 'renderer', 'index.html')
	}
	if (!electron_1.app.isPackaged) {
		console.log('Загрузка файла:', htmlPath)
	}
	mainWindow.loadFile(htmlPath)

	// Открываем DevTools только в режиме разработки
	if (process.env.NODE_ENV === 'development' || !electron_1.app.isPackaged) {
		mainWindow.webContents.openDevTools()
	}
	// В production режиме не блокируем DevTools, но не открываем автоматически
	// Пользователь может открыть через F12 или IPC команду

	// Разрешаем открытие DevTools через F12 в production
	mainWindow.webContents.on('before-input-event', (event, input) => {
		if (input.key === 'F12') {
			if (mainWindow.webContents.isDevToolsOpened()) {
				mainWindow.webContents.closeDevTools()
			} else {
				mainWindow.webContents.openDevTools()
			}
		}
	})

	// Добавляем IPC обработчик для открытия DevTools
	electron_1.ipcMain.handle('open-devtools', () => {
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.openDevTools()
			return { success: true }
		}
		return { success: false }
	})

	electron_1.ipcMain.handle('close-devtools', () => {
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.closeDevTools()
			return { success: true }
		}
		return { success: false }
	})

	// Обработчик закрытия окна - минимизируем в трей вместо закрытия
	mainWindow.on('close', event => {
		// Если не выходим из приложения, минимизируем в трей
		if (!electron_1.app.isQuiting) {
			event.preventDefault()
			mainWindow.hide()

			// Создаем трей, если его еще нет
			if (!appTray) {
				createTray()
			}

			// Показываем уведомление в трее (если поддерживается)
			if (appTray && !appTray.isDestroyed()) {
				appTray.setToolTip('Nexa работает в фоне. Кликните для открытия.')
			}
		} else {
			// Если выходим, закрываем окно и трей
			if (appTray) {
				appTray.destroy()
			}
			mainWindow = null
		}
	})

	mainWindow.on('closed', () => {
		mainWindow = null
	})

	// КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Обработка ошибок GPU для окна
	mainWindow.webContents.on('gpu-crashed', (event, killed) => {
		console.error('⚠️ GPU процесс окна упал:', killed ? 'убит' : 'не убит')
		// Не перезапускаем автоматически, чтобы избежать бесконечного цикла
		if (!killed) {
			// Показываем уведомление пользователю
			if (mainWindow && !mainWindow.isDestroyed()) {
				mainWindow.webContents.send('gpu-crash-notification', {
					message:
						'Обнаружена проблема с GPU. Приложение будет работать в безопасном режиме.',
				})
			}
		}
	})

	mainWindow.webContents.on('render-process-gone', (event, details) => {
		console.error('⚠️ Render процесс окна упал:', details.reason)
		if (details.reason === 'crashed') {
			// Перезагружаем окно только если это не критическая ошибка GPU
			setTimeout(() => {
				if (mainWindow && !mainWindow.isDestroyed()) {
					mainWindow.reload()
				}
			}, 1000)
		}
	})

	// Ограничиваем использование памяти
	mainWindow.webContents.on('did-finish-load', () => {
		// Очищаем кэш периодически для предотвращения утечек памяти
		setInterval(() => {
			if (mainWindow && !mainWindow.isDestroyed()) {
				mainWindow.webContents.session.clearCache()
			}
		}, 300000) // Каждые 5 минут
	})
}
electron_1.app.whenReady().then(async () => {
	// Vosk удален, используем Whisper через faster-whisper
	console.log('✅ Приложение готово, используем Whisper для распознавания речи')

	electron_1.session.defaultSession.setPermissionRequestHandler(
		(webContents, permission, callback, details) => {
			console.log(
				'🔐 Запрос разрешения:',
				permission,
				'от',
				details.requestingUrl || 'локальный файл',
			)

			// Автоматически разрешаем доступ к микрофону и камере
			if (permission === 'media') {
				console.log('✅ Разрешен доступ к микрофону/камере')
				callback(true)
				return
			}

			// Разрешаем доступ к уведомлениям
			if (permission === 'notifications') {
				console.log('✅ Разрешен доступ к уведомлениям')
				callback(true)
				return
			}

			// Для других разрешений также разрешаем по умолчанию (для совместимости)
			console.log('✅ Разрешение предоставлено по умолчанию:', permission)
			callback(true)
		},
	)

	// Обработчик проверки разрешений
	electron_1.session.defaultSession.setPermissionCheckHandler(
		(webContents, permission, requestingOrigin, details) => {
			console.log(
				'🔍 Проверка разрешения:',
				permission,
				'от',
				requestingOrigin || 'локальный файл',
			)

			// Всегда разрешаем доступ к микрофону
			if (permission === 'media') {
				console.log('✅ Проверка доступа к микрофону: разрешено')
				return true
			}

			// Для других разрешений возвращаем true по умолчанию
			return true
		},
	)

	// Инициализируем автообновление (только для собранной версии)
	if (electron_1.app.isPackaged) {
		initAutoUpdater()
	}

	createWindow()

	// Создаем трей при запуске приложения
	createTray()

	electron_1.app.on('activate', () => {
		if (electron_1.BrowserWindow.getAllWindows().length === 0) {
			createWindow()
		} else {
			// Если окно скрыто, показываем его
			if (mainWindow) {
				mainWindow.show()
				mainWindow.focus()
			}
		}
	})
})
// Создаем системный трей
function createTray() {
	const iconPath = getIconPath()
	let trayIcon = nativeImage.createFromPath(iconPath)
	if (!trayIcon || trayIcon.isEmpty()) {
		console.warn(`⚠️ Иконка трея не найдена: ${iconPath}`)
		trayIcon = nativeImage.createEmpty()
	} else {
		console.log(`✅ Иконка трея загружена: ${iconPath}`)
	}

	// Создаем трей
	appTray = new Tray(trayIcon)
	appTray.setToolTip('Nexa')

	// Создаем контекстное меню для трея
	const contextMenu = Menu.buildFromTemplate([
		{
			label: 'Показать Nexa',
			click: () => {
				if (mainWindow) {
					mainWindow.show()
					mainWindow.focus()
				} else {
					createWindow()
				}
			},
		},
		{
			label: 'Скрыть',
			click: () => {
				if (mainWindow) {
					mainWindow.hide()
				}
			},
		},
		{ type: 'separator' },
		{
			label: 'Выход',
			type: 'normal',
			click: () => {
				electron_1.app.isQuiting = true
				if (appTray) {
					appTray.destroy()
				}
				if (mainWindow) {
					mainWindow.destroy()
				}
				electron_1.app.quit()
			},
		},
	])

	appTray.setContextMenu(contextMenu)

	// В Windows при правом клике показываем контекстное меню
	// При левом клике показываем/скрываем окно
	if (process.platform === 'win32') {
		// В Windows правый клик показывает контекстное меню автоматически
		// Левый клик - показываем/скрываем окно
		appTray.on('click', (event, bounds) => {
			// Левый клик - показываем/скрываем окно
			if (mainWindow) {
				if (mainWindow.isVisible()) {
					mainWindow.hide()
				} else {
					mainWindow.show()
					mainWindow.focus()
				}
			} else {
				createWindow()
			}
		})
	} else {
		// В других ОС используем стандартное поведение
		appTray.on('click', () => {
			if (mainWindow) {
				if (mainWindow.isVisible()) {
					mainWindow.hide()
				} else {
					mainWindow.show()
					mainWindow.focus()
				}
			} else {
				createWindow()
			}
		})
	}
}

// Обработчик закрытия окна - минимизируем в трей вместо закрытия
electron_1.app.on('window-all-closed', e => {
	// Не закрываем приложение, если закрыты все окна
	// Приложение будет работать в фоне через трей
	e.preventDefault()

	// Создаем трей, если его еще нет
	if (!appTray) {
		createTray()
	}

	// Скрываем все окна
	if (mainWindow) {
		mainWindow.hide()
	}
})
electron_1.ipcMain.handle('window-minimize', () => {
	if (mainWindow) mainWindow.minimize()
})
electron_1.ipcMain.handle('window-maximize', () => {
	if (mainWindow) {
		if (mainWindow.isMaximized()) {
			mainWindow.unmaximize()
		} else {
			mainWindow.maximize()
		}
	}
})
electron_1.ipcMain.handle('window-close', () => {
	if (mainWindow) {
		// При закрытии через IPC минимизируем в трей
		electron_1.app.isQuiting = false
		mainWindow.hide()

		// Создаем трей, если его еще нет
		if (!appTray) {
			createTray()
		}
	}
})

electron_1.ipcMain.handle('window-close-force', () => {
	// Принудительное закрытие приложения
	electron_1.app.isQuiting = true
	if (mainWindow) {
		mainWindow.close()
	}
	if (appTray) {
		appTray.destroy()
	}
	electron_1.app.quit()
})
electron_1.ipcMain.handle('devtools-toggle', () => {
	// Разрешаем переключение DevTools всегда
	if (mainWindow && !mainWindow.isDestroyed()) {
		if (mainWindow.webContents.isDevToolsOpened()) {
			mainWindow.webContents.closeDevTools()
		} else {
			mainWindow.webContents.openDevTools()
		}
		return { success: true }
	}
	return { success: false }
})
// System Control handlers
electron_1.ipcMain.handle('system-get-volume', async () => {
	try {
		return await platform.getVolume()
	} catch (error) {
		console.error('Get volume error:', error)
		return { success: true, volume: 50 }
	}
})
electron_1.ipcMain.handle('system-set-volume', async (event, volume) => {
	try {
		return await platform.setVolume(volume)
	} catch (error) {
		console.error('Set volume error:', error)
		return { error: error.message || 'Ошибка установки громкости' }
	}
})
electron_1.ipcMain.handle('system-increase-volume', async (event, step = 10) => {
	try {
		return await platform.increaseVolume(step)
	} catch (error) {
		console.error('Increase volume error:', error)
		return { error: error.message || 'Ошибка увеличения громкости' }
	}
})
electron_1.ipcMain.handle('system-decrease-volume', async (event, step = 10) => {
	try {
		return await platform.decreaseVolume(step)
	} catch (error) {
		console.error('Decrease volume error:', error)
		return { error: error.message || 'Ошибка уменьшения громкости' }
	}
})
electron_1.ipcMain.handle('system-mute-volume', async () => {
	try {
		return await platform.muteVolume()
	} catch (error) {
		console.error('Mute volume error:', error)
		return { error: error.message || 'Ошибка отключения звука' }
	}
})
electron_1.ipcMain.handle('system-get-info', async () => {
	console.log('📊 Запрос системной информации...')
	try {
		const osPlatform = os.platform()
		const arch = os.arch()
		const hostname = os.hostname()
		const totalMem = os.totalmem()
		const freeMem = os.freemem()
		const uptime = os.uptime()
		let systemInfo = {
			platform: osPlatform,
			arch,
			hostname,
			totalMemory: Math.round((totalMem / 1024 / 1024 / 1024) * 100) / 100, // GB
			freeMemory: Math.round((freeMem / 1024 / 1024 / 1024) * 100) / 100, // GB
			usedMemory:
				Math.round(((totalMem - freeMem) / 1024 / 1024 / 1024) * 100) / 100, // GB
			memoryUsage: Math.round((1 - freeMem / totalMem) * 100), // %
			uptime: Math.round(uptime / 3600), // hours
		}
		console.log('✅ Базовая информация получена:', systemInfo)
		// Для Windows получаем детальную информацию через PowerShell
		if (process.platform === 'win32') {
			try {
				// Версия Windows - более точная информация
				const winVersionCommand =
					'powershell -Command "Get-CimInstance Win32_OperatingSystem | Select-Object -ExpandProperty Caption"'
				try {
					const { stdout: winVersion } = await execAsync(winVersionCommand)
					const osCaption = winVersion.trim()
					// Получаем архитектуру отдельно
					const archCommand =
						'powershell -Command "Get-CimInstance Win32_OperatingSystem | Select-Object -ExpandProperty OSArchitecture"'
					try {
						const { stdout: arch } = await execAsync(archCommand)
						systemInfo.osVersion = `${osCaption} ${arch.trim()}`
					} catch (e) {
						systemInfo.osVersion = osCaption
					}
				} catch (e) {
					// Fallback
					try {
						const winVersionCommand2 =
							'powershell -Command "[System.Environment]::OSVersion.VersionString"'
						const { stdout: winVersion2 } = await execAsync(winVersionCommand2)
						systemInfo.osVersion = winVersion2.trim()
					} catch (e2) {
						systemInfo.osVersion = 'Windows'
					}
				}
				// Процессор - используем Get-CimInstance для более точной информации
				const cpuCommand =
					'powershell -Command "Get-CimInstance Win32_Processor | Select-Object -First 1 | Select-Object Name, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed, CurrentClockSpeed | ConvertTo-Json"'
				try {
					const { stdout: cpuInfo } = await execAsync(cpuCommand)
					console.log('CPU raw output:', cpuInfo)
					const cpuData = JSON.parse(cpuInfo)
					console.log('CPU parsed data:', cpuData)
					if (cpuData && cpuData.Name) {
						systemInfo.cpuModel = cpuData.Name.trim()
						systemInfo.cpuCount = cpuData.NumberOfCores || 0
						systemInfo.cpuThreads = cpuData.NumberOfLogicalProcessors || 0
						if (cpuData.MaxClockSpeed) {
							systemInfo.cpuSpeed = `${(cpuData.MaxClockSpeed / 1000).toFixed(2)} GHz`
						} else if (cpuData.CurrentClockSpeed) {
							systemInfo.cpuSpeed = `${(cpuData.CurrentClockSpeed / 1000).toFixed(2)} GHz`
						}
						console.log(
							'CPU info set:',
							systemInfo.cpuModel,
							systemInfo.cpuCount,
							systemInfo.cpuThreads,
						)
					}
				} catch (e) {
					console.error('CPU info error:', e)
					// Fallback на WMI
					try {
						const cpuCommand2 =
							'powershell -Command "Get-WmiObject Win32_Processor | Select-Object -First 1 | Select-Object Name, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed | ConvertTo-Json"'
						const { stdout: cpuInfo2 } = await execAsync(cpuCommand2)
						console.log('CPU fallback raw output:', cpuInfo2)
						const cpuData2 = JSON.parse(cpuInfo2)
						if (cpuData2 && cpuData2.Name) {
							systemInfo.cpuModel = cpuData2.Name.trim()
							systemInfo.cpuCount = cpuData2.NumberOfCores || 0
							systemInfo.cpuThreads = cpuData2.NumberOfLogicalProcessors || 0
							if (cpuData2.MaxClockSpeed) {
								systemInfo.cpuSpeed = `${(cpuData2.MaxClockSpeed / 1000).toFixed(2)} GHz`
							}
						}
					} catch (e2) {
						console.error('CPU fallback error:', e2)
						const cpus = os.cpus()
						systemInfo.cpuModel = cpus[0]?.model || 'Неизвестно'
						systemInfo.cpuCount = cpus.length
					}
				}
				// Видеокарта
				const gpuCommand =
					"powershell -Command \"Get-CimInstance Win32_VideoController | Where-Object {$_.Name -notlike '*Basic*' -and $_.Name -notlike '*Standard*' -and $_.AdapterRAM} | Select-Object -First 1 | Select-Object Name, AdapterRAM | ConvertTo-Json\""
				try {
					const { stdout: gpuInfo } = await execAsync(gpuCommand)
					const gpuData = JSON.parse(gpuInfo)
					if (gpuData && gpuData.Name) {
						systemInfo.gpu = gpuData.Name.trim()
						if (gpuData.AdapterRAM && gpuData.AdapterRAM > 0) {
							const gpuRamGB =
								Math.round((gpuData.AdapterRAM / 1024 / 1024 / 1024) * 100) /
								100
							systemInfo.gpuRam = `${gpuRamGB} GB`
						}
					}
				} catch (e) {
					console.error('GPU info error:', e)
				}
				// Информация о дисках - упрощенная и более надежная версия
				try {
					// Сначала получаем логические диски
					const logicalDisksCommand =
						'powershell -Command "Get-CimInstance Win32_LogicalDisk | Where-Object {$_.DriveType -eq 3} | Select-Object DeviceID, Size, FreeSpace | ConvertTo-Json"'
					const { stdout: logicalDisksInfo } =
						await execAsync(logicalDisksCommand)
					console.log('Logical disks raw:', logicalDisksInfo)
					const logicalDisks = JSON.parse(logicalDisksInfo)
					const disksArray = Array.isArray(logicalDisks)
						? logicalDisks
						: [logicalDisks]
					console.log('Logical disks parsed:', disksArray)
					// Получаем физические диски для определения типа
					const physicalDisksCommand =
						'powershell -Command "Get-CimInstance Win32_DiskDrive | Select-Object Model, MediaType, InterfaceType, Size | ConvertTo-Json"'
					let physicalDisks = []
					try {
						const { stdout: physicalDisksInfo } =
							await execAsync(physicalDisksCommand)
						const parsed = JSON.parse(physicalDisksInfo)
						physicalDisks = Array.isArray(parsed) ? parsed : [parsed]
						console.log('Physical disks:', physicalDisks)
					} catch (e) {
						console.error('Physical disks error:', e)
					}
					// Сопоставляем логические и физические диски
					systemInfo.disks = disksArray
						.map(ld => {
							if (!ld.Size || !ld.FreeSpace) {
								return null
							}
							// Округляем до целых GB для более читаемого формата
							const sizeGB = Math.round(ld.Size / 1024 / 1024 / 1024)
							const freeGB = Math.round(ld.FreeSpace / 1024 / 1024 / 1024)
							const usedGB = sizeGB - freeGB
							// Определяем тип диска
							let diskType = 'HDD'
							// Ищем соответствующий физический диск по размеру (примерное совпадение)
							const matchingPhysical = physicalDisks.find(pd => {
								if (!pd.Size) return false
								const pdSizeGB = Math.round(pd.Size / 1024 / 1024 / 1024)
								return Math.abs(pdSizeGB - sizeGB) < 100 // Допуск 100GB
							})
							if (matchingPhysical) {
								const model = (matchingPhysical.Model || '').toUpperCase()
								const mediaType = (
									matchingPhysical.MediaType || ''
								).toUpperCase()
								const interfaceType = (
									matchingPhysical.InterfaceType || ''
								).toUpperCase()
								if (
									model.includes('SSD') ||
									model.includes('NVME') ||
									model.includes('M.2') ||
									mediaType.includes('SSD') ||
									mediaType.includes('SOLID STATE') ||
									interfaceType.includes('NVME') ||
									(interfaceType.includes('SATA') && model.includes('SSD'))
								) {
									diskType = 'SSD'
								}
							}
							return {
								DeviceID: ld.DeviceID,
								'Size(GB)': sizeGB,
								'FreeSpace(GB)': freeGB,
								'UsedSpace(GB)': usedGB,
								Type: diskType,
							}
						})
						.filter(d => d !== null)
					console.log('Final disks info:', systemInfo.disks)
				} catch (e) {
					console.error('Disk info error:', e)
					// Fallback на простую версию
					try {
						const diskCommand2 =
							"powershell -Command \"Get-CimInstance Win32_LogicalDisk | Where-Object {$_.DriveType -eq 3} | Select-Object DeviceID, @{Name='Size(GB)';Expression={[math]::Round($_.Size/1GB,0)}}, @{Name='FreeSpace(GB)';Expression={[math]::Round($_.FreeSpace/1GB,0)}}, @{Name='UsedSpace(GB)';Expression={[math]::Round(($_.Size-$_.FreeSpace)/1GB,0)}} | ConvertTo-Json\""
						const { stdout: diskInfo2 } = await execAsync(diskCommand2)
						const disks2 = JSON.parse(diskInfo2)
						if (Array.isArray(disks2)) {
							systemInfo.disks = disks2.map(d => ({ ...d, Type: 'Неизвестно' }))
						} else if (disks2) {
							systemInfo.disks = [{ ...disks2, Type: 'Неизвестно' }]
						}
					} catch (e2) {
						console.error('Disk fallback error:', e2)
					}
				}
				// Сетевая информация
				const networkCommand =
					"powershell -Command \"Get-NetAdapter | Where-Object {$_.Status -eq 'Up' -and $_.InterfaceDescription -notlike '*Virtual*'} | Select-Object Name, InterfaceDescription, LinkSpeed | ConvertTo-Json\""
				try {
					const { stdout: networkInfo } = await execAsync(networkCommand)
					const networkData = JSON.parse(networkInfo)
					if (Array.isArray(networkData) && networkData.length > 0) {
						systemInfo.network = networkData.map(adapter => ({
							name: adapter.Name,
							type:
								adapter.InterfaceDescription?.includes('Wi-Fi') ||
								adapter.InterfaceDescription?.includes('Wireless') ||
								adapter.InterfaceDescription?.includes('WLAN')
									? 'Wi-Fi'
									: 'Ethernet',
							speed: adapter.LinkSpeed,
						}))
					} else if (networkData && networkData.Name) {
						systemInfo.network = [
							{
								name: networkData.Name,
								type:
									networkData.InterfaceDescription?.includes('Wi-Fi') ||
									networkData.InterfaceDescription?.includes('Wireless') ||
									networkData.InterfaceDescription?.includes('WLAN')
										? 'Wi-Fi'
										: 'Ethernet',
								speed: networkData.LinkSpeed,
							},
						]
					}
				} catch (e) {
					console.error('Network info error:', e)
				}
				// Батарея (для ноутбуков)
				const batteryCommand =
					'powershell -Command "Get-CimInstance Win32_Battery | Select-Object BatteryStatus, EstimatedChargeRemaining | ConvertTo-Json"'
				try {
					const { stdout: batteryInfo } = await execAsync(batteryCommand)
					const batteryData = JSON.parse(batteryInfo)
					if (Array.isArray(batteryData) && batteryData.length > 0) {
						systemInfo.battery = {
							status:
								batteryData[0].BatteryStatus === 2
									? 'Заряжается'
									: batteryData[0].BatteryStatus === 1
										? 'Разряжается'
										: 'Неизвестно',
							charge: batteryData[0].EstimatedChargeRemaining
								? `${batteryData[0].EstimatedChargeRemaining}%`
								: 'Неизвестно',
						}
					} else if (batteryData && batteryData.BatteryStatus !== undefined) {
						systemInfo.battery = {
							status:
								batteryData.BatteryStatus === 2
									? 'Заряжается'
									: batteryData.BatteryStatus === 1
										? 'Разряжается'
										: 'Неизвестно',
							charge: batteryData.EstimatedChargeRemaining
								? `${batteryData.EstimatedChargeRemaining}%`
								: 'Неизвестно',
						}
					} else {
						systemInfo.battery = { status: 'Не обнаружена (стационарный ПК)' }
					}
				} catch (e) {
					systemInfo.battery = { status: 'Не обнаружена (стационарный ПК)' }
				}
			} catch (e) {
				console.error('Windows info error:', e)
				// Fallback на базовую информацию
				const cpus = os.cpus()
				systemInfo.cpuModel = cpus[0]?.model || 'Неизвестно'
				systemInfo.cpuCount = cpus.length
			}
		} else {
			// Для других платформ используем os.cpus()
			const cpus = os.cpus()
			systemInfo.cpuModel = cpus[0]?.model || 'Неизвестно'
			systemInfo.cpuCount = cpus.length
		}
		console.log('✅ Системная информация собрана:', systemInfo)
		return { success: true, info: systemInfo }
	} catch (error) {
		console.error('❌ Get system info error:', error)
		console.error('Stack:', error.stack)
		// Все равно возвращаем базовую информацию, если возможно
		try {
			const osPlatformFallback = os.platform()
			const arch = os.arch()
			const hostname = os.hostname()
			const totalMem = os.totalmem()
			const freeMem = os.freemem()
			const cpus = os.cpus()
			return {
				success: true,
				info: {
					platform: osPlatformFallback,
					arch,
					hostname,
					totalMemory: Math.round((totalMem / 1024 / 1024 / 1024) * 100) / 100,
					freeMemory: Math.round((freeMem / 1024 / 1024 / 1024) * 100) / 100,
					usedMemory:
						Math.round(((totalMem - freeMem) / 1024 / 1024 / 1024) * 100) / 100,
					memoryUsage: Math.round((1 - freeMem / totalMem) * 100),
					cpuModel: cpus[0]?.model || 'Неизвестно',
					cpuCount: cpus.length,
					error: 'Не удалось получить полную информацию, показана базовая',
				},
			}
		} catch (fallbackError) {
			console.error('❌ Fallback error:', fallbackError)
			return { error: error.message || 'Ошибка получения информации о системе' }
		}
	}
})
// Windows Speech Recognition handlers
let windowsSpeechProcess = null
let isWindowsSpeechListening = false
electron_1.ipcMain.handle('get-app-version', async () => {
	try {
		return electron_1.app.getVersion()
	} catch (error) {
		return '1.2.3'
	}
})
electron_1.ipcMain.handle('get-app-path', async () => {
	try {
		if (electron_1.app.isPackaged) {
			return process.resourcesPath || electron_1.app.getAppPath()
		}
		return process.cwd()
	} catch (error) {
		console.error('Error getting app path:', error)
		return process.cwd()
	}
})

function getWhisperResourceRoots() {
	const roots = []
	if (electron_1.app.isPackaged && process.resourcesPath) {
		roots.push(process.resourcesPath)
	}
	roots.push(electron_1.app.getAppPath(), process.cwd(), path.join(__dirname, '..'))
	return [...new Set(roots.filter(Boolean))]
}

function getWhisperPythonExecutable() {
	const isWin = process.platform === 'win32'
	for (const root of getWhisperResourceRoots()) {
		const venvPython = path.join(
			root,
			'resources',
			'whisper',
			'.venv',
			isWin ? 'Scripts' : 'bin',
			isWin ? 'python.exe' : 'python3',
		)
		if (fs.existsSync(venvPython)) return venvPython
	}
	return isWin ? 'python' : 'python3'
}

function findWhisperFile(name) {
	for (const root of getWhisperResourceRoots()) {
		const p = path.join(root, 'resources', 'whisper', name)
		if (p && fs.existsSync(p)) return p
	}
	return null
}

function resolveFfmpegFromPath() {
	try {
		const cmd = process.platform === 'win32' ? 'where ffmpeg' : 'which ffmpeg'
		const { stdout } = require('child_process').execSync(cmd, {
			encoding: 'utf8',
			windowsHide: true,
			timeout: 5000,
		})
		const first = (stdout || '')
			.trim()
			.split(/\r?\n/)
			.find(l => l && fs.existsSync(l.trim()))
		return first ? first.trim() : null
	} catch (_e) {
		return null
	}
}

function resolveFfmpegPath() {
	if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
		return process.env.FFMPEG_PATH
	}
	const isWin = process.platform === 'win32'
	const bundledName = isWin ? 'ffmpeg.exe' : 'ffmpeg'
	const candidates = []
	for (const root of getWhisperResourceRoots()) {
		candidates.push(path.join(root, 'resources', 'ffmpeg', bundledName))
	}
	if (process.platform === 'darwin') {
		candidates.push('/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg')
	}
	const fromPath = resolveFfmpegFromPath()
	if (fromPath) candidates.push(fromPath)
	for (const p of candidates) {
		if (p && fs.existsSync(p)) return p
	}
	return null
}

function getWhisperRuntimeEnv() {
	const env = Object.assign({}, process.env)
	const ffmpegPath = resolveFfmpegPath()
	if (ffmpegPath) env.FFMPEG_PATH = ffmpegPath
	return env
}

function getWhisperFfmpegHint() {
	if (process.platform === 'darwin') {
		return 'FFmpeg не найден. Установите: brew install ffmpeg или положите ffmpeg в resources/ffmpeg/'
	}
	if (process.platform === 'win32') {
		return 'FFmpeg не найден. winget install Gyan.FFmpeg или положите ffmpeg.exe в resources/ffmpeg/'
	}
	if (process.platform === 'linux') {
		return 'FFmpeg не найден. sudo apt install ffmpeg (Debian/Ubuntu) или положите ffmpeg в resources/ffmpeg/'
	}
	return 'FFmpeg не найден. Установите ffmpeg в PATH или resources/ffmpeg/'
}

// Whisper: Windows — .exe (если собран) или Python; macOS — Python + venv
function getWhisperPath() {
	const pyScript = findWhisperFile('whisper_recognition.py')
	const exeScript = findWhisperFile('whisper_recognition.exe')
	const python = getWhisperPythonExecutable()

	if (process.platform === 'win32' && exeScript) {
		return { scriptPath: exeScript, type: 'exe' }
	}
	if (pyScript) {
		return { scriptPath: pyScript, type: 'python', executable: python }
	}

	const tried = []
	for (const root of getWhisperResourceRoots()) {
		tried.push(path.join(root, 'resources', 'whisper'))
	}
	return {
		scriptPath: null,
		type: 'python',
		executable: python,
		error:
			process.platform === 'win32'
				? `Whisper не найден. Запустите: npm run setup:voice. Проверены: ${tried.join(', ')}`
				: `whisper_recognition.py не найден. Запустите: npm run setup:voice. Пути: ${tried.join(', ')}`,
	}
}

// Whisper handlers
electron_1.ipcMain.handle('whisper-check', async () => {
	try {
		const { scriptPath, type, executable, error: err } = getWhisperPath()
		if (!scriptPath || !fs.existsSync(scriptPath)) {
			return { available: false, error: err || 'Whisper не найден' }
		}
		const ffmpegPath = resolveFfmpegPath()
		if (!ffmpegPath) {
			return {
				available: false,
				error: getWhisperFfmpegHint(),
			}
		}
		if (type === 'python') {
			try {
				const check = await execFileAsync(
					executable || 'python3',
					['-c', 'import faster_whisper'],
					{ env: getWhisperRuntimeEnv(), timeout: 15000 },
				)
				if (check.stderr) {
					console.warn('Whisper python check stderr:', check.stderr)
				}
			} catch (e) {
				return {
					available: false,
					error:
						'Python-модуль faster_whisper не установлен. Запустите: npm run setup:voice',
				}
			}
		}
		return { available: true, scriptPath, type, executable, ffmpegPath }
	} catch (error) {
		return { available: false, error: error.message }
	}
})

electron_1.ipcMain.handle('whisper-start', async () => {
	try {
		if (whisperProcess) {
			return { success: true, message: 'Whisper уже запущен' }
		}
		const { scriptPath, type, executable, error: err } = getWhisperPath()
		if (!scriptPath || !fs.existsSync(scriptPath)) {
			return { success: false, error: err || 'Whisper не найден' }
		}
		const spawnArgs = type === 'python' ? [scriptPath] : []
		const spawnCmd = type === 'python' ? executable || 'python3' : scriptPath
		whisperProcess = spawn(spawnCmd, spawnArgs, {
			stdio: ['pipe', 'pipe', 'pipe'],
			env: getWhisperRuntimeEnv(),
		})

		whisperProcess.on('error', error => {
			console.error('❌ Ошибка запуска Whisper:', error)
			whisperProcess = null
		})

		whisperProcess.on('exit', code => {
			console.log(`🛑 Whisper процесс завершен с кодом: ${code}`)
			whisperProcess = null
		})

		return { success: true }
	} catch (error) {
		return { success: false, error: error.message }
	}
})

electron_1.ipcMain.handle('whisper-stop', async () => {
	try {
		if (whisperProcess) {
			whisperProcess.kill()
			whisperProcess = null
			return { success: true }
		}
		return { success: true, message: 'Whisper не был запущен' }
	} catch (error) {
		return { success: false, error: error.message }
	}
})

electron_1.ipcMain.handle(
	'whisper-recognize',
	async (event, audioBuffer, mimeType) => {
		try {
			const { scriptPath, type, executable, error: err } = getWhisperPath()
			if (!scriptPath || !fs.existsSync(scriptPath)) {
				return { success: false, error: err || 'Whisper не найден' }
			}
			// Создаем временный файл для аудио
			const tempDir = os.tmpdir()
			// Определяем расширение файла на основе MIME типа
			let fileExt = '.webm' // По умолчанию WebM
			if (mimeType) {
				if (mimeType.includes('wav')) {
					fileExt = '.wav'
				} else if (mimeType.includes('mp3')) {
					fileExt = '.mp3'
				} else if (mimeType.includes('ogg')) {
					fileExt = '.ogg'
				}
			}
			const tempFile = path.join(tempDir, `whisper_${Date.now()}${fileExt}`)

			// Проверяем размер буфера
			if (audioBuffer.byteLength === 0) {
				return { success: false, error: 'Аудио буфер пустой' }
			}

			console.log(
				`📦 Размер аудио буфера: ${(audioBuffer.byteLength / 1024).toFixed(2)} KB, тип: ${mimeType}`,
			)

			// Записываем буфер в файл
			fs.writeFileSync(tempFile, Buffer.from(audioBuffer))

			// Проверяем, что файл записан
			const fileStats = fs.statSync(tempFile)
			if (fileStats.size === 0) {
				return {
					success: false,
					error: 'Не удалось записать аудио файл (размер 0)',
				}
			}

			console.log(
				`💾 Временный файл создан: ${tempFile}, размер: ${(fileStats.size / 1024).toFixed(2)} KB`,
			)
			console.log(`📝 Используем: ${scriptPath}`)

			// Запускаем распознавание через standalone .exe
			// Передаем язык распознавания через переменную окружения (русский по умолчанию)
			const language = 'ru' // Русский язык для распознавания
			return new Promise(resolve => {
				// Устанавливаем переменные окружения для Whisper с улучшенными настройками
				const env = Object.assign({}, getWhisperRuntimeEnv(), {
					WHISPER_LANGUAGE: language,
					WHISPER_MODEL_SIZE: 'base', // Используем base модель для лучшего качества распознавания
					WHISPER_DEVICE: 'cpu',
					WHISPER_COMPUTE_TYPE: 'int8', // int8 для CPU (быстро и качественно)
				})

				const cmd = type === 'python' ? executable || 'python3' : scriptPath
				const args = type === 'python' ? [scriptPath, tempFile] : [tempFile]
				console.log(
					`🔊 Запуск Whisper: ${cmd} ${args.join(' ')}, язык: ${language}`,
				)

				const recognizeProcess = spawn(cmd, args, {
					encoding: 'utf8',
					env: env,
				})

				let output = ''
				let errorOutput = ''

				recognizeProcess.stdout.setEncoding('utf8')
				recognizeProcess.stderr.setEncoding('utf8')

				recognizeProcess.stdout.on('data', data => {
					output += data.toString('utf8')
				})

				recognizeProcess.stderr.on('data', data => {
					errorOutput += data.toString('utf8')
				})

				recognizeProcess.on('close', code => {
					// Удаляем временный файл
					try {
						fs.unlinkSync(tempFile)
					} catch (e) {
						// Игнорируем ошибки удаления
					}

					console.log(`🔊 Whisper завершен с кодом: ${code}`)
					console.log(`📤 Вывод Whisper (stdout): ${output.substring(0, 500)}`)
					if (errorOutput) {
						console.log(
							`📤 Вывод Whisper (stderr): ${errorOutput.substring(0, 500)}`,
						)
					}

					if (code === 0) {
						try {
							// Пробуем найти JSON в выводе (может быть смешанный вывод)
							const jsonMatch = output.trim().match(/\{[\s\S]*\}/)
							if (jsonMatch) {
								const result = JSON.parse(jsonMatch[0])
								console.log(
									`✅ Whisper распознал: "${result.text}" (язык: ${result.language || 'не указан'})`,
								)
								resolve(result)
							} else {
								console.error(
									`❌ Неверный формат ответа от Whisper. Вывод: ${output.substring(0, 500)}`,
								)
								resolve({
									success: false,
									error:
										'Неверный формат ответа от Whisper: ' +
										output.substring(0, 200),
								})
							}
						} catch (e) {
							console.error(
								`❌ Ошибка парсинга результата Whisper: ${e.message}`,
							)
							resolve({
								success: false,
								error:
									'Ошибка парсинга результата: ' + output.substring(0, 200),
							})
						}
					} else {
						// Пробуем найти JSON в errorOutput или output (ошибки тоже возвращаются как JSON)
						// Python может писать JSON в stdout даже при ошибках
						const combinedOutput = (output + errorOutput).trim()
						try {
							const jsonMatch = combinedOutput.match(/\{[\s\S]*\}/)
							if (jsonMatch) {
								const errorResult = JSON.parse(jsonMatch[0])
								resolve(errorResult)
							} else {
								resolve({
									success: false,
									error: combinedOutput || 'Неизвестная ошибка',
								})
							}
						} catch (e) {
							resolve({
								success: false,
								error: combinedOutput || 'Неизвестная ошибка',
							})
						}
					}
				})

				recognizeProcess.on('error', error => {
					try {
						fs.unlinkSync(tempFile)
					} catch (e) {
						// Игнорируем ошибки удаления
					}
					resolve({ success: false, error: error.message })
				})
			})
		} catch (error) {
			return { success: false, error: error.message }
		}
	},
)

electron_1.ipcMain.handle('windows-speech-init', async () => {
	try {
		// Проверяем, что мы на Windows
		if (process.platform !== 'win32') {
			return {
				error: 'NOT_WINDOWS',
				message: 'Windows Speech Recognition доступен только на Windows',
			}
		}
		return { success: true }
	} catch (error) {
		console.error('Windows Speech init error:', error)
		return { error: error.message || 'UNKNOWN_ERROR' }
	}
})
electron_1.ipcMain.handle(
	'windows-speech-start',
	async (event, language = 'ru-RU') => {
		try {
			if (isWindowsSpeechListening) {
				return { success: true, message: 'Уже слушает' }
			}

			// Проверяем доступные распознаватели речи через PowerShell и пробуем разные форматы
			let actualLanguage = language
			if (language && language.toLowerCase().startsWith('ru')) {
				// Для русского языка пробуем найти рабочий формат
				const russianFormats = [
					{ format: 'ru-RU', code: '1049', name: 'Russian' },
					{ format: 'ru', code: '1049', name: 'Russian' },
					{ format: '1049', code: '1049', name: 'Russian' },
					{ format: 'Russian', code: '1049', name: 'Russian' },
				]

				const child_process_2 = require('child_process')
				const util_1 = require('util')
				const execAsync = util_1.promisify(child_process_2.exec)

				for (const langFormat of russianFormats) {
					try {
						const checkCommand = `powershell -Command "Add-Type -AssemblyName System.Speech; try { $culture = New-Object System.Globalization.CultureInfo('${langFormat.format}'); $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine($culture); Write-Output 'OK' } catch { Write-Output 'NOT_FOUND' }"`
						const { stdout } = await execAsync(checkCommand)

						if (stdout && stdout.includes('OK')) {
							console.log(
								'✅ Найден рабочий формат для русского языка:',
								langFormat.format,
							)
							actualLanguage = langFormat.format
							break
						}
					} catch (checkError) {
						console.log(
							'⚠️ Формат',
							langFormat.format,
							'не сработал, пробуем следующий...',
						)
					}
				}
			}

			console.log('📝 Используем язык для SAPI:', actualLanguage)

			// Используем PowerShell скрипт для локального распознавания речи (работает с русским языком)
			const fs = require('fs')

			// Пробуем найти PowerShell скрипт в разных местах
			const possibleScriptPaths = [
				path.join(__dirname, '../SapiRecognition.ps1'),
				path.join(process.cwd(), 'SapiRecognition.ps1'),
				path.join(__dirname, '../../SapiRecognition.ps1'),
			]

			let scriptPath = null
			for (const script of possibleScriptPaths) {
				if (fs.existsSync(script)) {
					scriptPath = script
					console.log('✅ Найден SapiRecognition.ps1:', script)
					break
				}
			}

			if (!scriptPath) {
				console.error('❌ SapiRecognition.ps1 не найден в следующих местах:')
				possibleScriptPaths.forEach(p => console.error('  -', p))
				return {
					error: 'SAPI_SCRIPT_NOT_FOUND',
					message:
						'SapiRecognition.ps1 не найден. Убедитесь, что файл находится в корне проекта.',
				}
			}

			// Запускаем PowerShell скрипт
			const powershellCommand = `powershell.exe -ExecutionPolicy Bypass -File "${scriptPath}" -Language "${actualLanguage}"`
			console.log('🚀 Запускаем PowerShell скрипт:', powershellCommand)

			windowsSpeechProcess = (0, child_process_1.spawn)(
				'powershell.exe',
				[
					'-ExecutionPolicy',
					'Bypass',
					'-File',
					scriptPath,
					'-Language',
					actualLanguage,
				],
				{
					stdio: ['ignore', 'pipe', 'pipe'],
					detached: false,
					shell: false,
				},
			)

			// Обработка вывода процесса
			windowsSpeechProcess.stdout?.on('data', data => {
				const output = data.toString()
				console.log('SAPI stdout:', output)
				// Если есть ошибка в выводе, отправляем её в renderer
				if (
					output.includes('error') ||
					output.includes('Error') ||
					output.includes('ERROR')
				) {
					if (mainWindow && !mainWindow.isDestroyed()) {
						mainWindow.webContents.send('sapi-result', {
							type: 'error',
							error: output.trim(),
							timestamp: Date.now(),
						})
					}
				}
			})

			windowsSpeechProcess.stderr?.on('data', data => {
				const error = data.toString()
				console.error('SAPI stderr:', error)
				// Отправляем ошибку в renderer
				if (mainWindow && !mainWindow.isDestroyed()) {
					mainWindow.webContents.send('sapi-result', {
						type: 'error',
						error: error.trim(),
						timestamp: Date.now(),
					})
				}
			})

			windowsSpeechProcess.on('exit', code => {
				console.log('SAPI process exited with code:', code)
				windowsSpeechProcess = null
				isWindowsSpeechListening = false
			})

			// Отправляем команду start с языком в PowerShell скрипт
			const controlFile = path.join(
				os.homedir(),
				'AppData',
				'Roaming',
				'Nexa',
				'sapi_control.txt',
			)
			const controlDir = path.dirname(controlFile)
			if (!fs.existsSync(controlDir)) {
				fs.mkdirSync(controlDir, { recursive: true })
			}

			// PowerShell скрипт принимает язык напрямую через параметр, но также читает команды из файла
			// Отправляем команду start с языком
			const controlCommand = actualLanguage
				? `start:${actualLanguage}`
				: 'start'
			fs.writeFileSync(controlFile, controlCommand)
			console.log(
				'📝 Отправлена команда в PowerShell скрипт:',
				controlCommand,
				'для языка:',
				actualLanguage,
			)

			isWindowsSpeechListening = true

			// Запускаем мониторинг результатов
			startSapiResultMonitor(event)

			return { success: true }
		} catch (error) {
			console.error('Windows Speech start error:', error)
			isWindowsSpeechListening = false
			if (windowsSpeechProcess) {
				windowsSpeechProcess.kill()
				windowsSpeechProcess = null
			}
			return { error: error.message || 'UNKNOWN_ERROR' }
		}
	},
)

// Мониторинг результатов SAPI
let sapiMonitorInterval = null
function startSapiResultMonitor(event) {
	if (sapiMonitorInterval) {
		clearInterval(sapiMonitorInterval)
	}

	const outputFile = path.join(
		os.homedir(),
		'AppData',
		'Roaming',
		'Nexa',
		'sapi_output.json',
	)
	const fs = require('fs')

	sapiMonitorInterval = setInterval(() => {
		try {
			if (fs.existsSync(outputFile)) {
				const content = fs.readFileSync(outputFile, 'utf-8')
				if (content) {
					const data = JSON.parse(content)

					// Отправляем результат в renderer
					if (mainWindow && !mainWindow.isDestroyed()) {
						mainWindow.webContents.send('sapi-result', data)
					}

					// Очищаем файл после чтения
					fs.writeFileSync(outputFile, '')
				}
			}
		} catch (err) {
			// Игнорируем ошибки чтения
		}
	}, 100) // Проверяем каждые 100ms
}

function stopSapiResultMonitor() {
	if (sapiMonitorInterval) {
		clearInterval(sapiMonitorInterval)
		sapiMonitorInterval = null
	}
}
electron_1.ipcMain.handle('windows-speech-stop', () => {
	try {
		stopSapiResultMonitor()

		// Отправляем команду stop
		const controlFile = path.join(
			os.homedir(),
			'AppData',
			'Roaming',
			'Nexa',
			'sapi_control.txt',
		)
		const fs = require('fs')
		if (fs.existsSync(path.dirname(controlFile))) {
			fs.writeFileSync(controlFile, 'stop')
		}

		if (windowsSpeechProcess) {
			// Даем процессу время остановиться
			setTimeout(() => {
				if (windowsSpeechProcess && !windowsSpeechProcess.killed) {
					windowsSpeechProcess.kill()
				}
				windowsSpeechProcess = null
			}, 500)
		}

		isWindowsSpeechListening = false
		return { success: true }
	} catch (error) {
		console.error('Windows Speech stop error:', error)
		return { error: error.message || 'UNKNOWN_ERROR' }
	}
})
// Система: dist/platform/index.js → darwin.js | win32.js | linux.js
function platformCall(fn, fallback) {
	return async (...args) => {
		try {
			if (typeof platform[fn] === 'function') return await platform[fn](...args)
			return fallback ? fallback() : { error: 'Функция не поддерживается' }
		} catch (error) {
			console.error('platform.' + fn + ':', error)
			return { error: error.message || String(error) }
		}
	}
}

electron_1.ipcMain.handle('system-open-app', platformCall('openApp'))
electron_1.ipcMain.handle('system-launch-file', platformCall('openFile'))
electron_1.ipcMain.handle('system-open-folder-smart', platformCall('openFolderSmart'))
electron_1.ipcMain.handle('system-close-app', platformCall('closeApp'))
electron_1.ipcMain.handle('system-minimize-app', platformCall('minimizeApp'))
electron_1.ipcMain.handle('get-installed-apps', platformCall('listInstalledApps', async () => ({ success: true, apps: [] })))
electron_1.ipcMain.handle('system-exec-powershell', platformCall('execShell'))
electron_1.ipcMain.handle('get-installed-browsers', async () => {
	const list = await platform.listBrowsers()
	return { success: true, browsers: list }
})
electron_1.ipcMain.handle('system-maximize-window', platformCall('maximizeWindow'))
electron_1.ipcMain.handle('system-minimize-window', platformCall('minimizeWindow'))
electron_1.ipcMain.handle('system-close-window', platformCall('closeWindow'))
electron_1.ipcMain.handle('system-wait', async (event, milliseconds) => {
	return new Promise(resolve => {
		setTimeout(() => {
			resolve({ success: true, message: `Ожидание ${milliseconds}мс завершено` })
		}, milliseconds)
	})
})
electron_1.ipcMain.handle('browser-open-url', platformCall('openUrl'))
electron_1.ipcMain.handle('browser-search', platformCall('search'))
electron_1.ipcMain.handle('browser-new-tab', platformCall('newTab'))
electron_1.ipcMain.handle('browser-close-tab', platformCall('closeTab'))
electron_1.ipcMain.handle('browser-refresh', platformCall('refresh'))
electron_1.ipcMain.handle('browser-go-back', platformCall('goBack'))
electron_1.ipcMain.handle('browser-go-forward', platformCall('goForward'))
electron_1.ipcMain.handle('browser-get-url', platformCall('getUrl'))
electron_1.ipcMain.handle('system-send-keys', platformCall('sendKeys'))
electron_1.ipcMain.handle('system-click', (e, x, y, b) => platformCall('click')(x, y, b))
electron_1.ipcMain.handle('system-mouse-down', (e, x, y, b) =>
	platformCall('mouseDown')(x, y, b),
)
electron_1.ipcMain.handle('system-mouse-up', (e, b) => platformCall('mouseUp')(b))
electron_1.ipcMain.handle('system-move-mouse', (e, x, y) => platformCall('moveMouse')(x, y))
electron_1.ipcMain.handle('system-scroll', (e, x, y, d, dir) =>
	platformCall('scroll')(x, y, d, dir),
)
electron_1.ipcMain.handle('system-double-click', (e, x, y) =>
	platformCall('doubleClick')(x, y),
)
electron_1.ipcMain.handle('system-get-screen-size', platformCall('getScreenSize'))

electron_1.ipcMain.handle('get-current-user-info', async () => {
	try {
		if (mainWindow && !mainWindow.isDestroyed()) {
			const result = await mainWindow.webContents.executeJavaScript(`
                (function() {
                    var tid = null;
                    try { if (typeof CREATOR_TELEGRAM_ID !== 'undefined' && CREATOR_TELEGRAM_ID) tid = String(CREATOR_TELEGRAM_ID); } catch (e) {}
                    var uname = null;
                    try { if (typeof profile !== 'undefined' && profile && profile.name) uname = profile.name; } catch (e) {}
                    if (!uname) { try { uname = JSON.parse(localStorage.getItem('profile') || '{}').name || null; } catch (e2) {} }
                    const role = typeof getCurrentUserRole === 'function' ? getCurrentUserRole() : 'user';
                    return { telegramId: tid, username: uname, role: role || 'user' };
                })();
            `)
			return { success: true, ...result }
		}
		return { success: false, error: 'Главное окно не найдено' }
	} catch (error) {
		console.error('Ошибка получения информации о пользователе:', error)
		return { success: false, error: error.message }
	}
})

// Telegram (MTProto / GramJS): см. dist/telegram-user-bridge.cjs — обработчики должны регистрироваться всегда (ленивый require GramJS внутри моста).
try {
	const { registerTelegramUserHandlers } = require(
		path.join(__dirname, 'telegram-user-bridge.cjs'),
	)
	registerTelegramUserHandlers(electron_1.ipcMain, () =>
		electron_1.app.getPath('userData'),
	)
	console.log('[nexa] Telegram user IPC registered')
} catch (e) {
	console.error('[nexa] Telegram user IPC registration failed:', e)
}
