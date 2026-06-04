'use strict'

const { exec } = require('child_process')
const { promisify } = require('util')
const electron = require('electron')

const execAsync = promisify(exec)

async function sendKeys(keys) {
	const escaped = String(keys || '').replace(/'/g, "''")
	await execAsync(
		`powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${escaped}')"`,
		{ windowsHide: true },
	)
	return { success: true, message: 'Клавиши отправлены' }
}

async function runMousePs(body) {
	await execAsync(
		`powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; ${body}"`,
		{ windowsHide: true },
	)
}

async function click(x, y, button = 'left') {
	const down = button.toLowerCase() === 'right' ? '0x0008' : '0x0002'
	const up = button.toLowerCase() === 'right' ? '0x0010' : '0x0004'
	await runMousePs(
		`Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class M { [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y); [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint a, uint b, uint c, int d); public static void C(int x,int y,uint d,uint u){SetCursorPos(x,y);mouse_event(d,0,0,0,0);mouse_event(u,0,0,0,0);} }'; [M]::C(${x},${y},${down},${up})`,
	)
	return { success: true, message: `Клик (${x}, ${y})` }
}

async function mouseDown(x, y, button = 'left') {
	return click(x, y, button)
}

async function mouseUp(button = 'left') {
	const up = button.toLowerCase() === 'right' ? '0x0010' : '0x0004'
	await runMousePs(
		`Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class M { [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint a, uint b, uint c, int d); }'; [M]::mouse_event(${up},0,0,0,0)`,
	)
	return { success: true, message: 'OK' }
}

async function moveMouse(x, y) {
	await runMousePs(
		`Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class M { [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y); }'; [M]::SetCursorPos(${x},${y})`,
	)
	return { success: true, message: `Мышь (${x}, ${y})` }
}

async function scroll(x, y, delta, direction = 'down') {
	const scrollDelta =
		direction.toLowerCase() === 'up' ? -Math.abs(delta || 1) : Math.abs(delta || 1)
	await runMousePs(
		`Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class M { [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y); [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint a, uint b, uint c, int d); }'; [M]::SetCursorPos(${x},${y}); [M]::mouse_event(0x0800,0,0,${scrollDelta * 120},0)`,
	)
	return { success: true, message: `Прокрутка ${direction}` }
}

async function doubleClick(x, y) {
	await click(x, y, 'left')
	await new Promise(r => setTimeout(r, 50))
	await click(x, y, 'left')
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
