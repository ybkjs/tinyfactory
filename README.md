<div align="center">

# 🏭 tinyfactory

**把你的 AI 自动化变成一座会动的微缩工厂。**

一行命令，自动找出这台电脑上的 Claude Code、Codex、OpenClaw、cron、launchd、systemd 定时任务，
每条自动化是一条产线，每次运行是一个包裹，顺着传送带送到干活的 agent 面前。

[![test](https://github.com/ybkjs/tinyfactory/actions/workflows/test.yml/badge.svg)](https://github.com/ybkjs/tinyfactory/actions/workflows/test.yml)
[![release](https://img.shields.io/github/v/release/ybkjs/tinyfactory)](https://github.com/ybkjs/tinyfactory/releases)
[![node](https://img.shields.io/badge/node-%E2%89%A520-3c873a)](package.json)
[![license](https://img.shields.io/github/license/ybkjs/tinyfactory)](LICENSE)

**[在线演示](https://ybkjs.github.io/tinyfactory/)**（手机也能看） · [文档](docs/) · [更新日志](CHANGELOG.md) · [English](README.en.md) · 中文

![tinyfactory](docs/demo.gif)

</div>

## 为什么做这个

自动化越加越多以后，你很快就说不清自己到底有多少任务在跑，更说不清哪些早就悄悄停了。
作者动手做 tinyfactory 之前先盘点了一遍自己的电脑，结果发现 4 条定时任务已经停了几个月都没人发现（授权过期，连续失败 197 次）。tinyfactory 就是把这次盘点变成一直开着的样子。

列表能告诉你这些，但没人每天去看列表。一座会动的小工厂，你会愿意多看两眼。

灵感来自 [@Khazix0918 的自动化流水线可视化](https://x.com/Khazix0918/status/2112838884510048647)。tinyfactory 是一个独立实现的开源版本，重点放在「装上就能看到你自己的工厂」。

## 快速开始

```bash
npx github:ybkjs/tinyfactory            # 扫描这台电脑，打开你的工厂
npx github:ybkjs/tinyfactory --demo     # 先看看演示工厂
```

需要 Node.js 20+ 和 git。浏览器会自动打开 `http://127.0.0.1:4520/`。

## 它会自动发现什么

| 来源 | 读哪里 | 能看到 |
|---|---|---|
| Claude Code 后台会话 | `~/.claude/jobs/*/state.json` | 正在干活的、等你回复的、今天完成的 |
| Codex 自动化（ChatGPT 桌面版） | `~/.codex/automations/`、`~/.codex/sqlite/codex-dev.db` | 计划、下次运行、每次运行、没看的结果、停摆的任务 |
| OpenClaw 定时任务 | `~/.openclaw/cron/jobs.json` | 计划、连续失败次数、已停用 |
| crontab | `crontab -l` | 每一条定时命令 |
| macOS launchd | `~/Library/LaunchAgents/*.plist`（带定时的） | 计划、上次退出码 |
| Linux systemd | `systemctl` 定时器、`journalctl` | 计划、下次运行、每次运行、失败 |
| Windows 任务计划 | PowerShell `Get-ScheduledTask`（跳过系统自带的） | 计划、下次和上次运行、上次结果 |
| GitHub Actions（需开启） | `gh run list`，只看配置里列出的仓库 | 每个工作流的运行、连续失败、正在跑的 |
| 任何别的东西 | `POST /api/event` | 你上报什么就显示什么 |
| 另一台机器上的 tinyfactory | 它的 `/api/state` | 服务器、NAS 上的任务汇总到同一张图（见下文） |

全部**只读**。找不到的来源会安静地跳过。

## 让任何脚本出现在工厂里

```bash
# 开始
curl -X POST localhost:4520/api/event -H 'content-type: application/json' \
  -d '{"line":"backup","name":"夜间备份","factory":"运维","status":"start"}'
# 成功 / 失败
curl -X POST localhost:4520/api/event -d '{"line":"backup","status":"done"}'
curl -X POST localhost:4520/api/event -d '{"line":"backup","status":"fail","msg":"磁盘满了"}'
```

字段：`line`（必填，产线 id）、`name`、`factory`（放进哪个厂区）、`agent`（`claude` / `codex` / `deepseek` / `openclaw` / `system` / `custom`）、`status`（`start` / `done` / `fail`）、`msg`。
每次 `done` 或 `fail` 都会变成一个包裹送到对应的 agent。

n8n、GitHub Actions、Python 脚本、飞书机器人……能发 HTTP 请求的都能接。

## 多台机器汇总到一张图

云服务器上的定时任务，笔记本是看不到的。办法是在服务器上也跑一份（只听本机），再用 SSH 隧道把它接过来：

```bash
# 服务器上
npx github:ybkjs/tinyfactory --host 127.0.0.1 --port 4520 --token 一串随机字符 --no-open
# 笔记本上：开一条隧道，把服务器的 4520 映射到本机 4525
ssh -N -L 4525:127.0.0.1:4520 you@your-server
```

然后在笔记本的配置里加上：

```json
{ "remote": [{ "name": "server", "url": "http://127.0.0.1:4525", "token": "一串随机字符" }] }
```

服务器的产线 id 会变成 `remote:server:原来的id`，`rename` / `assign` / `factories` 都能按这个规则重新命名、分组。服务器连不上超过一分钟，它的产线会标成「连不上」。
在服务器上跑的脚本也可以直接往服务器那份 tinyfactory 发 webhook，笔记本这边同样能看到包裹。

## 配置（可选）

`~/.tinyfactory/config.json`：

```json
{
  "title": "我的 AI 工厂",
  "city": "shanghai",
  "lang": "zh",
  "hide": ["launchd:*updater*"],
  "rename": { "systemd:site-health": "官网健康检查" },
  "assign": { "systemd:*-report": "deepseek" },
  "factories": [
    { "name": "我的网店", "match": ["systemd:shop-*", "cron:*"], "building": "shop", "color": "#e8774a" }
  ],
  "systemd": { "services": ["my-bot"] }
}
```

- `hide`：不想看的产线（支持 `*`）
- `rename`：给产线换个人话名字
- `assign`：指定哪个 agent 在干这条线的活
- `factories`：按你的项目重新分厂区（`building`: `shop` / `studio` / `home`）
- `systemd.services`：一直在线的服务也放进来，显示为「在线」
- `lines`：这台电脑看不到的任务（云服务器、SaaS 里的定时任务）先手动挂上地图，显示「未接入」，例如
  `{ "id": "backup", "name": "夜间备份", "factory": "我的网店", "agent": "system", "schedule": { "type": "cron", "value": "0 3 * * *" } }`

产线 id 在页面左侧列表里点开就能看到，规则是 `来源:名字`，比如 `codex:daily-news`、`systemd:backup`。

完整说明见 [docs/config.md](docs/config.md)，完整示例见 [examples/config.example.json](examples/config.example.json)。

## 场景里有什么

- **真实的时间和天气**：太阳按你所在城市的经纬度走，晚上路灯和窗户会亮；下雨下雪会同步到场景里（天气来自 [Open-Meteo](https://open-meteo.com/)）。右上角可以切城市，也可以预览傍晚、夜晚、雪夜。
- **看得懂的状态**：绿灯运行中，红灯需留意（连续失败、停摆、结果没人看），空心是在等下次运行。
- **点一下就知道怎么样了**：点机器、agent、中台、名牌或左侧列表里的产线，镜头飞过去，面板里显示它的状态、运行计划、上次和下次运行、今天跑了几次，以及最近 20 次运行（绿色成功、红色失败）和成功率。宽屏右下角还有「最近动态」，新的运行一到就出现在最上面。失败的运行会送出红盖子的包裹。
- **有人在干活**：每个工厂院子里有戴安全帽的工人，产线跑一次，工人就走到那台机器前操作；一直在跑的产线旁边始终有人守着。agent 们会眨眼，干活时会动起来。
- **名牌三档**：默认只给运行中、在线和需留意的产线挂名牌，点「名牌」切到全部，再点关闭。
- **分享海报**：底部「分享」按钮把当前画面做成一张带标题、日期和今日数字的海报，手机上直接调起系统分享。
- **后台也看得见**：有产线需留意时，浏览器标签页标题前会显示数字「(1)」，图标上多一个红点。
- **快速查找**：按 `/` 或 ⌘K（手机上点右上角搜索），输入名字的一部分，回车就飞过去打开详情。
- **巡游模式**：点「巡游」、按 P 或在网址后加 `?tour=1`，镜头缓慢绕园区转，哪条产线跑完就飞过去看几秒，适合放在副屏或电视上常开。
- **夜间界面**：天黑后卡片和名牌自动变成深色。
- **快捷键**：H 回全景，← → 转视角，+ − 缩放，L 切换名牌，T 收起或打开任务列表，P 巡游，Esc 关闭详情。
- **拖动旋转、右键平移、滚轮缩放**，手机上双指缩放；点左侧任意一条产线，镜头会飞过去。

| 傍晚 | 雪夜 |
|---|---|
| ![dusk](docs/dusk.jpg) | ![snow night](docs/snow-night.jpg) |

## 隐私

- 只监听 `127.0.0.1`，不上传任何数据，没有统计。
- 只读：不会修改你的任何任务。
- 唯一的外部请求是天气：把你选的城市坐标发给 Open-Meteo。如果你在配置里开启了 GitHub Actions，还会通过你本机的 `gh` 查询那几个仓库。
- 想在局域网或服务器上开放，必须加 `--token`：`npx github:ybkjs/tinyfactory --host 0.0.0.0 --token 你的密码`。

## 命令行参数

```
npx github:ybkjs/tinyfactory           扫描这台电脑，打开工厂
npx github:ybkjs/tinyfactory --demo    演示工厂（包裹是模拟的）
npx github:ybkjs/tinyfactory doctor    自检：每个来源找到了什么、没找到的原因

--port <n>        端口，默认 4520
--host <addr>     默认 127.0.0.1（对外开放必须配 --token）
--city <name>     beijing、shanghai、shenzhen、hangzhou、london、newyork…
--lang <zh|en>    界面语言
--config <file>   默认 ~/.tinyfactory/config.json
--interval <s>    多久扫一次，默认 10 秒
--token <secret>  对外开放时用
--no-open         不自动打开浏览器
--verbose         打印数据源的报错
--version         版本号
```

配置文件写错时，tinyfactory 会直接报出第几行第几列，不会悄悄忽略；拼错的字段名会提示「你是不是想写 xxx」。
页面参数：`?q=auto|low|medium|high`（画质）、`?fps=60`、`?city=`、`?lang=`、`?weather=dusk|night|rain|snow|snow-night`。

## 文档

- [配置项完整说明](docs/config.md)：每个字段、产线 id 规则、运行计划写法、多台机器（英文）
- [HTTP 接口](docs/api.md)：webhook 上报、`/api/state` 数据格式（英文）
- [架构与新增数据源](docs/architecture.md)：怎么写一个新来源、各文件做什么（英文）
- [部署示例](examples/)：服务器 systemd 常驻、Mac launchd 常驻、完整配置示例

## 性能

默认画质是 auto：开柔和阴影和移轴景深，帧率掉到每秒 24 帧以下就自动关掉，并在这台电脑上记住。封顶每秒 30 帧，窗口不在前台时降到 12 帧。8GB 内存的 MacBook 上实测流畅；老电脑可以用 `?q=low`。

## 常见问题

**打开是空的 / 少了某个工具的任务？** 运行 `npx github:ybkjs/tinyfactory doctor`，它会逐个说明每个来源找到了什么、没找到的原因。

**能看服务器上的任务吗？** 能。服务器上也跑一份（只监听本机、带 token），用 SSH 隧道接到笔记本上，见上文「多台机器汇总到一张图」。

**会改动我的任务吗？会上传数据吗？** 不会。只读、只在本机，唯一的外部请求是天气（开启 GitHub Actions 时还会查你列出的仓库）。

**想在工厂里看到 GitHub Actions？** 配置里加上 `"github": { "repos": ["你的名字/仓库"] }`，需要先装好并登录 GitHub 命令行 `gh`。每个工作流是一条产线，CI 跑完一次送一个包裹，失败的标红。

**详情卡里没有历史记录？** systemd 定时器、Codex、OpenClaw、Claude 后台会话会自动带出过去的运行；cron 和 launchd 没有运行日志，开着看板一段时间就会攒起来。用 webhook 上报的任务会一直记着。

**想加一个工具（GitHub Actions、n8n……）？** 看[架构与新增数据源](docs/architecture.md)，一个文件就够；也可以[开一个 issue](https://github.com/ybkjs/tinyfactory/issues/new/choose) 告诉我们它的数据存在哪。

## 参与贡献

```bash
git clone https://github.com/ybkjs/tinyfactory && cd tinyfactory
npm install
npm run demo        # 演示模式
npm test            # 测试
npm run check       # 语法和清单检查
npm run record      # 重新录 README 里的图（需要 Chrome 和 ffmpeg）
```

欢迎 issue 和 PR，中文英文都可以：[贡献指南](CONTRIBUTING.md) · [行为准则](CODE_OF_CONDUCT.md) · [安全问题](SECURITY.md)。

## 致谢

- 灵感：[@Khazix0918](https://x.com/Khazix0918/status/2112838884510048647)
- 渲染：[three.js](https://threejs.org/)
- 天气：[Open-Meteo](https://open-meteo.com/)

角色是通用造型，没有使用任何官方 logo 素材；Claude、Codex、DeepSeek、OpenClaw 等名称归各自的所有者。

## 许可

[MIT](LICENSE)
