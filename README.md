# Spook-the-Wheel-Script

Automated Spook the Wheel script, using TypeScript and Playwright. It runs your accounts through the
promo once a day, keeps spinning until the site says the daily limit is reached, and reports to
Discord, Telegram and/or ntfy. Project layout and commands follow
[TheNetsky/Microsoft-Rewards-Script](https://github.com/TheNetsky/Microsoft-Rewards-Script) (without Docker).

## Table of contents

1. [How sign-in works](#how-sign-in-works)
2. [Setup](#setup)
3. [Run it](#run-it)
4. [Schedule it every day](#schedule-it-every-day)
5. [Commands](#commands)
6. [Configuration options](#configuration-options)
7. [Notifications](#notifications)
8. [Troubleshooting](#troubleshooting)
9. [What is (not) copied from the reference project](#what-is-not-copied-from-the-reference-project)

## How sign-in works

The promo uses **Sign in with Google**. Google refuses sign-ins from automated browsers, so this script never
types your Google password (and `.env` has no password field). Instead:

1. You sign in once per account in a **normal Chrome window**: `npm run manual-login -- --email you@gmail.com`
2. The saved browser session lives in `sessions/<email>/`.
3. Every run re-opens that session in the background, already signed in.

If a session expires, the account shows **🔑 Session expired** in your notification (with a screenshot) and the
run exits with code 2. Run `manual-login` for it again.

> Treat `sessions/`, `.env` and `config.json` like passwords. Anyone holding them can use your sessions and post
> to your webhooks. They are in `.gitignore`.

## Setup

Requires **Node.js 22 or newer** and **Google Chrome**.

```bash
git clone <your copy of this folder>   # or unzip it
cd spook-wheel-script
npm install
cp env.example .env                    # Windows: copy env.example .env
cp config.example.json config.json     # Windows: copy config.example.json config.json
```

### Accounts (`.env`)

```
ACCOUNT_1_EMAIL=you@gmail.com
ACCOUNT_1_LABEL=Main account
ACCOUNT_2_EMAIL=second@gmail.com
```

- Slots need not be contiguous. Accounts run in ascending slot order.
- Optional per-account proxy: `ACCOUNT_N_PROXY_URL`, `ACCOUNT_N_PROXY_USERNAME`, `ACCOUNT_N_PROXY_PASSWORD`
  (`http`, `https`, `socks4`, `socks5`; authenticated SOCKS is not supported by the browser).

### Sign in each account once

```bash
npm run build
npm run manual-login -- --email you@gmail.com
```

Chrome opens on the promo page. Sign in with Google, check that you see your avatar, then **close all Chrome
windows of that profile**. The script then re-opens the session headless to confirm it works.
Use `--fresh` to throw the old session away first, or `--no-verify` to skip the check.

### Config (`config.json`)

Everything has a default, so `config.json` can be as small as `{}`. Add only what you want to change.
See [Configuration options](#configuration-options). Turn on a notification target under `webhook`.

## Run it

```bash
npm run build            # compile (run again after any code change)
npm run start            # run every account once
npm run start -- --account 2 --headed     # only ACCOUNT_2, with a visible browser
npm run start -- --email you@gmail.com
```

Exit codes: `0` all good, `2` some account needs attention (expired session, stuck, cap reached…), `1` crashed.

## Schedule it every day

The promo resets at midnight in `timezone` (default `Asia/Manila`). Two options:

**A. Built-in scheduler** (keep it running in a terminal, `pm2`, a Windows service, `systemd`, etc.)

```json
"schedule": { "enabled": true, "times": ["00:05", "12:00"], "runOnStart": false, "jitter": "2min" }
```
```bash
npm run schedule
```
A slot that was missed (computer asleep) runs as soon as the scheduler is back, once per day.
A second slot is harmless: accounts already at the daily limit are skipped.

**B. System scheduler**

Windows (Task Scheduler):
```bat
schtasks /Create /SC DAILY /TN "SpookWheel" /ST 00:05 /TR "cmd /c cd /d C:\path\to\spook-wheel-script && npm run start"
```
macOS / Linux (`crontab -e`):
```
5 0 * * * cd /path/to/spook-wheel-script && npm run start >> logs/cron.log 2>&1
```

The computer must be on and awake. On a headless Linux server use `xvfb-run` and set `"headless": false` if the
site rejects headless browsers.

## Commands

| Command | What it does |
|---|---|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run pre-build` | Delete `dist/` (clean build) |
| `npm run start` | Run all accounts once |
| `npm run schedule` | Built-in daily scheduler |
| `npm run manual-login -- --email x@y.com` | One-time Google sign-in for an account |
| `npm run clear-sessions -- list` | Show saved sessions |
| `npm run clear-sessions -- email x@y.com` | Delete one saved session |
| `npm run clear-sessions -- all` | Delete every saved session |
| `npm run typecheck` | Type-check without building |
| `npm test` | Build and run unit + browser tests |

## Configuration options

| Key | Default | Meaning |
|---|---|---|
| `promoUrl` | the PH Halloween promo page | Page to spin on |
| `timezone` | `Asia/Manila` | Decides what "today" means for the daily-limit check and the scheduler |
| `sessionPath` | `sessions` | Where saved sign-ins live |
| `headless` | `true` | `false` shows the browser window |
| `browser` | `chrome` | `chrome` = installed Chrome, `chromium` = Playwright's (`npx playwright install chromium`) |
| `chromePath` | `""` | Use a specific browser executable |
| `clusters` | `1` | Accounts processed at the same time |
| `errorDiagnostics` | `false` | Save a screenshot + HTML to `diagnostics/` when something fails |
| `accountDelay.min` / `.max` | `1min` / `3min` | Random pause between accounts in the same lane (use `0ms` to disable) |
| `globalTimeout` | `30sec` | Default timeout for browser actions |
| `wheel.keepSpinningAfterWin` | `true` | Keep spinning after a win until the daily limit |
| `wheel.maxSpinsPerAccount` | `25` | Safety cap on results (wins + No Treat) per account per run |
| `wheel.accountTimeout` | `10min` | Hard time limit per account |
| `wheel.stuckAfter` | `2min` | No result for this long = reported as stuck |
| `wheel.loginCheckTimeout` | `30sec` | How long to wait for the signed-in avatar |
| `wheel.pollInterval` / `clickCooldown` / `resultDedupe` | `1500ms` / `3sec` / `5sec` | Spin loop timing |
| `schedule.*` | see above | Built-in scheduler |
| `debugLogs` | `false` | Show debug lines |
| `consoleLogFilter` | disabled | Whitelist/blacklist console output by `levels`, `keywords`, `regexPatterns` |
| `proxy.ignoreCertificateErrors` | `false` | For proxies that re-sign HTTPS |

Durations accept `500ms`, `30sec`, `1min`, `2h`.

## Notifications

Under `webhook` in `config.json`:

| Key | Meaning |
|---|---|
| `maskIdentity` | `true` shows `ju***@gmail.com` instead of the full email |
| `mention` | Discord mention such as `<@123456789>`, used only when an account needs attention |
| `discord` | `{ "enabled": true, "url": "https://discord.com/api/webhooks/..." }` |
| `telegram` | `{ "enabled": true, "botToken": "...", "chatId": "..." }` |
| `ntfy` | `{ "enabled": true, "url": "https://ntfy.sh", "topic": "...", "token": "", "title": "...", "tags": [], "priority": 3 }` |
| `webhookLogFilter` | Which live log lines are forwarded (default: errors, wins, daily limit) |

At the end of every run you also get a **summary**: one entry per account (wins, No Treat count, prize text, status).
Discord additionally gets the run log as a file and a screenshot for any account that got stuck or lost its session.

Every result is kept in `logs/history.json` (this is also how an account that already hit today's limit is skipped).
Daily logs are written to `logs/run-YYYY-MM-DD.log`.

## Troubleshooting

- **`Session expired` / `LOGIN_REQUIRED`**: run `npm run manual-login -- --email you@gmail.com` again.
  If it happens on every run, the site is probably dropping its login when the browser closes. Tell me what the sign-in screen looks like and an automatic re-sign-in step can be added.
- **`Got stuck` plus screenshot**: the promo page probably changed (button or popup text). Send me the screenshot.
- **Chrome not found**: install Google Chrome or set `chromePath`.
- **"profile in use" errors**: close every Chrome window using that profile before running.
- **Run once with a visible window** to watch it: `npm run start -- --account 1 --headed`.
- **Enable `errorDiagnostics`** to get a screenshot and the page HTML when something fails.

## What is (not) copied from the reference project

Same: TypeScript + Playwright, `.env` account slots, `config.json`, `build`/`start` scripts, `manual-login`,
`clear-sessions`, sessions folder, per-account proxy, clusters, account delay, log filters, Discord/Telegram/ntfy.

Different on purpose:
- **No stored passwords or 2FA secrets.** Google sign-in is done by you, in a normal Chrome window.
- **No fingerprint spoofing or anti-detection tricks.** Only plain pacing (random delay between accounts, scheduler jitter).
- **No Docker, control API or dashboard** (as requested / out of scope).

## Disclaimer

Use only accounts you own, and check the promo's terms: many promos limit entries per person, and automation or
multiple accounts can get entries disqualified. You are responsible for how you use this script.
