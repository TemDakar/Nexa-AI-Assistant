'use strict'

const { exec } = require('child_process')
const { promisify } = require('util')

const execAsync = promisify(exec)

async function readVolumeFromPs() {
	const cmd =
		'powershell -Command "Import-Module -Name AudioDeviceCmdlets -ErrorAction SilentlyContinue; (Get-AudioDevice -PlaybackVolume).Volume"'
	try {
		const { stdout } = await execAsync(cmd)
		const f = parseFloat(stdout.trim())
		if (!isNaN(f) && f >= 0 && f <= 1) return Math.round(f * 100)
		if (!isNaN(f) && f >= 0 && f <= 100) return Math.round(f)
	} catch (_) {
		/* */
	}
	return null
}

async function getVolume() {
	const v = await readVolumeFromPs()
	return { success: true, volume: v != null ? v : 50 }
}

async function setVolume(volume) {
	const clamped = Math.max(0, Math.min(100, Math.round(Number(volume) || 0)))
	const cmd = `powershell -Command "Import-Module -Name AudioDeviceCmdlets -ErrorAction SilentlyContinue; Set-AudioDevice -PlaybackVolume ${clamped}"`
	try {
		await execAsync(cmd)
		return { success: true, volume: clamped }
	} catch (e) {
		return {
			error:
				'Не удалось изменить громкость. Установите: Install-Module AudioDeviceCmdlets -Scope CurrentUser',
		}
	}
}

async function increaseVolume(step = 10) {
	const cur = (await getVolume()).volume || 50
	const s = Math.max(1, Math.min(100, Math.round(Number(step) || 10)))
	return setVolume(Math.min(100, cur + s))
}

async function decreaseVolume(step = 10) {
	const cur = (await getVolume()).volume || 50
	const s = Math.max(1, Math.min(100, Math.round(Number(step) || 10)))
	return setVolume(Math.max(0, cur - s))
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
