'use strict'

const path = require('path')
const fs = require('fs')
const os = require('os')
const { exec } = require('child_process')
const { promisify } = require('util')
const electron = require('electron')
const {
	normalizeAppNameFromIpc,
	expandHome,
	findBestMatch,
	shellQuote,
} = require('./shared')

const execAsync = promisify(exec)

const MAC_ALIASES = {
	калькулятор: 'Calculator',
	блокнот: 'TextEdit',
	настройки: 'System Settings',
	параметры: 'System Settings',
	'системные настройки': 'System Settings',
	терминал: 'Terminal',
	фото: 'Photos',
	почта: 'Mail',
	календарь: 'Calendar',
	музыка: 'Music',
	сафари: 'Safari',
	хром: 'Google Chrome',
	'гугл хром': 'Google Chrome',
	файрфокс: 'Firefox',
	телеграм: 'Telegram',
	дискорд: 'Discord',
	спотифай: 'Spotify',
	вскод: 'Visual Studio Code',
	'vs code': 'Visual Studio Code',
	код: 'Visual Studio Code',
}

let catalogCache = null
let catalogTime = 0
const CACHE_MS = 5 * 60 * 1000

function appDirs() {
	return [
		'/Applications',
		'/System/Applications',
		'/System/Applications/Utilities',
		path.join(os.homedir(), 'Applications'),
	].filter(d => fs.existsSync(d))
}

function readPlistName(appPath) {
	const plist = path.join(appPath, 'Contents', 'Info.plist')
	if (!fs.existsSync(plist)) return null
	const { execFileSync } = require('child_process')
	for (const key of ['CFBundleDisplayName', 'CFBundleName']) {
		try {
			const out = execFileSync(
				'/usr/libexec/PlistBuddy',
				['-c', `Print ${key}`, plist],
				{ encoding: 'utf8', timeout: 2000 },
			)
			if (out && out.trim()) return out.trim()
		} catch (_) {
			/* next key */
		}
	}
	return null
}

function loadCatalog(force) {
	const now = Date.now()
	if (!force && catalogCache && now - catalogTime < CACHE_MS) return catalogCache
	const apps = []
	const seen = new Set()
	for (const dir of appDirs()) {
		let entries = []
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true })
		} catch {
			continue
		}
		for (const ent of entries) {
			if (!ent.isDirectory() || !ent.name.endsWith('.app')) continue
			const appPath = path.join(dir, ent.name)
			if (seen.has(appPath)) continue
			seen.add(appPath)
			const bundle = ent.name.replace(/\.app$/i, '')
			const display = readPlistName(appPath) || bundle
			apps.push({
				id: bundle,
				name: display,
				bundle,
				path: appPath,
				labels: [display, bundle, ent.name],
			})
		}
	}
	catalogCache = apps
	catalogTime = now
	return apps
}

async function openApp(rawName) {
	const appName = normalizeAppNameFromIpc(rawName)
	if (!appName) return { error: 'Пустое имя приложения' }

	if (/^https?:\/\//i.test(appName) || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(appName)) {
		await electron.shell.openExternal(appName)
		return { success: true, message: 'Открыто' }
	}

	const target = expandHome(appName)
	if (
		path.isAbsolute(target) ||
		target.startsWith('.') ||
		target.includes(path.sep)
	) {
		const resolved = path.resolve(target)
		if (fs.existsSync(resolved)) {
			await execAsync(`open ${shellQuote(resolved)}`)
			return { success: true, message: `Открыто: ${path.basename(resolved)}` }
		}
	}

	const alias = MAC_ALIASES[appName.toLowerCase()]
	const query = alias || appName
	const catalog = loadCatalog()
	const match = findBestMatch(query, catalog, a => a.labels)
	const launchName = match ? match.bundle : query

	try {
		if (match && fs.existsSync(match.path)) {
			await execAsync(`open ${shellQuote(match.path)}`)
			return { success: true, message: `Запущено: ${match.name}` }
		}
		await execAsync(`open -a ${shellQuote(launchName)}`)
		return { success: true, message: `Приложение «${launchName}» открыто` }
	} catch (error) {
		return { error: `Не удалось открыть «${appName}»: ${error.message}` }
	}
}

async function openFile(filePath) {
	const expanded = expandHome(filePath)
	await execAsync(`open ${shellQuote(expanded)}`)
	return { success: true, message: 'Открыто' }
}

async function openFolderSmart(raw) {
	const rawInput = (raw || '').trim()
	if (!rawInput) return { error: 'Пустое имя папки' }
	const dirs = [
		path.join(os.homedir(), 'Desktop', rawInput),
		path.join(os.homedir(), 'Documents', rawInput),
		path.join(os.homedir(), 'Downloads', rawInput),
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
	return { success: true, apps: loadCatalog().map(a => ({ id: a.id, name: a.name, path: a.path })) }
}

async function listBrowsers() {
	const catalog = loadCatalog()
	const browserNames = [
		'Safari',
		'Google Chrome',
		'Firefox',
		'Microsoft Edge',
		'Opera',
		'Brave',
		'Arc',
		'Yandex',
	]
	const browsers = catalog
		.filter(a =>
			browserNames.some(b => a.name.includes(b) || a.bundle.includes(b.replace(/\s/g, ''))),
		)
		.map(a => ({
			id: a.bundle.toLowerCase().replace(/\s+/g, '-'),
			name: a.name,
			command: `open -a ${shellQuote(a.bundle)}`,
		}))
	if (browsers.length) return browsers
	return [
		{ id: 'safari', name: 'Safari', command: 'open -a Safari' },
		{ id: 'chrome', name: 'Google Chrome', command: 'open -a "Google Chrome"' },
		{ id: 'firefox', name: 'Firefox', command: 'open -a Firefox' },
	]
}

module.exports = {
	openApp,
	openFile,
	openFolderSmart,
	listInstalledApps,
	listBrowsers,
	loadCatalog,
}
