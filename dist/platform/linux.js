'use strict'

const { exec } = require('child_process')
const { promisify } = require('util')

const apps = require('./apps-linux')
const audio = require('./audio-linux')
const windows = require('./windows-linux')
const { createBrowserApi } = require('./browser-linux')
const input = require('./input-linux')

const execAsync = promisify(exec)
const browser = createBrowserApi(apps.listBrowsers)

async function closeApp(appName) {
	return windows.closeApp(appName, apps.loadCatalog)
}

async function minimizeApp(appName) {
	return windows.minimizeApp(appName, apps.loadCatalog)
}

async function execShell(command) {
	const { stdout, stderr } = await execAsync(`/bin/bash -lc ${JSON.stringify(command)}`, {
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
