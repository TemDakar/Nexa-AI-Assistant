'use strict'

function searchUrl(query) {
	const q = String(query || '').trim()
	if (!q) return 'https://www.google.com'
	if (/^https?:\/\//i.test(q)) return q
	return `https://www.google.com/search?q=${encodeURIComponent(q)}`
}

async function pickBrowser(listBrowsers, browserHint) {
	if (!browserHint) return null
	const list = await listBrowsers()
	const h = String(browserHint).toLowerCase().trim()
	return (
		list.find(
			b =>
				String(b.id || '').toLowerCase() === h ||
				String(b.name || '').toLowerCase().includes(h) ||
				h.includes(String(b.id || '').toLowerCase()),
		) || null
	)
}

module.exports = { searchUrl, pickBrowser }
