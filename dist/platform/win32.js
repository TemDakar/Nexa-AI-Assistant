'use strict'

const { exec } = require('child_process')
const { promisify } = require('util')

const apps = require('./apps-win32')
const audio = require('./audio-win32')
const windows = require('./windows-win32')
const { createBrowserApi } = require('./browser-win32')
const input = require('./input-win32')

const execAsync = promisify(exec)
const browser = createBrowserApi(
	() => apps.listBrowsers(),
	name => apps.findExecutableLoose?.(name),
)

async function closeApp(appName) {
	return windows.closeApp(appName, n => apps.findExecutableLoose?.(n))
}

async function minimizeApp(appName) {
	return windows.minimizeApp(appName)
}

async function execShell(command) {
	const full = `powershell -Command "${String(command || '').replace(/"/g, '\\"')}"`
	const { stdout, stderr } = await execAsync(full)
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
