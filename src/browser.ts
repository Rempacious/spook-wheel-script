import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { chromium } from 'playwright';
import type { BrowserContext, BrowserType } from 'playwright';
import type { Account } from './accounts';
import type { Config } from './config';
import { ROOT } from './paths';
import { parseDuration, sessionKey } from './util';

type PersistentOptions = NonNullable<Parameters<BrowserType['launchPersistentContext']>[1]>;

export const sessionRoot = (cfg: Config): string => path.resolve(ROOT, cfg.sessionPath);
export const sessionDir = (cfg: Config, email: string): string => path.join(sessionRoot(cfg), sessionKey(email));
export const hasSession = (cfg: Config, email: string): boolean => fs.existsSync(sessionDir(cfg, email));

/** Installed Google Chrome (used for the one-time manual sign-in) */
export function findChrome(cfg: Config): string | null {
    if (cfg.chromePath && fs.existsSync(cfg.chromePath)) return cfg.chromePath;
    const candidates: string[] = [];
    if (process.platform === 'win32') {
        for (const base of [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]) {
            if (base) candidates.push(path.join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'));
        }
    } else if (process.platform === 'darwin') {
        candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
    } else {
        for (const bin of ['google-chrome-stable', 'google-chrome', 'chromium-browser', 'chromium']) {
            try {
                candidates.push(execSync(`which ${bin}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim());
            } catch { /* not installed */ }
        }
    }
    return candidates.find((p) => p && fs.existsSync(p)) ?? null;
}

/** Opens the account's saved session (a persistent browser profile in ./sessions/<email>) */
export async function launchSession(cfg: Config, account: Account, headlessOverride?: boolean): Promise<BrowserContext> {
    const opts: PersistentOptions = {
        headless: headlessOverride ?? cfg.headless,
        viewport: { width: 1280, height: 900 },
        locale: 'en-PH',
        timezoneId: cfg.timezone,
        ignoreHTTPSErrors: cfg.proxy.ignoreCertificateErrors
    };
    if (account.proxy) opts.proxy = account.proxy;
    if (cfg.chromePath) opts.executablePath = cfg.chromePath;
    else if (cfg.browser === 'chrome') opts.channel = 'chrome';

    const context = await chromium.launchPersistentContext(sessionDir(cfg, account.email), opts);
    const t = parseDuration(cfg.globalTimeout);
    context.setDefaultTimeout(t);
    context.setDefaultNavigationTimeout(Math.max(t, 60_000));
    return context;
}
