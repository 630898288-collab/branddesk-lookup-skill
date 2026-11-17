# BrandDesk 资料查询 Skill

让 Agent 直接帮你找到 BrandDesk（飞利浦/德尔玛市场部品牌资料工作台）里的资料，**用自然语言说出你想要的资料，Agent 就把下载/打开链接发给你**——不用打开 BrandDesk 网站，也不用报出资料的准确名称。

## 它能做什么

你说人话，它给链接：

- 「下周要给客户讲按摩品类，有介绍材料吗」 → 返回按摩品类介绍 PPT 的链接
- 「把品牌授权申请表发我」 → 返回授权在线申请表
- 「有没有商标授权的查询表」 → 返回全球商标授权书查询表
- 「给我一份英文版的健康生活品牌介绍」 → 返回对应 PPT

数据源是飞书多维表，由 BrandDesk 后端每日自动同步有效资料，所以**不依赖内网，外网也能查**。

## 安装

### 方式一：让 Agent 安装（推荐）

把下面这段话发给任意 WorkBuddy Agent，它会自动下载安装：

> 帮我安装 BrandDesk 资料查询 Skill：从 https://github.com/630898288-collab/branddesk-lookup-skill 下载，放到 `~/.workbuddy/skills/branddesk-lookup/`，确保目录里有 `SKILL.md` 和 `scripts/lookup.mjs`。装好后告诉我已启用。

### 方式二：手动安装

```bash
git clone https://github.com/630898288-collab/branddesk-lookup-skill.git ~/.workbuddy/skills/branddesk-lookup
```

或下载 [ZIP 安装包](https://github.com/630898288-collab/branddesk-lookup-skill/archive/refs/heads/main.zip)，解压后把目录放到 `~/.workbuddy/skills/branddesk-lookup/`。

重启/刷新 Agent 后即可使用。

## 前置条件

- 已启用并登录 WorkBuddy 飞书连接器（Skill 复用你本机的飞书登录态查询多维表）。
- **无需任何 API Key 或额外配置**：数据表定位符已内置，安装即用。

## 使用

装好后直接用自然语言提问即可，例如：

> 帮我找一下飞利浦按摩品类的介绍 PPT

Agent 会自动调用本 Skill 检索并把链接返回给你。也可以直接问「XX 的链接在哪」「资料库里有没有 XX」。

## 文件说明

| 文件 | 作用 |
| --- | --- |
| `SKILL.md` | Skill 定义：触发条件、工作流、返回规范（Agent 读它来决定怎么用） |
| `scripts/lookup.mjs` | 查询脚本：调用本机 `lark-cli` 读多维表，分词模糊匹配，返回资料与链接 |
| `.env.example` | 可选配置模板：仅当数据表更换时才需要，一般不用管 |

## 边界

- 只返回**有效**资料（失效的不会同步、脚本也会再过滤）。
- 数据每天同步一次，刚新增/改名的资料最多延迟一天。
- 本 Skill 只读，不提供上传/修改/删除资料的能力。
