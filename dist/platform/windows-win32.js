'use strict'

const { exec } = require('child_process')
const { promisify } = require('util')
const { findBestMatch } = require('./shared')

const execAsync = promisify(exec)

function escPs(s) {
	return String(s || '').replace(/'/g, "''")
}

async function activateAndSend(windowTitle, keys) {
	const t = escPs(windowTitle)
	const k = escPs(keys)
	const script = `$wshell = New-Object -ComObject wscript.shell; if ($wshell.AppActivate('${t}')) { Start-Sleep -Milliseconds 150; [System.Windows.Forms.SendKeys]::SendWait('${k}') }`
	await execAsync(
		`powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; ${script}"`,
		{ windowsHide: true, timeout: 15000 },
	)
}

async function maximizeWindow(windowTitle) {
	await activateAndSend(windowTitle, '%{ENTER}')
	return { success: true, message: `Окно «${windowTitle}» развернуто` }
}

async function minimizeWindow(windowTitle) {
	await activateAndSend(windowTitle, '% n')
	return { success: true, message: `Окно «${windowTitle}» свернуто` }
}

async function closeWindow(windowTitle) {
	await activateAndSend(windowTitle, '%{F4}')
	return { success: true, message: `Окно «${windowTitle}» закрыто` }
}

async function closeApp(appName, findExecutable) {
	const name = String(appName || '').trim()
	let exe = null
	if (findExecutable) {
		exe = await findExecutable(name)
	}
	const script = exe
		? `Stop-Process -Name '${escPs(require('path').basename(exe).replace(/\.exe$/i, ''))}' -Force -ErrorAction SilentlyContinue`
		: `Get-Process | Where-Object { $_.MainWindowTitle -like '*${escPs(name)}*' -or $_.ProcessName -like '*${escPs(name)}*' } | Stop-Process -Force -ErrorAction SilentlyContinue`
	await execAsync(`powershell -NoProfile -Command "${script}"`, {
		windowsHide: true,
		timeout: 15000,
	})
	return { success: true, message: `Приложение «${name}» закрыто` }
}

async function minimizeApp(appName) {
	const name = escPs(appName)
	await execAsync(
		`powershell -NoProfile -Command "Get-Process | Where-Object { $_.MainWindowTitle -like '*${name}*' -or $_.ProcessName -like '*${name}*' } | ForEach-Object { (New-Object -ComObject WScript.Shell).AppActivate($_.Id); Start-Sleep -Milliseconds 100; [System.Windows.Forms.SendKeys]::SendWait('% n') }"`,
		{ windowsHide: true, timeout: 15000 },
	)
	return { success: true, message: `Приложение «${appName}» свернуто` }
}

module.exports = {
	maximizeWindow,
	minimizeWindow,
	closeWindow,
	closeApp,
	minimizeApp,
}
