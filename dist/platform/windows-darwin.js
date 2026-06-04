'use strict'

const { exec } = require('child_process')
const { promisify } = require('util')
const { findBestMatch } = require('./shared')

const execAsync = promisify(exec)

function esc(s) {
	return String(s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

async function runOsascript(script) {
	const escaped = script.replace(/'/g, "'\\''")
	await execAsync(`osascript -e '${escaped}'`)
}

async function focusProcess(nameFragment) {
	const title = esc(nameFragment)
	await runOsascript(
		`tell application "System Events" to set frontmost of first process whose name contains "${title}" to true`,
	)
}

async function maximizeWindow(windowTitle) {
	await focusProcess(windowTitle)
	await runOsascript(
		'tell application "System Events" to keystroke "f" using {command down, control down}',
	)
	return { success: true, message: `Окно «${windowTitle}» развернуто` }
}

async function minimizeWindow(windowTitle) {
	await focusProcess(windowTitle)
	await runOsascript(
		'tell application "System Events" to keystroke "m" using command down',
	)
	return { success: true, message: `Окно «${windowTitle}» свернуто` }
}

async function closeWindow(windowTitle) {
	await focusProcess(windowTitle)
	await runOsascript(
		'tell application "System Events" to keystroke "w" using command down',
	)
	return { success: true, message: `Окно «${windowTitle}» закрыто` }
}

/** Закрыть приложение целиком (не только вкладку/окно) */
async function closeApp(appName, loadCatalog) {
	const catalog = loadCatalog ? loadCatalog() : []
	const match = catalog.length
		? findBestMatch(appName, catalog, a => a.labels)
		: null
	const name = match ? match.bundle : String(appName || '').trim()
	await runOsascript(`tell application "${esc(name)}" to quit`)
	return { success: true, message: `Приложение «${name}» закрыто` }
}

async function minimizeApp(appName, loadCatalog) {
	const catalog = loadCatalog ? loadCatalog() : []
	const match = catalog.length
		? findBestMatch(appName, catalog, a => a.labels)
		: null
	const name = match ? match.bundle : String(appName || '').trim()
	await runOsascript(
		`tell application "System Events" to set visible of process "${esc(name)}" to false`,
	)
	return { success: true, message: `Приложение «${name}» свернуто` }
}

module.exports = {
	maximizeWindow,
	minimizeWindow,
	closeWindow,
	closeApp,
	minimizeApp,
}
