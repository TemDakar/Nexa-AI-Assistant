'use strict'

const path = require('path')
const fs = require('fs')
const os = require('os')
const { exec, spawn } = require('child_process')
const { promisify } = require('util')
const electron = require('electron')
const {
	normalizeAppNameFromIpc,
	expandHome,
	findBestMatch,
	shellQuote,
} = require('./shared')

const execAsync = promisify(exec)

const LINUX_ALIASES = {
	калькулятор: 'gnome-calculator',
	блокнот: 'gedit',
	терминал: 'gnome-terminal',
	файлы: 'nautilus',
	проводник: 'nautilus',
	настройки: 'gnome-control-center',
	хром: 'google-chrome',
	'гугл хром': 'google-chrome',
	файрфокс: 'firefox',
	телеграм: 'telegram-desktop',
	дискорд: 'discord',
	спотифай: 'spotify',
	вскод: 'code',
	'vs code': 'code',
}

let catalogCache = null
let catalogTime = 0
const CACHE_MS = 5 * 60 * 1000

function desktopDirs() {
	const home = os.homedir()
	const dirs = [
		'/usr/share/applications',
		'/usr/local/share/applications',
		'/var/lib/flatpak/exports/share/applications',
		'/var/lib/snapd/desktop/applications',
		path.join(home, '.local/share/applications'),
		path.join(home, 'snap', 'current', '.local', 'share', 'applications'),
	]
	return dirs.filter(d => fs.existsSync(d))
}

function parseDesktopFile(filePath, content) {
	const data = { id: path.basename(filePath, '.desktop'), filePath, labels: [], exec: null, hidden: false }
	const lines = content.split(/\r?\n/)
	let section = 'desktop entry'
	for (const line of lines) {
		const t = line.trim()
		if (!t || t.startsWith('#')) continue
		if (t.startsWith('[') && t.endsWith(']')) {
			section = t.slice(1, -1).toLowerCase()
			continue
		}
		if (section !== 'desktop entry') continue
		const eq = t.indexOf('=')
		if (eq === -1) continue
		const key = t.slice(0, eq).trim()
		const val = t.slice(eq + 1).trim()
		if (key === 'NoDisplay' || key === 'Hidden') {
			if (val === 'true' || val === '1') data.hidden = true
		}
		if (key === 'Type' && val !== 'Application') data.hidden = true
		if (key === 'Exec') data.exec = val
		if (key === 'Name') data.name = val
		if (key.startsWith('Name[')) data.labels.push(val)
	}
	if (data.name) data.labels.unshift(data.name)
	if (data.id) data.labels.push(data.id.replace(/\.desktop$/i, ''))
	return data
}

function loadCatalog(force) {
	const now = Date.now()
	if (!force && catalogCache && now - catalogTime < CACHE_MS) return catalogCache
	const apps = []
	const seen = new Set()
	for (const dir of desktopDirs()) {
		let files = []
		try {
			files = fs.readdirSync(dir).filter(f => f.endsWith('.desktop'))
		} catch {
			continue
		}
		for (const file of files) {
			const filePath = path.join(dir, file)
			if (seen.has(filePath)) continue
			seen.add(filePath)
			let content = ''
			try {
				content = fs.readFileSync(filePath, 'utf8')
			} catch {
				continue
			}
			const entry = parseDesktopFile(filePath, content)
			if (entry.hidden || !entry.exec) continue
			entry.exec = entry.exec
				.replace(/%[fFuUdDnNickvm]/g, '')
				.replace(/\s+/g, ' ')
				.trim()
			entry.name = entry.name || entry.id
			apps.push(entry)
		}
	}
	catalogCache = apps
	catalogTime = now
	return apps
}

function spawnDetached(cmd, args) {
	const child = spawn(cmd, args, { detached: true, stdio: 'ignore' })
	child.unref()
}

