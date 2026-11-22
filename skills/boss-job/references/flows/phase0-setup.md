# Phase 0：环境与登录

目标：确认这台机器能跑通「专用 Chrome + 真实登录态」，失败就停下来告诉用户缺什么。

## 步骤

1. 运行 `dsh-boss-job doctor`，检查四项：
   - Node 版本 ≥ 18；
   - 找到 Chrome（Windows 常见路径 / macOS / Linux）；
   - 数据目录可写（默认 `~/.dsh-boss-job`，可用 `BOSS_JOB_HOME` 覆盖）；
   - 是否已有专用 profile 与登录态。
2. 若未登录：运行 `dsh-boss-job login`。
   - 会拉起**独立 profile** 的 Chrome（不影响用户日常浏览器）；
   - 请用户在窗口里用手机验证码或微信扫码登录；
   - 登录完成后命令会检测到 `wt2` cookie 并返回。
3. 若 doctor 报「找不到 Chrome」：让用户装 Chrome，或用 `CHROME_PATH` 指定可执行文件。

## 常见问题

- **端口被占用**：Windows 保留段 9201–9300 会被自动跳过；仍失败时换 `BOSS_JOB_PORT`。
- **Chrome 136+ 不允许对默认 profile 开调试**：本包始终使用独立 profile，这是设计前提，不要改成默认 profile。
- **登录后仍提示未登录**：让用户确认登录的是弹出的专用窗口，而不是日常 Chrome；必要时 `login` 重跑一次。

## 完成标准

`doctor` 显示 `登录态: 已登录`，且 `~/.dsh-boss-job/runtime.json` 里的端口可用。
