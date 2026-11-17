# BrandDesk 资料查询 Skill

让 Agent 直接帮你找到 BrandDesk（飞利浦/德尔玛市场部品牌资料工作台）里的资料，**用自然语言说出你想要的资料，Agent 就把下载/打开链接发给你**——不用打开 BrandDesk 网站，也不用报出资料的准确名称。

**通用 Skill，适用于任何能读取 `SKILL.md` 的 Agent**，不绑定 WorkBuddy，也不需要飞书连接器、API Key 或任何密钥。

## 它能做什么

你说人话，它给链接：

- 「下周要给客户讲按摩品类，有介绍材料吗」 → 返回按摩品类介绍 PPT 的链接
- 「把品牌授权申请表发我」 → 返回授权在线申请表
- 「有没有商标授权的查询表」 → 返回全球商标授权书查询表
- 「给我一份英文版的健康生活品牌介绍」 → 返回对应 PPT

数据源是 GitHub 上的公开资料索引，由 BrandDesk 后端每日自动同步有效资料，所以**不依赖内网、外网也能查**；断网时还能用包内自带快照兜底。

## 安装（通用，不挑 Agent）

### 方式一：让 Agent 自己装（推荐）

把下面这段话发给你的 Agent，它会自行下载安装：

> 帮我安装 BrandDesk 资料查询 Skill：从 https://github.com/630898288-collab/branddesk-lookup-skill 下载整个仓库，放到本 Agent 的 skills 目录（WorkBuddy 用 `~/.workbuddy/skills/branddesk-lookup/`，Claude Code 用 `~/.claude/skills/branddesk-lookup/`，其他 Agent 用其对应的 skills 目录），确保目录里有 `SKILL.md`、`scripts/lookup.mjs` 和 `data/resources.json`。装好后按 SKILL.md 的说明工作即可。

### 方式二：手动安装

```bash
# 换成你所用 Agent 的 skills 目录即可，下面是 WorkBuddy 示例
git clone https://github.com/630898288-collab/branddesk-lookup-skill.git ~/.workbuddy/skills/branddesk-lookup
```

或下载 [ZIP 包](https://github.com/630898288-collab/branddesk-lookup-skill/archive/refs/heads/main.zip)，解压后把整个目录放到 Agent 的 skills 目录。重启/刷新 Agent 后即可使用。

> 目录名随意，关键是让 Agent 能读到 `SKILL.md`。不同 Agent 的 skills 目录不同，安装指令里的路径只是示例，按实际替换。

## 前置条件

- **只需 Node.js 18+**（内置 `fetch`）。没有飞书连接器、`lark-cli`、API Key 等任何依赖。
- 联网即可查最新；完全离线时用包内 `data/resources.json` 快照（会提示数据可能略旧）。

## 使用

装好后直接用自然语言提问即可，例如：

> 帮我找一下飞利浦按摩品类的介绍 PPT

Agent 会自动调用本 Skill 检索并把链接返回给你。也可以直接问「XX 的链接在哪」「资料库里有没有 XX」。

## 文件说明

| 文件 | 作用 |
| --- | --- |
| `SKILL.md` | Skill 定义：触发条件、工作流、返回规范（Agent 读它来决定怎么用） |
| `scripts/lookup.mjs` | 查询脚本：从公开 `resources.json` 检索，分词模糊匹配，返回资料与链接（零依赖） |
| `data/resources.json` | 随包快照：公开资料索引的最新快照，离线时兜底 |
| `.env.example` | 可选配置模板：仅管理员更换数据源仓库时才可能需要，一般不用管 |

## 边界

- 只返回**有效**资料（失效的不会进入公开索引，脚本也会再过滤）。
- 数据每天同步一次，刚新增/改名的资料最多延迟一天。
- 本 Skill 只读，不提供上传/修改/删除资料的能力。
