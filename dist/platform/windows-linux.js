'use strict'

const { exec } = require('child_process')
const { promisify } = require('util')
const { findBestMatch } = require('./shared')

const execAsync = promisify(exec)

async function runCmd(cmd) {
	await execAsync(cmd, { timeout: 15000 })
}

async function withWmctrl(args) {
	return runCmd(`wmctrl ${args}`)
}

async function withXdotool(args) {
	return runCmd(`xdotool ${args}`)
}

async function focusWindow(title) {
	const t = String(title || '').replace(/"/g, '\\"')
	try {
		await withWmctrl(`-a "${t}"`)
		return true
	} catch (_) {
		try {
			const id = (
				await execAsync(`xdotool search --name "${t}" 2>/dev/null | head -1`)
			).stdout.trim()
			if (id) {
				await withXdotool(`windowactivate ${id}`)
				return true
			}
		} catch (_e) {
			/* */
		}
	}
	return false
}

async function maximizeWindow(windowTitle) {
	await focusWindow(windowTitle)
	try {
		await withWmctrl('-r :ACTIVE: -b add,maximized_vert,maximized_horz')
	} catch (_) {
		await withXdotool('key super+Up')
	}
	return { success: true, message: `Окно «${windowTitle}» развернуто` }
}

async function minimizeWindow(windowTitle) {
	await focusWindow(windowTitle)
	try {
		await withWmctrl('-r :ACTIVE: -b add,hidden')
	} catch (_) {
		await withXdotool('key super+Down')
	}
	return { success: true, message: `Окно «${windowTitle}» свернуто` }
}

async function closeWindow(windowTitle) {
	await focusWindow(windowTitle)
	try {
		await withWmctrl('-r :ACTIVE: -c')
	} catch (_) {
		await withXdotool('key alt+F4')
	}
	return { success: true, message: `Окно «${windowTitle}» закрыто` }
}

async function closeApp(appName, loadCatalog) {
	const catalog = loadCatalog ? loadCatalog() : []
	const match = catalog.length
		? findBestMatch(appName, catalog, a => a.labels)
		: null
	const id = match ? match.id : String(appName || '').trim()
	try {
		await runCmd(`pkill -x "${id}" || pkill -f "${id}"`)
		return { success: true, message: `Приложение «${id}» закрыто` }
	} catch (e) {
		return { error: `Не удалось закрыть «${appName}»: ${e.message}` }
	}
}

async function minimizeApp(appName, loadCatalog) {
	const catalog = loadCatalog ? loadCatalog() : []
	const match = catalog.length
		? findBestMatch(appName, catalog, a => a.labels)
		: null
	const label = match ? match.name : String(appName || '').trim()
	return minimizeWindow(label)
}

module.exports = {
	maximizeWindow,
	minimizeWindow,
	closeWindow,
	closeApp,
	minimizeApp,
}
