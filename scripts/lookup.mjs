#!/usr/bin/env node
// BrandDesk 资料查询：用户用自然语言描述「想要什么资料」，从飞书多维表（BrandDesk 每日同步）检索并把下载/打开链接直接返回。
// 数据源定位符（不是访问密钥）已内置，安装即用；可用 .env 覆盖。查询复用调用方本机飞书 user 授权。
// 用法：
//   node scripts/lookup.mjs "帮我找飞利浦按摩品类的介绍 PPT"   # 自然语言意图 / 关键词，自动分词打分
//   node scripts/lookup.mjs --all                            # 列出全部资料
//   node scripts/lookup.mjs --category "飞利浦品牌授权"        # 按分类筛选
//   node scripts/lookup.mjs "授权申请" --json                 # 机器可读输出
import { execFileSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const SKILL_DIR = dirname(dirname(fileURLToPath(import.meta.url)))
function loadConfig() {
  const out = {}
  const envPath = join(SKILL_DIR, '.env')
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
  return {
    // 内置默认：数据表定位符，非密钥；无访问权仍打不开，可安全内置以便安装即用。
    baseToken: process.env.BRANDDESK_BASE_TOKEN || out.BRANDDESK_BASE_TOKEN || 'TmQybrXM5a9SfssXgkic5mCrn6d',
    tableId: process.env.BRANDDESK_TABLE_ID || out.BRANDDESK_TABLE_ID || 'tblLwCmQCV0gJ3Dc',
  }
}
const CFG = loadConfig()
const BASE_TOKEN = CFG.baseToken
const TABLE_ID = CFG.tableId
const BASE_URL = BASE_TOKEN ? `https://deerma66.feishu.cn/base/${BASE_TOKEN}` : '(未配置数据源)'
const DEFAULT_CLI = join(homedir(), '.workbuddy/binaries/node/cli-connector-packages/bin/lark-cli')

function resolveCli() {
  if (process.env.LARK_CLI_PATH && existsSync(process.env.LARK_CLI_PATH)) return process.env.LARK_CLI_PATH
  if (existsSync(DEFAULT_CLI)) return DEFAULT_CLI
  return 'lark-cli' // 交给 PATH 解析；失败时下方给出明确提示
}

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
  const hay = [row.title, row.category, row.description, row.form].join(' ').toLowerCase()
  let score = 0
  for (const tk of queryTokens) if (hay.includes(tk)) score += 1
  return score
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log('用法: node lookup.mjs "自然语言需求或关键词" | --all | --category 分类名 [--json]')
    return
  }
  if (!args.all && !args.query && !args.category) {
    console.log('请提供需求描述、关键词、--all 或 --category。例：node lookup.mjs "帮我找飞利浦按摩品类介绍 PPT"')
    process.exitCode = 2
    return
  }
  let rows
  try { rows = fetchRecordsSync() } catch (e) { console.error('错误：' + e.message); process.exitCode = 1; return }
  // 只接受有效状态；失效资料不对外返回
  rows = rows.filter((r) => !r.status || r.status.includes('有效'))

  let hits = rows
  if (args.category) hits = hits.filter((r) => r.category.includes(args.category))
  if (args.query) {
    const qt = tokenize(args.query)
    const scored = hits
      .map((r) => ({ r, s: scoreRow(r, qt) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.r.category.localeCompare(b.r.category, 'zh') || a.r.title.localeCompare(b.r.title, 'zh'))
    // 相关度阈值：过滤掉「只命中通用词」的弱结果（如查「品牌授权申请表」时不该把品牌介绍 PPT 都列出来）
    const maxScore = scored.length ? scored[0].s : 0
    const minScore = Math.max(1, Math.ceil(maxScore * 0.5))
    hits = scored.filter((x) => x.s >= minScore).map((x) => x.r)
  } else {
    hits.sort((a, b) => a.category.localeCompare(b.category, 'zh') || a.title.localeCompare(b.title, 'zh'))
  }

  if (args.json) {
    console.log(JSON.stringify({ count: hits.length, baseUrl: BASE_URL, records: hits }, null, 2))
    return
  }
  if (!hits.length) {
    console.log(`未找到匹配的资料。多维表：${BASE_URL}`)
    return
  }
  console.log(`找到 ${hits.length} 条资料：\n`)
  for (const r of hits) {
    console.log(`【${r.title}】`)
    console.log(`  分类：${r.category}${r.form ? ' · ' + r.form : ''}`)
    console.log(`  链接：${r.link || '(无链接)'}`)
    if (r.description) console.log(`  简介：${r.description.slice(0, 160)}`)
    console.log('')
  }
  console.log(`数据源：BrandDesk 资料索引（每日同步） ${BASE_URL}`)
}

// 用同步 execFileSync 查询，简化调用方（Node 顶层无 await）
function fetchRecordsSync() {
  const cli = resolveCli()
  let stdout
  try {
    stdout = execFileSync(cli, [
      'base', '+record-list', '--as', 'user',
      '--base-token', BASE_TOKEN, '--table-id', TABLE_ID,
      '--format', 'json', '--limit', '200',
    ], { maxBuffer: 16 * 1024 * 1024, encoding: 'utf8', env: { ...process.env, LARK_CLI_NO_PROXY_WARN: '1' } })
  } catch (e) {
    const msg = (e.stderr || e.message || '').toString()
    if (/not found|ENOENT/i.test(msg)) throw new Error('未找到 lark-cli。请先启用 WorkBuddy 飞书连接器，或设置 LARK_CLI_PATH。')
    throw new Error(`查询飞书多维表失败：${msg.slice(0, 300)}`)
  }
  const start = stdout.indexOf('{')
  if (start < 0) throw new Error(`lark-cli 无有效输出：${stdout.slice(0, 150)}`)
  const res = JSON.parse(stdout.slice(start))
  if (res.ok === false) throw new Error(`飞书接口错误：${JSON.stringify(res.error || res).slice(0, 300)}`)
  const d = res.data || {}
  const matrix = d.data || []
  const ids = d.record_id_list || []
  const fields = d.fields || []
  const col = (name) => fields.indexOf(name)
  const iTitle = col('资料标题'), iCat = col('分类'), iLink = col('链接地址'), iDesc = col('简介'), iStatus = col('状态'), iForm = col('资料形态')
  const cell = (row, idx) => {
    if (idx < 0 || row[idx] == null) return ''
    const v = row[idx]
    if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' && x !== null ? (x.text || x.name || '') : x)).join(' / ')
    if (typeof v === 'object') return v.text || v.link || ''
    return String(v)
  }
  return matrix.map((row, i) => ({
    recordId: ids[i], title: cell(row, iTitle), category: cell(row, iCat),
    link: cell(row, iLink), description: cell(row, iDesc), status: cell(row, iStatus), form: cell(row, iForm),
  }))
}

main()
