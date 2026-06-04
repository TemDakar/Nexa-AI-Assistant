'use strict'

const { exec } = require('child_process')
const { promisify } = require('util')
const electron = require('electron')
const { shellQuote } = require('./shared')

const execAsync = promisify(exec)

async function xdo(args) {
	await execAsync(`xdotool ${args}`, { timeout: 8000 })
}

async function sendKeys(keys) {
	await xdo(`key ${shellQuote(String(keys || ''))}`)
	return { success: true, message: 'Клавиши отправлены' }
}

async function click(x, y, button = 'left') {
	await xdo(`mousemove ${x} ${y} click ${button === 'right' ? 3 : 1}`)
	return { success: true, message: `Клик (${x}, ${y})` }
}

async function mouseDown(x, y, button = 'left') {
	return click(x, y, button)
}

async function mouseUp() {
	return { success: true, message: 'OK' }
}

async function moveMouse(x, y) {
	await xdo(`mousemove ${x} ${y}`)
	return { success: true, message: `Мышь (${x}, ${y})` }
}

async function scroll(x, y, delta, direction = 'down') {
	const btn = direction === 'up' ? 4 : 5
	const n = Math.min(20, Math.max(1, Math.abs(delta || 1)))
	await xdo(`mousemove ${x} ${y}`)
	for (let i = 0; i < n; i++) await xdo(`click ${btn}`)
	return { success: true, message: `Прокрутка ${direction}` }
}

async function doubleClick(x, y) {
	await xdo(`mousemove ${x} ${y} click --repeat 2 1`)
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
