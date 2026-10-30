import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './paths';
import { parseDuration } from './util';

export interface LogFilter {
    enabled: boolean;
    mode: 'whitelist' | 'blacklist';
    levels: string[];
    keywords: string[];
    regexPatterns: string[];
}

export interface Config {
    promoUrl: string;
    timezone: string;
    sessionPath: string;
    headless: boolean;
    browser: 'chrome' | 'chromium';
    chromePath: string;
    clusters: number;
    errorDiagnostics: boolean;
    accountDelay: { min: string; max: string };
    globalTimeout: string;
    wheel: {
        keepSpinningAfterWin: boolean;
        maxSpinsPerAccount: number;
        accountTimeout: string;
        stuckAfter: string;
        loginCheckTimeout: string;
        pollInterval: string;
        clickCooldown: string;
        resultDedupe: string;
    };
    schedule: { enabled: boolean; times: string[]; runOnStart: boolean; jitter: string };
    debugLogs: boolean;
    consoleLogFilter: LogFilter;
    proxy: { ignoreCertificateErrors: boolean };
    webhook: {
        maskIdentity: boolean;
        mention: string;
        discord: { enabled: boolean; url: string };
        telegram: { enabled: boolean; botToken: string; chatId: string };
        ntfy: { enabled: boolean; url: string; topic: string; token: string; title: string; tags: string[]; priority: number };
        webhookLogFilter: LogFilter;
    };
}

export const DEFAULT_CONFIG: Config = {
    promoUrl: 'https://www.coca-cola.com/ph/en/offerings/royal-halloween-2026/spook-the-wheel-promo',
    timezone: 'Asia/Manila',
    sessionPath: 'sessions',
    headless: true,
    browser: 'chrome',
    chromePath: '',
    clusters: 1,
    errorDiagnostics: false,
    accountDelay: { min: '1min', max: '3min' },
    globalTimeout: '30sec',
    wheel: {
        keepSpinningAfterWin: true,
        maxSpinsPerAccount: 25,
        accountTimeout: '10min',
        stuckAfter: '2min',
        loginCheckTimeout: '30sec',
        pollInterval: '1500ms',
        clickCooldown: '3sec',
        resultDedupe: '5sec'
    },
    schedule: { enabled: false, times: ['00:05', '12:00'], runOnStart: false, jitter: '2min' },
    debugLogs: false,
    consoleLogFilter: { enabled: false, mode: 'whitelist', levels: ['error', 'warn'], keywords: ['starting account'], regexPatterns: [] },
    proxy: { ignoreCertificateErrors: false },
    webhook: {
        maskIdentity: true,
        mention: '',
        discord: { enabled: false, url: '' },
        telegram: { enabled: false, botToken: '', chatId: '' },
        ntfy: { enabled: false, url: '', topic: '', token: '', title: 'Spook-the-Wheel-Script', tags: ['bot', 'notify'], priority: 3 },
        webhookLogFilter: { enabled: true, mode: 'whitelist', levels: ['error'], keywords: ['won prize', 'daily limit'], regexPatterns: [] }
    }
};

function isObj(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Deep-merge user settings over the defaults (arrays are replaced, not merged) */
function merge<T>(base: T, over: unknown): T {
    if (over === undefined) return base;
    if (!isObj(base) || !isObj(over)) return over as T;
    const out: Record<string, unknown> = { ...base };
    for (const [k, v] of Object.entries(over)) out[k] = k in base ? merge(base[k], v) : v;
    return out as T;
}

export function validateConfig(cfg: Config): void {
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: cfg.timezone });
    } catch {
        throw new Error(`config.json: unknown timezone "${cfg.timezone}" (example: Asia/Manila)`);
    }
    const durations: Array<[string, string]> = [
        ['accountDelay.min', cfg.accountDelay.min], ['accountDelay.max', cfg.accountDelay.max],
        ['globalTimeout', cfg.globalTimeout], ['wheel.accountTimeout', cfg.wheel.accountTimeout],
        ['wheel.stuckAfter', cfg.wheel.stuckAfter], ['wheel.loginCheckTimeout', cfg.wheel.loginCheckTimeout],
        ['wheel.pollInterval', cfg.wheel.pollInterval], ['wheel.clickCooldown', cfg.wheel.clickCooldown],
        ['wheel.resultDedupe', cfg.wheel.resultDedupe], ['schedule.jitter', cfg.schedule.jitter]
    ];
    for (const [name, value] of durations) {
        try { parseDuration(value); } catch (e) { throw new Error(`config.json: ${name}: ${(e as Error).message}`); }
    }
    if (!Number.isInteger(cfg.clusters) || cfg.clusters < 1) throw new Error('config.json: clusters must be a whole number >= 1');
    if (!(cfg.wheel.maxSpinsPerAccount >= 1)) throw new Error('config.json: wheel.maxSpinsPerAccount must be >= 1');
    for (const t of cfg.schedule.times) {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw new Error(`config.json: schedule.times "${t}" must look like 00:05`);
    }
    if (!['chrome', 'chromium'].includes(cfg.browser)) throw new Error('config.json: browser must be "chrome" or "chromium"');
}

/** Defaults + overrides (used by tests and by loadConfig) */
export function buildConfig(overrides: unknown = {}): Config {
    const cfg = merge(DEFAULT_CONFIG, overrides);
    validateConfig(cfg);
    return cfg;
}

export function loadConfig(file: string = path.join(ROOT, 'config.json')): Config {
    if (!fs.existsSync(file)) {
        throw new Error('config.json not found. Copy config.example.json to config.json and edit it.');
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        throw new Error(`config.json is not valid JSON: ${(e as Error).message}`);
    }
    return buildConfig(parsed);
}
