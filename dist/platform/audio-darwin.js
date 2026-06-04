'use strict'

const { exec } = require('child_process')
const { promisify } = require('util')

const execAsync = promisify(exec)

async function getVolume() {
	const { stdout } = await execAsync(
		"osascript -e 'output volume of (get volume settings)'",
	)
	const v = parseInt(String(stdout).trim(), 10)
	return {
		success: true,
		volume: isNaN(v) ? 50 : Math.min(100, Math.max(0, v)),
	}
}

async function setVolume(volume) {
	const clamped = Math.max(0, Math.min(100, Math.round(Number(volume) || 0)))
	await execAsync(`osascript -e 'set volume output volume ${clamped}'`)
	return { success: true, volume: clamped }
}

async function increaseVolume(step = 10) {
	const cur = await getVolume()
	const s = Math.max(1, Math.min(100, Math.round(Number(step) || 10)))
	const newVol = Math.min(100, (cur.volume || 50) + s)
	return setVolume(newVol)
}

async function decreaseVolume(step = 10) {
	const cur = await getVolume()
	const s = Math.max(1, Math.min(100, Math.round(Number(step) || 10)))
	const newVol = Math.max(0, (cur.volume || 50) - s)
	return setVolume(newVol)
}

async function muteVolume() {
	return setVolume(0)
}

module.exports = {
	getVolume,
	setVolume,
	increaseVolume,
	decreaseVolume,
	muteVolume,
}
