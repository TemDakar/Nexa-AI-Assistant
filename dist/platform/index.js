'use strict'

/**
 * Единая точка входа: под текущую ОС подключается свой файл
 * darwin.js | win32.js | linux.js
 */
const map = {
	darwin: './darwin',
	win32: './win32',
	linux: './linux',
}

const key = map[process.platform]
if (!key) {
	module.exports = {
		openApp: async () => ({ error: `ОС ${process.platform} не поддерживается` }),
		getVolume: async () => ({ error: `ОС ${process.platform} не поддерживается` }),
		search: async () => ({ error: `ОС ${process.platform} не поддерживается` }),
	}
} else {
	module.exports = require(key)
}
