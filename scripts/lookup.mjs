#!/usr/bin/env node
// BrandDesk 资料查询：用户用自然语言描述「想要什么资料」，从公开资料索引检索并把下载/打开链接直接返回。
// 数据源是 GitHub 上的公开 resources.json（BrandDesk 每日自动同步有效资料），任意 Agent、任意环境可读。
// 零依赖：只用 Node 内置模块，不需要飞书连接器 / lark-cli / 任何密钥。
// 读取顺序：Contents API → raw → jsDelivr CDN → 随包快照 data/resources.json → 运行时缓存 .cache/resources.json。
// 用法：
//   node scripts/lookup.mjs "帮我找飞利浦按摩品类的介绍 PPT"   # 自然语言意图 / 关键词，自动分词打分
//   node scripts/lookup.mjs --all                            # 列出全部资料
//   node scripts/lookup.mjs --category "飞利浦品牌授权"        # 按分类筛选
//   node scripts/lookup.mjs "授权申请" --json                 # 机器可读输出
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { checkForUpdate, applyUpdate, dismissUpdate, formatUpdate } from './update.mjs'

const SKILL_DIR = dirname(dirname(fileURLToPath(import.meta.url)))
const REPO = '630898288-collab/branddesk-lookup-skill'
const INDEX_PATH = 'data/resources.json'
const RAW_URL = `https://raw.githubusercontent.com/${REPO}/main/${INDEX_PATH}`
const REMOTE_SOURCES = [
  {
    name: 'Contents API',
    url: `https://api.github.com/repos/${REPO}/contents/${INDEX_PATH}`,
    decode: (text) => {
      const obj = JSON.parse(text)
      if (!obj.content) throw new Error('contents 无 content 字段')
      return Buffer.from(obj.content, 'base64').toString('utf8')
    },
  },
  { name: 'raw', url: RAW_URL, decode: (t) => t },
  { name: 'jsDelivr', url: `https://cdn.jsdelivr.net/gh/${REPO}@main/${INDEX_PATH}`, decode: (t) => t },
]
const LOCAL_SNAPSHOT = join(SKILL_DIR, INDEX_PATH)
const RUNTIME_CACHE = join(SKILL_DIR, '.cache', 'resources.json')
const FETCH_TIMEOUT_MS = 7000

function parseArgs(argv) {
  const out = { query: '', category: '', all: false, json: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--all') out.all = true
    else if (a === '--json') out.json = true
    else if (a === '--category') out.category = (argv[++i] || '').trim()
    else if (a === '--help' || a === '-h') out.help = true
    else if (!a.startsWith('--')) out.query = (out.query + ' ' + a).trim()
  }
  return out
}

// 依次尝试远端数据源；任一成功即解析 JSON 并写运行时缓存。全失败返回 null。
async function fetchRemoteIndex() {
  for (const src of REMOTE_SOURCES) {
    try {
      const res = await fetch(src.url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'branddesk-lookup-skill' },
      })
      if (!res.ok) continue
      const text = src.decode(await res.text())
      const data = JSON.parse(text)
      if (!Array.isArray(data.records)) continue
      try {
        mkdirSync(dirname(RUNTIME_CACHE), { recursive: true })
        writeFileSync(RUNTIME_CACHE, text, 'utf8')
      } catch { /* 缓存写入失败不影响查询 */ }
      return data
    } catch { /* 超时/解析失败，尝试下一个源 */ }
  }
  return null
}

// 读取本地快照（随包）或运行时缓存；取较新的一份。
function readLocalIndex() {
  const candidates = []
  for (const p of [RUNTIME_CACHE, LOCAL_SNAPSHOT]) {
    if (!existsSync(p)) continue
    try {
      const data = JSON.parse(readFileSync(p, 'utf8'))
      if (Array.isArray(data.records)) candidates.push({ path: p, data })
    } catch { /* 跳过损坏文件 */ }
  }
  if (!candidates.length) return null
  candidates.sort((a, b) => new Date(b.data.generatedAt || 0) - new Date(a.data.generatedAt || 0))
  return candidates[0].data
}

async function loadIndex() {
  const remote = await fetchRemoteIndex()
  if (remote) return { data: remote, from: 'remote' }
  const local = readLocalIndex()
  if (local) return { data: local, from: 'local' }
  throw new Error('未找到资料索引：远端数据源不可达，且 Skill 目录内无 data/resources.json 快照')
}

