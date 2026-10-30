import fs from 'node:fs';
import path from 'node:path';
import { loadAccounts, loadEnvFile } from '../accounts';
import { sessionDir, sessionRoot } from '../browser';
import { loadConfig } from '../config';
import { errMsg, sessionKey } from '../util';

function dirSize(dir: string): number {
    let total = 0;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        try {
            total += entry.isDirectory() ? dirSize(p) : fs.statSync(p).size;
        } catch { /* file vanished */ }
    }
    return total;
}

const mb = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function main(): void {
    const argv = process.argv.slice(2);
    const cmd = argv[0];
    loadEnvFile();
    const cfg = loadConfig();
    const root = sessionRoot(cfg);
    const known = new Map(loadAccounts().map((a) => [sessionKey(a.email), a.email]));

    if (cmd === 'list' || !cmd) {
        if (!fs.existsSync(root) || !fs.readdirSync(root).length) {
            console.log('No saved sessions.');
        } else {
            for (const name of fs.readdirSync(root)) {
                const dir = path.join(root, name);
                if (!fs.statSync(dir).isDirectory()) continue;
                console.log(`${known.get(name) ?? name}  |  ${mb(dirSize(dir))}  |  last used ${fs.statSync(dir).mtime.toLocaleString()}${known.has(name) ? '' : '  (not in .env)'}`);
            }
        }
        console.log('\nUsage: npm run clear-sessions -- list | email <address> | all');
        return;
    }
    if (cmd === 'email') {
        const email = argv[1];
        if (!email) { console.log('Usage: npm run clear-sessions -- email you@gmail.com'); process.exit(1); }
        const dir = sessionDir(cfg, email);
        if (!fs.existsSync(dir)) { console.log(`No saved session for ${email}.`); return; }
        fs.rmSync(dir, { recursive: true, force: true });
        console.log(`Removed the session for ${email}. Sign in again with: npm run manual-login -- --email ${email}`);
        return;
    }
    if (cmd === 'all') {
        if (!fs.existsSync(root)) { console.log('No saved sessions.'); return; }
        fs.rmSync(root, { recursive: true, force: true });
        console.log('Removed all saved sessions.');
        return;
    }
    console.log('Usage: npm run clear-sessions -- list | email <address> | all');
    process.exit(1);
}

try {
    main();
} catch (e) {
    console.error(errMsg(e));
    process.exit(1);
}
