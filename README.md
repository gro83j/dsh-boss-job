# dsh-boss-job

[![CI](https://github.com/gro83j/dsh-boss-job/actions/workflows/ci.yml/badge.svg)](https://github.com/gro83j/dsh-boss-job/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dsh-boss-job.svg)](https://www.npmjs.com/package/dsh-boss-job)
[![license](https://img.shields.io/npm/l/dsh-boss-job.svg)](LICENSE)


用 AI 帮你在 Boss 直聘上**快速筛岗位**——给**已经知道要投什么**的人：多轮访谈定偏好 → 复用你本机已登录的 Chrome 采集 → 硬筛 + AI 评分 → 输出可投递清单。

它不是爬虫框架，也不伪造浏览器指纹——它只负责拉起一个**独立的 Chrome profile**，让你自己扫码登录，然后把「搜索 / 看 JD / 导出报告」这些脏活交给 CLI 或 MCP，判断交给你正在用的 AI。

- 零运行时依赖（只要 Node ≥ 20 和本机 Chrome）
- 三个入口同一套核心：**Skill**（给 agent 的工作流）、**CLI**（人也能用）、**MCP**（给 Claude Code / DSH 等宿主）
- 只读、限速、单轮详情 ≤ 60，绝不自动打招呼或投递

## 适合谁，不适合谁

**适合**：已经有目标岗位方向（比如「杭州/上海的美妆、食品电商运营」），想把这个方向上的岗位快速翻一遍、筛出可投清单，把时间花在投递和面试上的人。

**不适合**：还没想清楚要做什么的人。这个项目的核心是「筛」，不是「规划」。AI 对具体行业、岗位和就业市场的判断会有偏差，靠低成本的信息收集消不掉这个偏差；方向错了，筛得再快也是白费。

如果你还没定方向，建议先做一次付费职业咨询，或找目标行业的在职前辈聊 1–2 小时，把方向定下来再回来用这个工具。项目里有一个克制的入口分流：没方向时会建议你先去咨询，最多帮你把已有信息整理成一张表（事实整理，不是职业建议），不会替你规划职业，也不会给「你最适合××」的结论。

## 为什么这样做

Boss 直聘的风控覆盖 TLS 指纹、`__zp_stoken__`、字体混淆和多层验证码。2025–2026 年能长期稳定工作的方案只有一种：**用真实浏览器、真实登录态**，而不是在 Node 里模拟浏览器。本项目因此把浏览器层做薄：

1. 启动专用 Chrome（`~/.dsh-boss-job/chrome-profile`），不碰你日常用的 profile；
2. 通过 CDP 复用页面里的真实 cookie，搜索走站点自己的 joblist 接口，薪资是明文；
3. 详情页补 JD、公司信息与招聘者活跃状态，全程只读。

## 安装

需要 Node ≥ 20 与本机 Google Chrome。

```bash
# 方式一：直接用（不需要全局安装）
npx dsh-boss-job doctor

# 方式二：装成 DSH 插件（Skill + MCP 自动挂载）
dsh plugin --profile desktop add dsh-boss-job

# 方式三：给 Claude Code / Codex 装 Skill 并打印 MCP 配置
npx dsh-boss-job setup --host claude
```

## 三步开始

- 定位是筛岗工具，不是职业规划：先问「是不是学生」「有没有心仪岗位」；没方向时建议你先咨询，项目只做信息整理，不替你规划。


- 城市与岗位方向都可多选：支持跨地区、多城市、多方向并行搜索，城市名自动解析。


- 所有筛选条件都来自偏好访谈，代码里没有默认城市、薪资或行业；访谈没问到的，就不筛。


```bash
npx dsh-boss-job doctor      # 自检：Chrome、端口、数据目录、登录态
npx dsh-boss-job login       # 弹出专用 Chrome，用手机验证码/微信登录
npx dsh-boss-job search --query 美妆运营 --pages 2
```

然后在支持 Skill 的 agent 里说一句：

> 帮我找工作，我想做美妆或食品方向的电商运营，杭州，7K 以上，不要纯投流和服装。

agent 会按 `skills/boss-job/references/flows/` 里的五阶段流程执行：环境 → 访谈 → 计划确认 → 采集 → 报告。

## CLI

| 命令 | 作用 |
| --- | --- |
| `doctor` | 自检 Chrome、端口、数据目录、登录态 |
| `login` | 打开专用 Chrome，等待用户登录（检测 `wt2` cookie） |
| `search --query <词> [--pages 2] [--city 101210100]` | 搜索并落盘职位列表 |
| `detail --input <jobs.json> [--limit 15]` | 抓 JD 详情（限速、失败重试、异常中止） |
| `filter --input <details.json>` | 本地硬筛：组长/主管、助理、主播客服销售、无关类目、年限过高 |
| `export --input <details.json> --evaluation <eval.json>` | 渲染 Markdown 报告（含 AI 评分） |
| `setup [--host dsh\|claude\|codex\|cursor\|auto]` | 链接 Skill 到宿主，并打印 MCP 配置 |
| `mcp` | 以 MCP stdio server 运行 |

## MCP 工具

`boss_doctor`、`boss_login`、`boss_search`、`boss_detail`、`boss_prefs_get`、`boss_prefs_set`、`boss_export`。

Claude Code / 其他宿主配置：

```json
{
  "mcpServers": {
    "boss-job": { "command": "npx", "args": ["-y", "dsh-boss-job", "mcp"] }
  }
}
```

## 数据与隐私

- 所有数据只写在 `~/.dsh-boss-job/`（可用 `BOSS_JOB_HOME` 覆盖）：profile、jobs、reports、preferences。
- 不上传任何数据；没有账号体系、没有 API key、没有遥测。
- 专用 profile 与你的日常 Chrome 完全隔离，退出后不影响原浏览器。

## 边界与合规

- 只读浏览，不自动投递、不自动打招呼、不发消息。
- 详情限速 2.5–4.5 秒、单轮 ≤ 60，遇到安全验证立即停止并提示。
- 请遵守 Boss 直聘的用户协议；本项目用于个人求职辅助，不建议高频、批量或商业采集。

## 常见问题

**Chrome 打不开 / 端口被占用？** Windows 保留端口段 9201–9300 会自动跳过；仍失败时设置 `BOSS_JOB_PORT`。

**提示未登录？** 确认登录的是本项目弹出的专用窗口，而不是日常 Chrome；再跑一次 `login`。

**为什么不直接用 Playwright？** 真实登录态 + 真实浏览器指纹最稳；Playwright 反而更容易被识别为自动化环境。

## 路线图

- **自动打招呼 / 投递简历（开发中）**：作者正在逐步完善，敬请期待。原则不变——逐条让你确认、限速、随时可停，不做无人值守的群发；只在平台规则允许的范围内实现。**当前版本仍是严格只读**，不自动打招呼、不自动投递。
- **筛岗质量**：更多筛选维度、JD 结构化抽取、从 JD 反推面试问题。
- 想要什么功能，欢迎直接提：805947599@qq.com 或 GitHub Issue。

## 关于作者与声明

- 本项目由 **大肥鱼** 一个人 + AI 协作完成（solo project），没有团队、没有商业支持。
- 这是作者第一次把产品打包发布到 GitHub / npm，经验不足，代码质量、文档和边界处理难免有疏漏，**质量问题可能存在**，欢迎提 Issue 指正，也请使用者多点包容。
- 建议先小范围试用、自己检查输出，再用于重要决策。

## 反馈与联系

使用中遇到问题、有改动建议、想加功能，都欢迎联系作者：**805947599@qq.com**（也可以在 GitHub 提 Issue）。

## 开发

```bash
npm test          # node:test，零依赖
node src/cli.mjs --help
```

目录：`src/core/*`（Chrome/CDP/搜索/详情/筛选/报告）、`src/mcp.mjs`、`skills/boss-job/`（Skill 与五阶段流程）、`cordis.patch.yml`（DSH bundle）。

## License

MIT

## 致谢

职业方向探索（phase0.5）的方法论参考了 MIT 许可的 [career-coach](https://github.com/Jeff-Kazzee/career-coach)；本项目未复制其文本，只借鉴了「证据优先、先诊断再给方向」的流程。
