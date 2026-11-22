# dsh-boss-job

AI-assisted job screening for **Boss直聘** (Boss Zhipin): **interview the candidate → collect jobs through your own logged-in Chrome → hard filters + AI scoring → a shortlist you can actually apply to.**

This is not a scraper framework and it does not forge browser fingerprints. It launches a **separate Chrome profile**, lets *you* log in by QR code or SMS, then delegates searching and JD reading to a CLI or MCP server. Judgment stays with the AI you already use.

- Zero runtime dependencies (Node ≥ 20 + local Chrome)
- One core, three entry points: **Skill** (agent workflow), **CLI** (humans), **MCP** (Claude Code / DSH and other hosts)
- Read-only, rate-limited, ≤ 60 JDs per round, never auto-greets or auto-applies

## Why this design

Boss Zhipin's defenses cover TLS fingerprinting, `__zp_stoken__`, font obfuscation and layered CAPTCHAs. The only approach that keeps working in 2025–2026 is **a real browser with a real session**. So the browser layer stays thin:

1. Launch a dedicated Chrome profile at `~/.dsh-boss-job/chrome-profile` — never your daily profile;
2. Reuse its live cookies through CDP; search calls the site's own joblist endpoint, so salaries are plaintext;
3. Fetch detail pages for the JD, company and recruiter activity — strictly read-only.

## Install

Requires Node ≥ 20 and Google Chrome.

```bash
# 1) Use directly, no global install
npx dsh-boss-job doctor

# 2) Install as a DSH plugin (Skill + MCP mounted automatically)
dsh plugin --profile desktop add dsh-boss-job

# 3) Link the Skill into Claude Code / Codex and print MCP config
npx dsh-boss-job setup --host claude
```

## Three steps

```bash
npx dsh-boss-job doctor      # check Chrome, port, data dir, login state
npx dsh-boss-job login       # open the dedicated Chrome; log in yourself
npx dsh-boss-job search --query "美妆运营" --pages 2
```

Then tell a Skill-capable agent:

> Find me a job. E-commerce operations in beauty or food, Hangzhou, at least 7K, no pure ad-buying roles, no apparel.

The agent follows the five phases in `skills/boss-job/references/flows/`: setup → interview → plan confirmation → collection → report.

## CLI

| Command | What it does |
| --- | --- |
| `doctor` | Check Chrome, port, data dir and login state |
| `login` | Open the dedicated Chrome and wait for `wt2` cookie |
| `search --query <kw> [--pages 2] [--city 101210100]` | Search and persist the job list |
| `detail --input <jobs.json> [--limit 15]` | Fetch JDs with rate limiting, retries and abort-on-challenge |
| `filter --input <details.json>` | Local hard filters: lead/manager titles, assistants, anchors/sales, wrong categories, senior years |
| `export --input <details.json> --evaluation <eval.json>` | Render a Markdown report with AI scores |
| `setup [--host dsh\|claude\|codex\|cursor\|auto]` | Link the Skill and print MCP config |
| `mcp` | Run as an MCP stdio server |

## MCP tools

`boss_doctor`, `boss_login`, `boss_search`, `boss_detail`, `boss_prefs_get`, `boss_prefs_set`, `boss_export`.

Host config:

```json
{
  "mcpServers": {
    "boss-job": { "command": "npx", "args": ["-y", "dsh-boss-job", "mcp"] }
  }
}
```

## Data & privacy

- Everything lives under `~/.dsh-boss-job/` (override with `BOSS_JOB_HOME`): profile, jobs, reports, preferences.
- No upload, no account system, no API key, no telemetry.
- The dedicated profile is fully isolated from your daily Chrome.

## Scope & compliance

- Read-only browsing. No auto-apply, no auto-greet, no messages.
- 2.5–4.5s between JDs, ≤ 60 per round, stop immediately on a security challenge.
- Respect Boss Zhipin's Terms of Service; this project is for personal job-search assistance, not bulk or commercial scraping.

## FAQ

**Port busy?** Windows reserved range 9201–9300 is skipped automatically; set `BOSS_JOB_PORT` if needed.

**Still "not logged in"?** Make sure you logged in inside the dedicated window, not your daily Chrome, then run `login` again.

**Why not Playwright?** A real session and a real browser fingerprint are far more durable; Playwright is more likely to be flagged as automation.

## Development

```bash
npm test          # node:test, zero dependencies
node src/cli.mjs --help
```

Layout: `src/core/*` (Chrome/CDP/search/detail/filter/report), `src/mcp.mjs`, `skills/boss-job/` (Skill + five-phase flows), `cordis.patch.yml` (DSH bundle).

## License

MIT
