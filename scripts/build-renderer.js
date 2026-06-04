#!/usr/bin/env node
/**
 * Сборка Vue UI, если есть папка vue/. Иначе используется готовый renderer/.
 */

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const VUE_PKG = path.join(ROOT, 'vue', 'package.json')

if (!fs.existsSync(VUE_PKG)) {
	console.log('vue/ не найден — используется готовый renderer/')
	process.exit(0)
}

console.log('==> Сборка Vue (vue/)')
const r = spawnSync('npm', ['--prefix', 'vue', 'run', 'build'], {
	cwd: ROOT,
	stdio: 'inherit',
	shell: process.platform === 'win32',
})
process.exit(r.status == null ? 1 : r.status)
