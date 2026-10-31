import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { loadAccounts, loadEnvFile } from '../accounts';
import { findChrome, sessionDir } from '../browser';
import { loadConfig } from '../config';
import { errMsg } from '../util';
import { verifySession } from '../wheel';

// One-time sign-in. Opens a NORMAL Chrome window (not an automated one) with this account's
// session folder, so Google lets you sign in. Nothing here ever sees your password.
async function main(): Promise<void> {
    const argv = process.argv.slice(2);
    const emailArg = argv[argv.indexOf('--email') + 1];
    const fresh = argv.includes('--fresh');
    const skipVerify = argv.includes('--no-verify');

    loadEnvFile();
    const cfg = loadConfig();
    const accounts = loadAccounts();
    if (argv.indexOf('--email') === -1 || !emailArg) {
        console.log(`Usage: npm run manual-login -- --email you@gmail.com [--fresh] [--no-verify]\nAccounts in .env: ${accounts.map((a) => a.email).join(', ') || '(none)'}`);
        process.exit(1);
    }
    const account = accounts.find((a) => a.email.toLowerCase() === emailArg.toLowerCase());
    if (!account) {
        console.log(`"${emailArg}" is not in your .env. Accounts: ${accounts.map((a) => a.email).join(', ') || '(none)'}`);
        process.exit(1);
    }
    const chrome = findChrome(cfg);
    if (!chrome) {
        console.log('Could not find Google Chrome. Install it, or set "chromePath" in config.json.');
        process.exit(1);
    }

    const dir = sessionDir(cfg, account.email);
    if (fresh && fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
        console.log('Old session removed (--fresh).');
    }
    fs.mkdirSync(dir, { recursive: true });

    console.log(`Opening Chrome for ${account.label} (${account.email}).

  1. Sign in with Google on the promo page as you normally would.
  2. Make sure you can see your avatar / signed-in state.
  3. Close ALL Chrome windows of this profile so the session is saved.
`);
    const args = [`--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check'];
    if (account.proxy) args.push(`--proxy-server=${account.proxy.server}`);
    args.push(cfg.promoUrl);
    await new Promise<void>((resolve, reject) => {
        const child = spawn(chrome, args, { stdio: 'ignore' });
        child.on('error', reject);
        child.on('exit', (code, signal) => {
            if (code === 0) resolve();
            else reject(new Error(`Chrome closed unexpectedly (${signal ?? code}). Try signing in again.`));
        });
    });
    console.log('Chrome closed. Session saved.');

    if (skipVerify) return;
    console.log('Checking that the session works...');
    const ok = await verifySession(cfg, account);
    if (ok) {
        console.log('Signed in. You can now run: npm run start');
    } else {
        console.log('Could not see a signed-in state. Run this command again and make sure you finish signing in before closing Chrome.');
        process.exitCode = 2;
    }
}

main().catch((e) => {
    console.error(errMsg(e));
    process.exit(1);
});
