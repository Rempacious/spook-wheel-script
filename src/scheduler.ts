import fs from 'node:fs';
import path from 'node:path';
import { loadAccounts, loadEnvFile } from './accounts';
import { loadConfig } from './config';
import type { Config } from './config';
import type { Account } from './accounts';
import { runAll } from './index';
import { defaultPaths } from './paths';
import { errMsg, parseDuration, randomBetween, sleep, timeIn, todayIn } from './util';

const TICK_MS = 15_000;

interface State { done: string[] }

function loadState(file: string): State {
    try {
        const v = JSON.parse(fs.readFileSync(file, 'utf8')) as State;
        return { done: Array.isArray(v.done) ? v.done : [] };
    } catch {
        return { done: [] };
    }
}

function saveState(file: string, state: State): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(state, null, 2));
}

/** Slots that are due now and not yet run today (a missed slot catches up as soon as the computer is back) */
export function dueSlots(times: string[], nowHHMM: string, today: string, done: string[]): string[] {
    return times.filter((t) => nowHHMM >= t && !done.includes(`${today} ${t}`));
}

async function execute(cfg: Config, accounts: Account[], why: string): Promise<void> {
    const jitter = randomBetween(0, parseDuration(cfg.schedule.jitter));
    console.log(`[scheduler] ${why}: starting in ${Math.round(jitter / 1000)}s`);
    await sleep(jitter);
    try {
        const code = await runAll(cfg, accounts, {});
        console.log(`[scheduler] run finished with exit code ${code}`);
    } catch (e) {
        console.error(`[scheduler] run crashed: ${errMsg(e)}`);
    }
}

async function main(): Promise<void> {
    loadEnvFile();
    const cfg = loadConfig();
    const accounts = loadAccounts();
    if (!accounts.length) throw new Error('No accounts found. Add ACCOUNT_1_EMAIL=... to .env (see env.example).');
    if (!cfg.schedule.enabled) {
        console.log('schedule.enabled is false in config.json. Set it to true to use the built-in daily scheduler.');
        return;
    }

    const stateFile = path.join(defaultPaths().logDir, 'scheduler-state.json');
    const state = loadState(stateFile);
    console.log(`[scheduler] running daily at ${cfg.schedule.times.join(', ')} (${cfg.timezone}). Press Ctrl+C to stop.`);

    if (cfg.schedule.runOnStart) await execute(cfg, accounts, 'runOnStart');

    for (;;) {
        const today = todayIn(cfg.timezone);
        const due = dueSlots(cfg.schedule.times, timeIn(cfg.timezone), today, state.done);
        if (due.length) {
            due.forEach((t) => state.done.push(`${today} ${t}`));
            state.done = state.done.slice(-50);
            saveState(stateFile, state);
            await execute(cfg, accounts, `slot ${due.join(', ')}`);
        }
        await sleep(TICK_MS);
    }
}

if (require.main === module) {
    main().catch((e) => {
        console.error(errMsg(e));
        process.exit(1);
    });
}
