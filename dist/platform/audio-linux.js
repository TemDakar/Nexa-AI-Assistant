'use strict'

const { exec } = require('child_process')
const { promisify } = require('util')

const execAsync = promisify(exec)

async function getVolume() {
	try {
		const { stdout } = await execAsync(
			"pactl get-sink-volume @DEFAULT_SINK@ 2>/dev/null | head -1",
			{ timeout: 5000 },
		)
		const m = String(stdout).match(/(\d+)%/)
		if (m) return { success: true, volume: parseInt(m[1], 10) }
	} catch (_) {
		/* pactl */
	}
	try {
		const { stdout } = await execAsync(
			"amixer get Master 2>/dev/null | grep -oP '\\d+%' | tail -1",
			{ timeout: 5000 },
		)
		const m = String(stdout).match(/(\d+)%/)
		if (m) return { success: true, volume: parseInt(m[1], 10) }
	} catch (_) {
		/* amixer */
	}
	return { success: true, volume: 50 }
}

async function setVolume(volume) {
	const v = Math.max(0, Math.min(100, Math.round(Number(volume) || 0)))
	try {
		await execAsync(`pactl set-sink-volume @DEFAULT_SINK@ ${v}%`, { timeout: 5000 })
		return { success: true, volume: v }
	} catch (_) {
		/* */
	}
	try {
		await execAsync(`amixer set Master ${v}%`, { timeout: 5000 })
		return { success: true, volume: v }
	} catch (e) {
		return { error: `Не удалось изменить громкость: ${e.message}` }
	}
}

async function increaseVolume(step = 10) {
	const cur = await getVolume()
	const s = Math.max(1, Math.min(100, Math.round(Number(step) || 10)))
	return setVolume(Math.min(100, (cur.volume || 50) + s))
}

async function decreaseVolume(step = 10) {
	const cur = await getVolume()
	const s = Math.max(1, Math.min(100, Math.round(Number(step) || 10)))
	return setVolume(Math.max(0, (cur.volume || 50) - s))
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
