'use strict'

const { exec, execFile } = require('child_process')
const { promisify } = require('util')
const electron = require('electron')
const { searchUrl, pickBrowser } = require('./browser-shared')

const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)

function createBrowserApi(listBrowsers, findExecutable) {
	async function launchUrlWithBrowser(url, browserHint) {
		const picked = await pickBrowser(listBrowsers, browserHint)
		if (picked && picked.command) {
			const m = String(picked.command).match(/"([^"]+\.exe)"/i)
			const exe = m ? m[1] : null
			if (exe) {
				await execFileAsync('cmd.exe', ['/c', 'start', '', exe, url], {
					windowsHide: true,
				})
				return { success: true, message: `Открыто в ${picked.name}` }
			}
		}
		if (browserHint && findExecutable) {
			const exe = await findExecutable(browserHint)
			if (exe) {
				await execFileAsync('cmd.exe', ['/c', 'start', '', exe, url], {
					windowsHide: true,
				})
				return { success: true, message: `Открыто: ${browserHint}` }
			}
		}
		await electron.shell.openExternal(url)
		return { success: true, message: 'Открыто в браузере по умолчанию' }
	}

	async function sendKeys(keys) {
		const escaped = String(keys || '').replace(/'/g, "''")
		await execAsync(
			`powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${escaped}')"`,
			{ windowsHide: true },
		)
		return { success: true, message: 'Команда отправлена' }
	}

	return {
		openUrl: (url, b) => launchUrlWithBrowser(url, b),
		search: (q, b) => launchUrlWithBrowser(searchUrl(q), b),
		newTab: (url, b) => launchUrlWithBrowser(url || 'about:blank', b),
		closeTab: () => sendKeys('^w'),
		refresh: () => sendKeys('{F5}'),
		goBack: () => sendKeys('%{LEFT}'),
		goForward: () => sendKeys('%{RIGHT}'),
		getUrl: async () => {
			await sendKeys('^l')
			await new Promise(r => setTimeout(r, 120))
			await sendKeys('^c')
			return { success: true, url: 'URL в буфере обмена (Ctrl+C)' }
		},
	}
}

module.exports = { createBrowserApi }
