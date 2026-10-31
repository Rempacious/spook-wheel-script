import fs from 'node:fs';
import { chromium } from 'playwright';
import { loadAccounts, loadEnvFile } from '../accounts';
import { findChrome, hasSession } from '../browser';
import { loadConfig } from '../config';
import { errMsg } from '../util';

try {
    const cfg = loadConfig();
    console.log('OK: config.json is valid');
    loadEnvFile();
    const accounts = loadAccounts();
    if (!accounts.length) throw new Error('No accounts configured. Add ACCOUNT_1_EMAIL=you@gmail.com to .env.');
    console.log(`OK: ${accounts.length} account(s) configured`);
    const chrome = findChrome(cfg);
    if (!chrome) throw new Error('Google Chrome is required for manual sign-in. Install it or set chromePath in config.json.');
    console.log('OK: Chrome is available for manual sign-in');
    if (cfg.browser === 'chromium' && !cfg.chromePath && !fs.existsSync(chromium.executablePath())) {
        throw new Error('Bundled Chromium is missing. Run npx playwright install chromium.');
    }
    for (const account of accounts) {
        console.log(hasSession(cfg, account.email)
            ? `OK: ACCOUNT_${account.index} has a saved profile (sign-in validity is checked during a run)`
            : `TODO: ACCOUNT_${account.index} needs sign-in: npm run manual-login -- --email ${account.email}`);
    }
    console.log('Checks complete. No browser was launched or promo entry submitted.');
} catch (error) {
    console.error(`Check failed: ${errMsg(error)}`);
    process.exitCode = 1;
}
