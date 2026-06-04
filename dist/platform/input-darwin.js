'use strict'

const { exec } = require('child_process')
const { promisify } = require('util')
const electron = require('electron')

const execAsync = promisify(exec)

async function runOsascript(script) {
	const escaped = script.replace(/'/g, "'\\''")
	await execAsync(`osascript -e '${escaped}'`)
}

async function sendKeys(keys) {
	const k = String(keys || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')
	await runOsascript(`tell application "System Events" to keystroke "${k}"`)
	return { success: true, message: 'Клавиши отправлены' }
}

async function click(x, y, button = 'left') {
	if (button && button.toLowerCase() === 'right') {
		await runOsascript(
			`tell application "System Events" to click at {${x}, ${y}} with right click`,
		)
	} else {
		await runOsascript(`tell application "System Events" to click at {${x}, ${y}}`)
	}
	return { success: true, message: `Клик (${x}, ${y})` }
}

async function mouseDown(x, y, button = 'left') {
	return click(x, y, button)
}

async function mouseUp() {
	return { success: true, message: 'OK' }
}

async function moveMouse(x, y) {
	await runOsascript(`tell application "System Events" to click at {${x}, ${y}}`)
	return { success: true, message: `Мышь (${x}, ${y})` }
}

async function scroll(x, y, delta, direction = 'down') {
	const times = Math.min(20, Math.max(1, Math.abs(delta || 1)))
	const keyCode = direction.toLowerCase() === 'up' ? 107 : 108
	for (let i = 0; i < times; i++) {
		await runOsascript(`tell application "System Events" to key code ${keyCode}`)
	}
	return { success: true, message: `Прокрутка ${direction}` }
}

async function doubleClick(x, y) {
	await runOsascript(`tell application "System Events" to click at {${x}, ${y}}`)
	await runOsascript('delay 0.05')
	await runOsascript(`tell application "System Events" to click at {${x}, ${y}}`)
	return { success: true, message: `Двойной клик (${x}, ${y})` }
}

async function getScreenSize() {
	const primary = electron.screen.getPrimaryDisplay()
	const bounds = primary.size || primary.bounds
	return { success: true, width: bounds.width, height: bounds.height }
}

module.exports = {
	sendKeys,
	click,
	mouseDown,
	mouseUp,
	moveMouse,
	scroll,
	doubleClick,
	getScreenSize,
}
