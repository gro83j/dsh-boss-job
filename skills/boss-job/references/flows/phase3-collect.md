# Phase 3：采集

目标：在限速与止损前提下拿到列表与 JD 正文。

## 顺序

1. 列表：`dsh-boss-job search --query <词> --pages <n>`，输出到 `~/.dsh-boss-job/jobs/<时间>/jobs.json`。
2. 硬筛：`dsh-boss-job filter --input <jobs.json>`，只按 `preferences.json` 里用户明确写出的条件过滤（城市/薪资/经验/活跃度/排除项）；文件里没写的不筛。
3. 详情：`dsh-boss-job detail --input <kept.json> --limit 15`，每批 ≤ 15，间隔由 CLI 控制（2.5–4.5s）。
4. 多批之间向用户报进度：已看 N 个、剩 M 个、有无异常。

## 止损

- 页面出现 `安全验证`、`_security_check`、验证码 → 立即停，保留已抓数据并告诉用户。
- 连续 3 个详情被重定向回列表 → 视为风控，停止本轮。
- 登录态失效（无 `wt2`）→ 停，让用户重新 `login`。

## 数据字段

`id, title, salaryRaw, salaryMin, salaryMax, salaryUnit, area, experience, degree, company, companySize, industry, active, tags[], jd, url, fetchedAt`

缺失值写 `null`，不要用 0 或空字符串冒充。

## 注意

- 列表页薪资可能是字体混淆的乱码，**以详情页 `.salary` 明文为准**。
- 详情页可能带登录弹窗，但正文仍可读；不要点弹窗里的按钮。
- 不要并发开多个 tab；始终复用同一个 tab。
