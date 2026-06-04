'use strict'

const electron = require('electron')
const { exec } = require('child_process')
const { promisify } = require('util')
const { searchUrl, pickBrowser } = require('./browser-shared')

const execAsync = promisify(exec)

function createBrowserApi(listBrowsers) {
	async function openInBrowser(url, browserHint) {
		const picked = await pickBrowser(listBrowsers, browserHint)
		if (picked && picked.command) {
			const m = String(picked.command).match(/open\s+-a\s+(.+)/i)
			if (m) {
				const app = m[1].trim().replace(/^["']|["']$/g, '')
				await execAsync(`open -a ${JSON.stringify(app)} ${JSON.stringify(url)}`)
				return { success: true, message: `Открыто в ${picked.name}` }
			}
		}
		if (browserHint) {
			const hint = String(browserHint).trim()
			try {
				await execAsync(`open -a ${JSON.stringify(hint)} ${JSON.stringify(url)}`)
				return { success: true, message: `Открыто в ${hint}` }
			} catch (_) {
				/* fallback */
			}
		}
		await electron.shell.openExternal(url)
		return { success: true, message: 'Открыто в браузере по умолчанию' }
	}

	async function openUrl(url, browser) {
		return openInBrowser(url, browser)
	}

	async function search(query, browser) {
		return openInBrowser(searchUrl(query), browser)
	}

	async function newTab(url, browser) {
		return openInBrowser(url || 'https://', browser)
	}

	async function sendKeys(keys) {
		const k = String(keys || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')
		await execAsync(
			`osascript -e 'tell application "System Events" to keystroke "${k}"'`,
		)
		return { success: true, message: 'Команда браузеру отправлена' }
	}

	async function closeTab() {
		return sendKeys('w', { command: true }) // use osascript with command down
	}

	async function closeTabFixed() {
		await execAsync(
			'osascript -e \'tell application "System Events" to keystroke "w" using command down\'',
		)
		return { success: true, message: 'Вкладка закрыта' }
	}

	async function refresh() {
		await execAsync(
			'osascript -e \'tell application "System Events" to keystroke "r" using command down\'',
		)
		return { success: true, message: 'Страница обновлена' }
	}

	async function goBack() {
		await execAsync(
			'osascript -e \'tell application "System Events" to keystroke "[" using command down\'',
		)
		return { success: true, message: 'Назад' }
	}

	async function goForward() {
		await execAsync(
			'osascript -e \'tell application "System Events" to keystroke "]" using command down\'',
		)
		return { success: true, message: 'Вперёд' }
	}

	async function getUrl() {
		await execAsync(
			'osascript -e \'tell application "System Events" to keystroke "l" using command down\'',
		)
		await new Promise(r => setTimeout(r, 150))
		await execAsync(
			'osascript -e \'tell application "System Events" to keystroke "c" using command down\'',
		)
		const { stdout } = await execAsync("osascript -e 'the clipboard'")
		return { success: true, url: (stdout || '').trim() }
	}

	return {
		openUrl,
		search,
		newTab,
		closeTab: closeTabFixed,
		refresh,
		goBack,
		goForward,
		getUrl,
	}
}

module.exports = { createBrowserApi }