async function tryGtkLaunch(desktopId) {
	try {
		await execAsync(`gtk-launch ${shellQuote(desktopId)}`, { timeout: 10000 })
		return true
	} catch {
		return false
	}
}

async function runExecLine(execLine) {
	const parts = execLine.match(/(?:[^\s"]+|"[^"]*")+/g) || []
	const args = parts.map(p => p.replace(/^"|"$/g, ''))
	if (!args.length) throw new Error('Пустая команда Exec')
	spawnDetached(args[0], args.slice(1))
}

async function openApp(rawName) {
	const appName = normalizeAppNameFromIpc(rawName)
	if (!appName) return { error: 'Пустое имя приложения' }

	if (/^https?:\/\//i.test(appName) || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(appName)) {
		await electron.shell.openExternal(appName)
		return { success: true, message: 'Открыто' }
	}

	const target = expandHome(appName)
	if (fs.existsSync(target)) {
		const err = await electron.shell.openPath(target)
		if (!err) return { success: true, message: `Открыто: ${path.basename(target)}` }
	}

	const alias = LINUX_ALIASES[appName.toLowerCase()]
	const query = alias || appName
	const catalog = loadCatalog()
	const match = findBestMatch(query, catalog, a => a.labels)

	if (match) {
		try {
			if (await tryGtkLaunch(match.id)) {
				return { success: true, message: `Запущено: ${match.name}` }
			}
			await runExecLine(match.exec)
			return { success: true, message: `Запущено: ${match.name}` }
		} catch (e) {
			return { error: `Не удалось запустить «${match.name}»: ${e.message}` }
		}
	}

	try {
		await execAsync(`xdg-open ${shellQuote(query)}`, { timeout: 15000 })
		return { success: true, message: `Запущено: ${query}` }
	} catch (e1) {
		try {
			const { stdout } = await execAsync(`which ${shellQuote(query)}`, { timeout: 5000 })
			const bin = stdout.trim().split('\n')[0]
			if (bin) {
				spawnDetached(bin, [])
				return { success: true, message: `Запущено: ${path.basename(bin)}` }
			}
		} catch (_) {
			/* ignore */
		}
		return {
			error: `Приложение «${appName}» не найдено. Установите его или укажите имя из меню приложений.`,
		}
	}
}

async function openFile(filePath) {
	const expanded = expandHome(filePath)
	const err = await electron.shell.openPath(expanded)
	if (err) return { error: err }
	return { success: true, message: 'Открыто' }
}

async function openFolderSmart(raw) {
	const rawInput = (raw || '').trim()
	if (!rawInput) return { error: 'Пустое имя папки' }
	const xdg = name => process.env[name] || ''
	const dirs = [
		path.join(os.homedir(), 'Desktop', rawInput),
		path.join(os.homedir(), 'Documents', rawInput),
		path.join(os.homedir(), 'Downloads', rawInput),
		path.join(xdg('XDG_DESKTOP_DIR') || path.join(os.homedir(), 'Desktop'), rawInput),
	]
	for (const p of dirs) {
		if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
			const err = await electron.shell.openPath(p)
			if (!err) return { success: true, message: `Открыто: ${p}` }
		}
	}
	return { error: `Папка «${rawInput}» не найдена` }
}

async function listInstalledApps() {
	return {
		success: true,
		apps: loadCatalog().map(a => ({ id: a.id, name: a.name, exec: a.exec })),
	}
}

async function listBrowsers() {
	const catalog = loadCatalog()
	const browsers = catalog.filter(
		a =>
			/firefox|chrome|chromium|brave|opera|edge|vivaldi|yandex/i.test(a.id) ||
			/браузер|browser/i.test((a.name || '') + a.id),
	)
	return browsers.map(a => ({
		id: a.id,
		name: a.name,
		command: a.exec,
	}))
}

module.exports = {
	openApp,
	openFile,
	openFolderSmart,
	listInstalledApps,
	listBrowsers,
	loadCatalog,
}
