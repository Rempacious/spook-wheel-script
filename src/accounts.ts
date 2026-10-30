import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './paths';

export interface ProxyConfig {
    server: string;
    username?: string;
    password?: string;
}

export interface Account {
    index: number;
    email: string;
    label: string;
    proxy?: ProxyConfig;
}

/** Minimal .env reader (KEY=value lines). Real environment variables win. */
export function loadEnvFile(file: string = path.join(ROOT, '.env'), env: NodeJS.ProcessEnv = process.env): void {
    if (!fs.existsSync(file)) return;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        if (line.trim().startsWith('#')) continue;
        const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
        if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
}

export function parseProxy(url: string, username: string | undefined, password: string | undefined, tag: string): ProxyConfig {
    let raw = url.trim();
    if (!/^[a-z0-9]+:\/\//i.test(raw)) raw = `http://${raw}`;
    let u: URL;
    try {
        u = new URL(raw);
    } catch {
        throw new Error(`${tag}: PROXY_URL "${url}" is not a valid URL`);
    }
    const proto = u.protocol.replace(':', '');
    if (!['http', 'https', 'socks4', 'socks5'].includes(proto)) {
        throw new Error(`${tag}: proxy protocol must be http, https, socks4 or socks5 (got "${proto}")`);
    }
    if (Boolean(username) !== Boolean(password)) {
        throw new Error(`${tag}: set both PROXY_USERNAME and PROXY_PASSWORD, or neither`);
    }
    if (username && proto.startsWith('socks')) {
        throw new Error(`${tag}: the browser does not support authenticated SOCKS proxies`);
    }
    const proxy: ProxyConfig = { server: `${proto}://${u.host}` };
    if (username && password) {
        proxy.username = username;
        proxy.password = password;
    }
    return proxy;
}

/** Reads ACCOUNT_N_EMAIL / _LABEL / _PROXY_* blocks. Slots may have gaps; they run in ascending order. */
export function loadAccounts(env: NodeJS.ProcessEnv = process.env): Account[] {
    const slots: number[] = [];
    for (const key of Object.keys(env)) {
        const m = /^ACCOUNT_(\d+)_EMAIL$/.exec(key);
        if (m && env[key]?.trim()) slots.push(Number(m[1]));
    }
    slots.sort((a, b) => a - b);

    const seen = new Set<string>();
    const accounts: Account[] = [];
    for (const n of slots) {
        const tag = `ACCOUNT_${n}`;
        const email = (env[`${tag}_EMAIL`] ?? '').trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`${tag}_EMAIL "${email}" is not a valid email address`);
        const lower = email.toLowerCase();
        if (seen.has(lower)) throw new Error(`${tag}_EMAIL "${email}" is listed twice`);
        seen.add(lower);

        const account: Account = { index: n, email, label: (env[`${tag}_LABEL`] ?? '').trim() || `Account ${n}` };
        const proxyUrl = (env[`${tag}_PROXY_URL`] ?? '').trim();
        if (proxyUrl) {
            account.proxy = parseProxy(proxyUrl, env[`${tag}_PROXY_USERNAME`]?.trim() || undefined, env[`${tag}_PROXY_PASSWORD`] || undefined, tag);
        }
        accounts.push(account);
    }
    return accounts;
}
