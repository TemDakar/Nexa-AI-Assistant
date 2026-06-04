'use strict'

const { exec } = require('child_process')
const { promisify } = require('util')

const apps = require('./apps-darwin')
const audio = require('./audio-darwin')
const windows = require('./windows-darwin')
const { createBrowserApi } = require('./browser-darwin')
const input = require('./input-darwin')

const execAsync = promisify(exec)
const browser = createBrowserApi(apps.listBrowsers)

async function closeApp(appName) {
	return windows.closeApp(appName, apps.loadCatalog)
}

async function minimizeApp(appName) {
	return windows.minimizeApp(appName, apps.loadCatalog)
}

async function execShell(command) {
	const escaped = String(command || '').replace(/"/g, '\\"')
	const { stdout, stderr } = await execAsync(`/bin/zsh -c "${escaped}"`, {
		timeout: 60000,
	})
	return {
		success: true,
		output: (stdout || stderr || 'OK').trim(),
		message: 'Команда выполнена',
	}
}

module.exports = {
	...audio,
	openApp: apps.openApp,
	openFile: apps.openFile,
	openFolderSmart: apps.openFolderSmart,
	listInstalledApps: apps.listInstalledApps,
	listBrowsers: apps.listBrowsers,
	closeApp,
	minimizeApp,
	maximizeWindow: windows.maximizeWindow,
	minimizeWindow: windows.minimizeWindow,
	closeWindow: windows.closeWindow,
	...browser,
	...input,
	execShell,
}