// 中文 2-gram + 英文单词分词：让「帮我找飞利浦按摩品类的介绍PPT」也能命中标题里的「飞利浦按摩品类介绍」
function tokenize(text) {
  const s = String(text || '').toLowerCase()
  const tokens = new Set()
  for (const w of s.match(/[a-z0-9][a-z0-9+#.]*/g) || []) if (w.length >= 2) tokens.add(w)
  const cjk = s.match(/[\u4e00-\u9fff]+/g) || []
  for (const seg of cjk) {
    if (seg.length === 1) tokens.add(seg)
    for (let i = 0; i < seg.length - 1; i++) tokens.add(seg.slice(i, i + 2))
  }
  return [...tokens]
}

function scoreRow(row, queryTokens) {
  const hay = [row.title, row.titleZh, row.titleEn, row.category, row.categoryZh, row.categoryEn, row.description, row.form].join(' ').toLowerCase()
  let score = 0
  for (const tk of queryTokens) if (hay.includes(tk)) score += 1
  return score
}

async function main(updateState) {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log('用法: node lookup.mjs "自然语言需求或关键词" | --all | --category 分类名 [--json]')
    console.log('更新: node lookup.mjs --check-update | --self-update | --dismiss-update | --skip-update-check')
    return
  }
  if (!args.all && !args.query && !args.category) {
    console.log('请提供需求描述、关键词、--all 或 --category。例：node lookup.mjs "帮我找飞利浦按摩品类介绍 PPT"')
    process.exitCode = 2
    return
  }

  let loaded
  try { loaded = await loadIndex() } catch (e) { console.error('错误：' + e.message); process.exitCode = 1; return }
  let rows = loaded.data.records || []
  // 只返回有效资料（公开索引本身已过滤；这里再兜底一次）
  rows = rows.filter((r) => !r.status || r.status.includes('有效'))

  let hits = rows
  if (args.category) hits = hits.filter((r) => (r.category || '').includes(args.category) || (r.categoryZh || '').includes(args.category))
  if (args.query) {
    const qt = tokenize(args.query)
    const scored = hits
      .map((r) => ({ r, s: scoreRow(r, qt) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || (a.r.category || '').localeCompare(b.r.category || '', 'zh') || (a.r.title || '').localeCompare(b.r.title || '', 'zh'))
    // 相关度阈值：过滤掉「只命中通用词」的弱结果
    const maxScore = scored.length ? scored[0].s : 0
    const minScore = Math.max(1, Math.ceil(maxScore * 0.5))
    hits = scored.filter((x) => x.s >= minScore).map((x) => x.r)
  } else {
    hits.sort((a, b) => (a.category || '').localeCompare(b.category || '', 'zh') || (a.title || '').localeCompare(b.title || '', 'zh'))
  }

  const stale = loaded.from === 'local' ? '（离线快照，数据可能略旧）' : ''
  if (args.json) {
    console.log(JSON.stringify({ count: hits.length, from: loaded.from, generatedAt: loaded.data.generatedAt, sourceUrl: RAW_URL, update: updateState, records: hits }, null, 2))
    return
  }
  if (!hits.length) {
    console.log(`未找到匹配的资料。${stale}`)
    return
  }
  console.log(`找到 ${hits.length} 条资料${stale}：\n`)
  for (const r of hits) {
    console.log(`【${r.title}】`)
    console.log(`  分类：${r.category || ''}${r.form ? ' · ' + r.form : ''}`)
    console.log(`  链接：${r.link || '(无链接)'}`)
    if (r.description) console.log(`  简介：${String(r.description).slice(0, 160)}`)
    console.log('')
  }
  console.log(`数据源：BrandDesk 公开资料索引（每日同步） ${RAW_URL}`)
}

/* 第零步：运行时检查本 Skill 有没有新版本（见 SKILL.md）。
 * 只提醒、绝不自动安装；网络失败静默降级，不阻断查询。 */
const argv = process.argv.slice(2)
const hasFlag = (f) => argv.includes(f)
let updateState = null
if (hasFlag('--self-update')) {
  const r = await applyUpdate()
  console.log(JSON.stringify(r, null, 2))
  process.exit(r.ok ? 0 : 1)
} else if (hasFlag('--dismiss-update')) {
  const r = await dismissUpdate()
  console.log(JSON.stringify(r, null, 2))
  process.exit(r.ok ? 0 : 1)
} else {
  if (!hasFlag('--skip-update-check')) {
    updateState = formatUpdate(await checkForUpdate({ force: hasFlag('--check-update') || hasFlag('--force') }))
    if (updateState.available) console.error(`\n[Skill 更新] ${updateState.message}\n`)
  }
  // 只想查版本、不查询资料：直接输出结构化结果给 Agent
  if (hasFlag('--check-update') && !hasFlag('--all') && !hasFlag('--category') && !argv.some((a) => !a.startsWith('--'))) {
    console.log(JSON.stringify(updateState, null, 2))
    process.exit(0)
  }
  await main(updateState)
}
