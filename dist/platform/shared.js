'use strict'

const path = require('path')
const fs = require('fs')
const os = require('os')

/** Имя из IPC: пробелы могут приходить как %20. URL не трогаем. */
function normalizeAppNameFromIpc(s) {
	const t = String(s || '').trim()
	if (!t) return t
	if (/^https?:\/\//i.test(t) || /^file:\/\//i.test(t)) return t
	return t.replace(/%20/gi, ' ')
}

function expandHome(input) {
	if (!input || typeof input !== 'string') return ''
	let s = input.trim()
	if (s === '~' || s === '~/') return os.homedir()
	if (s.startsWith('~/') || s.startsWith('~\\')) return path.join(os.homedir(), s.slice(2))
	return s
}

function compactKey(s) {
	return String(s || '')
		.toLowerCase()
		.replace(/\.(exe|app|desktop)$/i, '')
		.replace(/['"`\r\n]/g, '')
		.replace(/[^a-z0-9\u0400-\u04FF]+/gi, '')
}

function scoreMatch(query, candidate) {
	const q = compactKey(query)
	const c = compactKey(candidate)
	if (!q || !c) return 0
	if (c === q) return 100
	if (c.includes(q) || q.includes(c)) return 80
	if (c.startsWith(q) || q.startsWith(c)) return 70
	const qw = q.match(/[a-z0-9\u0400-\u04FF]+/gi) || []
	let hits = 0
	for (const w of qw) {
		if (w.length >= 2 && c.includes(w)) hits++
	}
	return hits > 0 ? 40 + hits * 10 : 0
}

function findBestMatch(query, items, getLabel) {
	let best = null
	let bestScore = 0
	for (const item of items) {
		const labels = getLabel(item)
		for (const label of labels) {
			const sc = scoreMatch(query, label)
			if (sc > bestScore) {
				bestScore = sc
				best = item
			}
		}
	}
	return bestScore >= 40 ? best : null
}

function shellQuote(arg) {
	return `"${String(arg).replace(/"/g, '\\"')}"`
}

module.exports = {
	normalizeAppNameFromIpc,
	expandHome,
	compactKey,
	scoreMatch,
	findBestMatch,
	shellQuote,
}
