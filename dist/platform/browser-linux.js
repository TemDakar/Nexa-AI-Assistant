'use strict'

const { exec, spawn } = require('child_process')
const { promisify } = require('util')
const electron = require('electron')
const { searchUrl, pickBrowser } = require('./browser-shared')
const { shellQuote } = require('./shared')

const execAsync = promisify(exec)

function createBrowserApi(listBrowsers) {
	async function openInBrowser(url, browserHint) {
		const picked = await pickBrowser(listBrowsers, browserHint)
		if (picked && picked.id) {
			try {
				await execAsync(`gtk-launch ${shellQuote(picked.id)} ${shellQuote(url)}`, {
					timeout: 15000,
				})
				return { success: true, message: `Открыто в ${picked.name}` }
			} catch (_) {
				if (picked.exec) {
					const parts = picked.exec.split(/\s+/)
					spawn(parts[0], [...parts.slice(1), url], {
						detached: true,
						stdio: 'ignore',
					}).unref()
					return { success: true, message: `Открыто в ${picked.name}` }
				}
			}
		}
		await execAsync(`xdg-open ${shellQuote(url)}`, { timeout: 15000 })
		return { success: true, message: 'Открыто в браузере по умолчанию' }
	}

	async function sendKeys(keys) {
		await execAsync(`xdotool key ${shellQuote(keys)}`, { timeout: 5000 })
		return { success: true, message: 'Команда отправлена' }
	}

	return {
		openUrl: (url, b) => openInBrowser(url, b),
		search: (q, b) => openInBrowser(searchUrl(q), b),
		newTab: (url, b) => openInBrowser(url || 'https://', b),
		closeTab: () => sendKeys('ctrl+w'),
		refresh: () => sendKeys('F5'),
		goBack: () => sendKeys('alt+Left'),
		goForward: () => sendKeys('alt+Right'),
		getUrl: async () => {
			await sendKeys('ctrl+l')
			await new Promise(r => setTimeout(r, 120))
			await sendKeys('ctrl+c')
			return { success: true, url: 'URL в буфере обмена' }
		},
	}
}

module.exports = { createBrowserApi }
