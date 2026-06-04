'use strict'
const path = require('path')
const fs = require('fs')
const os = require('os')
const { exec, execFile, spawn } = require('child_process')
const { promisify } = require('util')
const electron = require('electron')
const { normalizeAppNameFromIpc } = require('./shared')
const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)
function expandWindowsEnvPath(input) {
	if (!input || typeof input !== 'string') return ''
	let s = input.trim()
	if (s === '~' || s === '~/') return os.homedir()
	if (s.startsWith('~/') || s.startsWith('~\\'))
		return path.join(os.homedir(), s.slice(2))
	s = s.replace(/%([^%]+)%/g, (_, k) => process.env[k] || `%${k}%`)
	return s
}
const WIN_APP_ALIASES = {
	калькулятор: 'calc',
	блокнот: 'notepad',
	проводник: 'explorer',
	файлы: 'explorer',
	краска: 'mspaint',
	рисовалку: 'mspaint',
	вордпад: 'wordpad',
	'диспетчер задач': 'taskmgr',
	'task manager': 'taskmgr',
	параметры: 'ms-settings:',
	настройки: 'ms-settings:',
	'панель управления': 'control',
	реестр: 'regedit',
	службы: 'services.msc',
	'диспетчер устройств': 'devmgmt.msc',
	'командную строку': 'cmd',
	камера: 'microsoft.windows.camera:',
	// Русские имена → подсказка для поиска .exe (реестр App Paths, ярлыки, Program Files)
	винскп: 'winscp',
	'вин сцп': 'winscp',
	винсцп: 'winscp',
	телеграм: 'telegram',
	телеграмм: 'telegram',
	дискорд: 'discord',
	спотифай: 'spotify',
	стим: 'steam',
	хром: 'chrome',
	'гугл хром': 'chrome',
	эдж: 'msedge',
	'майкрософт эдж': 'msedge',
	опера: 'opera',
	файрфокс: 'firefox',
	мозилла: 'firefox',
	тор: 'tor browser',
	зум: 'zoom',
	скайп: 'skype',
	слак: 'slack',
	нотепад: 'notepad',
	павершелл: 'powershell',
	ворд: 'winword',
	эксель: 'excel',
	аутлук: 'outlook',
	'павер поинт': 'powerpnt',
	'вс код': 'code',
	фигма: 'figma',
}
function resolveWindowsAppQuery(raw) {
	const q = (raw || '').trim()
	if (!q) return q
	const lower = q.toLowerCase()
	if (WIN_APP_ALIASES[lower]) return WIN_APP_ALIASES[lower]
	return q
}
async function tryWhereExecutable(name) {
	const base = (name || '').trim()
	if (!base) return null
	const candidates = [
		base,
		base.toLowerCase().endsWith('.exe') ? base : `${base}.exe`,
	]
	for (const c of candidates) {
		try {
			const { stdout } = await execAsync(`where.exe ${JSON.stringify(c)}`, {
				windowsHide: true,
			})
			const line = stdout.trim().split(/\r?\n/).filter(Boolean)[0]
			if (line && fs.existsSync(line.trim())) return line.trim()
		} catch (_) {
			/* ignore */
		}
	}
	return null
}
/** Варианты строки для поиска .exe: целиком, без пробелов, первое/последнее слово (для App Paths вроде obs64.exe). */
function expandWindowsExeSearchSeeds(seed) {
	const raw = String(seed || '')
		.trim()
		.replace(/\.exe$/i, '')
	if (!raw) return []
	const lower = raw
		.toLowerCase()
		.replace(/['"`\r\n]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
	if (!lower || lower.length > 80) return []
	const compact = lower.replace(/[^a-z0-9\u0400-\u04FF]/gi, '')
	const words = lower.split(/\s+/).filter(w => w.length >= 2)
	const ordered = []
	const add = s => {
		if (s && !ordered.includes(s)) ordered.push(s)
	}
	add(lower)
	if (compact !== lower && compact.length >= 2) add(compact)
	if (words.length > 1) {
		add(words.join('-'))
		add(words[0])
		const last = words[words.length - 1]
		if (last && last !== words[0] && last.length >= 3) add(last)
	}
	return ordered.slice(0, 8)
}
/** Реестр App Paths: подбор .exe по подстроке имени (winscp → WinSCP.exe) */
async function findExeInAppPathsRegistry(seed) {
	const ql = (seed || '')
		.trim()
		.toLowerCase()
		.replace(/\.exe$/i, '')
		.replace(/['"`\r\n]/g, '')
	if (!ql || ql.length > 80) return null
	const script = `$ErrorActionPreference='SilentlyContinue'; $q=${JSON.stringify(ql)}; Get-ChildItem 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths' -ErrorAction SilentlyContinue | Where-Object { $_.PSChildName -like '*.exe' -and $_.PSChildName.ToLower().Contains($q) } | Select-Object -First 24 | ForEach-Object { $p=(Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue).'(default)'; if ($p -and (Test-Path -LiteralPath $p)) { $p } } | Select-Object -First 1`
	try {
		const { stdout } = await execAsync(
			`powershell -NoProfile -Command ${JSON.stringify(script)}`,
			{ windowsHide: true, maxBuffer: 1024 * 1024, timeout: 20000 },
		)
		const line = stdout
			.trim()
			.split(/\r?\n/)
			.map(l => l.trim())
			.find(l => /\.(exe|com|bat|cmd)$/i.test(l) && fs.existsSync(l))
		return line || null
	} catch (_) {
		return null
	}
}
/** Ярлыки в меню «Пуск»: имя ярлыка содержит запрос (в т.ч. «OBS Studio.lnk» по подстроке с пробелом или без) */
async function findExeFromStartMenuShortcuts(seed) {
	const ql = (seed || '')
		.trim()
		.toLowerCase()
		.replace(/\.exe$/i, '')
		.replace(/['"`\r\n]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
	const qc = ql.replace(/[^a-z0-9\u0400-\u04FF]/gi, '')
	if ((!ql || ql.length < 2) && (!qc || qc.length < 2)) return null
	if (ql.length > 80) return null
	const script = `$ErrorActionPreference='SilentlyContinue'; $ql=${JSON.stringify(ql)}; $qc=${JSON.stringify(qc)}; $sh=New-Object -ComObject WScript.Shell; foreach ($sd in @("$env:ProgramData\\Microsoft\\Windows\\Start Menu\\Programs","$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs")) { if (-not (Test-Path -LiteralPath $sd)) { continue }; $lnk = Get-ChildItem -LiteralPath $sd -Filter *.lnk -Recurse -ErrorAction SilentlyContinue | Where-Object { $low=$_.Name.ToLower(); $nf=$low.Replace(' ','').Replace('-','').Replace('_',''); ($ql.Length -ge 2 -and $low.Contains($ql)) -or ($qc.Length -ge 2 -and $nf.Contains($qc)) } | Select-Object -First 1; if ($lnk) { $t=$sh.CreateShortcut($lnk.FullName).TargetPath; if ($t -match '\\.(exe|com|bat|cmd)$' -and (Test-Path -LiteralPath $t)) { $t; break } } }`
	try {
		const { stdout } = await execAsync(
			`powershell -NoProfile -Command ${JSON.stringify(script)}`,
			{ windowsHide: true, maxBuffer: 1024 * 1024, timeout: 25000 },
		)
		const line = stdout
			.trim()
			.split(/\r?\n/)
			.map(l => l.trim())
			.find(l => /\.(exe|com|bat|cmd)$/i.test(l) && fs.existsSync(l))
		return line || null
	} catch (_) {
		return null
	}
}
/** Подпапки Program Files с именем, похожим на запрос (в т.ч. папка «OBS Studio» по подстроке с пробелом или компактно obsstudio) */
async function findExeInTopProgramFolders(seed) {
	const raw = String(seed || '')
		.trim()
		.replace(/\.exe$/i, '')
	const ql = raw
		.toLowerCase()
		.replace(/['"`\r\n]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
	const qc = ql.replace(/[^a-z0-9\u0400-\u04FF]/gi, '')
	const qLegacy = raw.replace(/[^a-zA-Z0-9\u0400-\u04FF]/gi, '').toLowerCase()
	if (
		(!ql || ql.length < 2) &&
		(!qc || qc.length < 2) &&
		(!qLegacy || qLegacy.length < 2)
	)
		return null
	if (ql.length > 80 || qc.length > 80 || (qLegacy && qLegacy.length > 48))
		return null
	const roots = [
		process.env['ProgramFiles(x86)'],
		process.env.ProgramFiles,
		path.join(os.homedir(), 'AppData', 'Local', 'Programs'),
	].filter(Boolean)
	const script = `$ErrorActionPreference='SilentlyContinue'; $ql=${JSON.stringify(ql)}; $qc=${JSON.stringify(qc)}; $qLegacy=${JSON.stringify(qLegacy)}; $roots=@(${roots.map(r => JSON.stringify(r)).join(',')}); foreach ($root in $roots) { if (-not (Test-Path -LiteralPath $root)) { continue }; $dirs = Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue | Where-Object { $n=$_.Name.ToLower(); $nn=$n.Replace(' ','').Replace('-','').Replace('_',''); ($ql.Length -ge 2 -and $n.Contains($ql)) -or ($qc.Length -ge 2 -and $nn.Contains($qc)) -or ($qLegacy.Length -ge 2 -and $n.Contains($qLegacy)) }; foreach ($d in $dirs) { $exe = Get-ChildItem -LiteralPath $d.FullName -Filter *.exe -File -ErrorAction SilentlyContinue | Sort-Object Length -Descending | Select-Object -First 1; if ($exe -and (Test-Path -LiteralPath $exe.FullName)) { $exe.FullName; break } } }`
	try {
		const { stdout } = await execAsync(
			`powershell -NoProfile -Command ${JSON.stringify(script)}`,
			{ windowsHide: true, maxBuffer: 1024 * 1024, timeout: 20000 },
		)
		const line = stdout
			.trim()
			.split(/\r?\n/)
			.map(l => l.trim())
			.find(l => l.endsWith('.exe') && fs.existsSync(l))
		return line || null
	} catch (_) {
		return null
	}
}
async function findExecutableOnWindowsLoose(seed) {
	let seeds = expandWindowsExeSearchSeeds(seed)
	if (!seeds.length) {
		const fb = String(seed || '')
			.trim()
			.toLowerCase()
			.replace(/\.exe$/i, '')
			.replace(/['"`\r\n]/g, '')
			.trim()
		if (fb.length >= 2 && fb.length <= 80) seeds = [fb]
	}
	for (const s of seeds) {
		const a = await findExeInAppPathsRegistry(s)
		if (a) return a
	}
	for (const s of seeds) {
		const b = await findExeFromStartMenuShortcuts(s)
		if (b) return b
	}
	for (const s of seeds) {
		const c = await findExeInTopProgramFolders(s)
		if (c) return c
	}
	return null
}
async function openWindowsAppOrPath(appName) {
	let targetPath = expandWindowsEnvPath(appName)
	const shellApi = electron.shell
	// explorer "путь" — отдельно (проводник с аргументом)
	const ex = targetPath.match(/^(?:explorer|explorer\.exe)\s+(.+)$/i)
	if (ex) {
		const inner = expandWindowsEnvPath(ex[1].replace(/^["']|["']$/g, ''))
		if (inner && fs.existsSync(inner)) {
			;spawn('explorer.exe', [inner], {
				detached: true,
				stdio: 'ignore',
			})
			return { success: true, message: `Папка открыта в проводнике` }
		}
	}
	// URI-схемы (ms-settings:, mailto:, spotify: и т.д.) — не путём к диску
	if (
		/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(targetPath) &&
		!/^[a-zA-Z]:\\/.test(targetPath)
	) {
		await shellApi.openExternal(targetPath)
		return { success: true, message: `Открыто` }
	}
	const normalized = targetPath.replace(/\//g, '\\')
	if (fs.existsSync(normalized)) {
		const err = await shellApi.openPath(normalized)
		if (!err)
			return { success: true, message: `Открыто: ${path.basename(normalized)}` }
	}
	const resolved = resolveWindowsAppQuery(targetPath)
	const fromPath = await tryWhereExecutable(resolved)
	if (fromPath) {
		await execFileAsync('cmd.exe', ['/c', 'start', '', fromPath], {
			windowsHide: true,
		})
		return { success: true, message: `Запущено: ${path.basename(fromPath)}` }
	}
	let loosePath = await findExecutableOnWindowsLoose(resolved)
	if (!loosePath && resolved !== targetPath.trim()) {
		loosePath = await findExecutableOnWindowsLoose(targetPath.trim())
	}
	if (loosePath) {
		await execFileAsync('cmd.exe', ['/c', 'start', '', loosePath], {
			windowsHide: true,
		})
		return { success: true, message: `Запущено: ${path.basename(loosePath)}` }
	}
	const looksLikeFsPath = s =>
		/[\\/]/.test(s) || /^\\\\/.test(s) || /\.(exe|com|bat|cmd|msc)$/i.test(s)
	try {
		await execFileAsync('cmd.exe', ['/c', 'start', '', resolved], {
			windowsHide: true,
		})
		return { success: true, message: `Запущено: ${resolved}` }
	} catch (e1) {
		if (looksLikeFsPath(resolved)) {
			try {
				const esc = String(resolved).replace(/'/g, "''")
				await execFileAsync(
					'powershell.exe',
					['-NoProfile', '-Command', `Start-Process -LiteralPath '${esc}'`],
					{ windowsHide: true },
				)
				return { success: true, message: `Запущено: ${resolved}` }
			} catch (e2) {
				return {
					error: `Не удалось открыть «${appName}»: ${e2.message || e1.message}`,
				}
			}
		}
		return {
			error: `Не удалось найти приложение «${appName}». Проверьте, что оно установлено, или укажите полный путь к .exe.`,
		}
	}
}
async function openApp(appName) {
	return openWindowsAppOrPath(normalizeAppNameFromIpc(appName))
}

async function openFile(filePath) {
	const expanded = expandWindowsEnvPath(filePath)
	if (!expanded) return { error: 'Пустой путь' }
	const err = await electron.shell.openPath(expanded.replace(/\//g, '\\'))
	if (err) return { error: err }
	return { success: true, message: `Открыто: ${path.basename(expanded)}` }
}

async function openFolderSmart(raw) {
	const rawInput = (raw || '').trim()
	if (!rawInput) return { error: 'Пустое имя папки' }
	const expanded = expandWindowsEnvPath(rawInput.replace(/\//g, '\\'))
	const looksLikeFullPath =
		/^[a-zA-Z]:\\/.test(expanded) ||
		/^\\\\/.test(expanded) ||
		/^%[^%]+%\\/.test(expanded)
	if (looksLikeFullPath) {
		const err = await electron.shell.openPath(expanded)
		if (!err) return { success: true, message: `Открыто: ${expanded}` }
		return { error: err }
	}
	const simple = expanded.replace(/^["']|["']$/g, '').replace(/[\\\/]+$/, '')
	if (!simple || simple.includes('\\') || simple.includes('/')) {
		const err = await electron.shell.openPath(expanded)
		if (!err) return { success: true, message: expanded }
		return { error: err }
	}
	const home = os.homedir()
	const candidates = []
	const push = p => {
		if (p && !candidates.includes(p)) candidates.push(p)
	}
	push(path.join(home, 'Desktop', simple))
	push(path.join(home, 'OneDrive', 'Desktop', simple))
	const oneDrive = process.env.OneDrive
	if (oneDrive) push(path.join(oneDrive, 'Desktop', simple))
	push(path.join(home, 'Documents', simple))
	push(path.join(home, 'Downloads', simple))
	const pub = process.env.PUBLIC
	if (pub) push(path.join(pub, 'Desktop', simple))
	for (const p of candidates) {
		try {
			if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
				const err = await electron.shell.openPath(p)
				if (!err) return { success: true, message: `Открыто: ${p}` }
			}
		} catch (_) {
			/* ignore */
		}
	}
	return {
		error: `Папка «${rawInput}» не найдена (искали на Рабочем столе, OneDrive Desktop, в Документах и Загрузках).`,
	}
}

async function listBrowsers() {
	try {
		const ps = [
			`$ErrorActionPreference = "SilentlyContinue";`,
			`$items = @();`,
			`$roots = @("HKLM:\\SOFTWARE\\Clients\\StartMenuInternet","HKCU:\\SOFTWARE\\Clients\\StartMenuInternet");`,
			`foreach ($root in $roots) {`,
			`  if (Test-Path $root) {`,
			`    Get-ChildItem $root | ForEach-Object {`,
			`      $k = $_;`,
			`      $id = $k.PSChildName;`,
			`      $name = (Get-ItemProperty $k.PSPath)."(default)";`,
			`      if (-not $name -or $name -eq "") { $name = $id }`,
			`      $cmdKey = Join-Path $k.PSPath "shell\\open\\command";`,
			`      $cmd = (Get-ItemProperty $cmdKey)."(default)";`,
			`      if ($cmd) { $items += [pscustomobject]@{ id=$id; name=$name; command=$cmd } }`,
			`    }`,
			`  }`,
			`}`,
			`$known = @(`,
			`  @{ id="chrome";  name="Google Chrome"; exe="chrome.exe" },`,
			`  @{ id="edge";    name="Microsoft Edge"; exe="msedge.exe" },`,
			`  @{ id="firefox"; name="Mozilla Firefox"; exe="firefox.exe" },`,
			`  @{ id="opera";   name="Opera"; exe="opera.exe" },`,
			`  @{ id="brave";   name="Brave"; exe="brave.exe" }`,
			`);`,
			`foreach ($b in $known) {`,
			`  $p = (Get-Command $b.exe -ErrorAction SilentlyContinue).Source;`,
			`  if ($p) { $items += [pscustomobject]@{ id=$b.id; name=$b.name; command=("\"{0}\"" -f $p) } }`,
			`}`,
			`$items | Group-Object id | ForEach-Object { $_.Group | Select-Object -First 1 } | ConvertTo-Json -Compress`,
		].join(' ')
		const command = `powershell -Command "${ps.replace(/"/g, '\\"')}"`
		const { stdout, stderr } = await execAsync(command)
		const raw = (stdout || stderr || '').trim()
		if (!raw) return []
		let jsonText = raw
		const firstBracket = raw.indexOf('[')
		const firstBrace = raw.indexOf('{')
		const start =
			firstBracket === -1
				? firstBrace
				: firstBrace === -1
					? firstBracket
					: Math.min(firstBracket, firstBrace)
		if (start !== -1) {
			const lastBracket = raw.lastIndexOf(']')
			const lastBrace = raw.lastIndexOf('}')
			const end = Math.max(lastBracket, lastBrace)
			if (end !== -1 && end > start) jsonText = raw.slice(start, end + 1)
		}
		const parsed = JSON.parse(jsonText)
		if (Array.isArray(parsed)) return parsed
		if (parsed && typeof parsed === 'object') return [parsed]
		return []
	} catch (e) {
		console.error('listBrowsers win32:', e)
		return []
	}
}

async function listInstalledApps() {
	return { success: true, apps: [], message: 'Список приложений Windows подгружается при запуске по имени' }
}

module.exports = {
	openApp,
	openFile,
	openFolderSmart,
	listInstalledApps,
	listBrowsers,
	findExecutableLoose: findExecutableOnWindowsLoose,
}
