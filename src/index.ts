import { loadAccounts, loadEnvFile } from './accounts';
import type { Account } from './accounts';
import { loadConfig } from './config';
import type { Config } from './config';
import { loadHistory, saveHistory } from './history';
import { Logger } from './logger';
import { Notifier } from './notify';
import { defaultPaths } from './paths';
import type { RunPaths } from './paths';
import { hasProblem } from './summary';
import type { AccountResult } from './types';
import { errMsg, parseDuration, randomBetween, sleep, todayIn } from './util';
import { runAccount } from './wheel';

export interface RunOptions {
    /** Only these account slots (ACCOUNT_N) */
    slots?: number[];
    /** Only these emails */
    emails?: string[];
    /** Show the browser window */
    headed?: boolean;
    paths?: RunPaths;
}

/** Runs the selected accounts and returns the process exit code: 0 ok, 2 something needs attention, 1 crash */
export async function runAll(cfg: Config, accounts: Account[], opts: RunOptions = {}): Promise<number> {
    const paths = opts.paths ?? defaultPaths();
    const logger = new Logger(cfg, paths.logDir);
    const notifier = new Notifier(cfg);
    notifier.attach(logger);

    const wanted = new Set((opts.emails ?? []).map((e) => e.toLowerCase()));
    const selected = accounts.filter((a) =>
        (!opts.slots?.length || opts.slots.includes(a.index)) && (!wanted.size || wanted.has(a.email.toLowerCase()))
    );
    if (!selected.length) {
        logger.error('main', 'No accounts matched. Check your .env and the --account / --email options.');
        await notifier.flush();
        return 1;
    }

    const history = loadHistory(paths.historyFile);
    const persist = (): void => saveHistory(paths.historyFile, history);
    const today = todayIn(cfg.timezone);
    const delayMin = parseDuration(cfg.accountDelay.min);
    const delayMax = parseDuration(cfg.accountDelay.max);
    const lanes = Math.max(1, Math.min(cfg.clusters, selected.length));

    logger.info('main', `Run started for ${today} (${cfg.timezone}): ${selected.length} account(s), ${lanes} cluster(s)`);

    const results: AccountResult[] = new Array<AccountResult>(selected.length);
    let next = 0;
    const lane = async (): Promise<void> => {
        let ranBrowser = false;
        for (;;) {
            const i = next++;
            if (i >= selected.length) return;
            if (ranBrowser) {
                const wait = randomBetween(delayMin, delayMax);
                if (wait > 0) {
                    logger.debug('main', `Waiting ${Math.round(wait / 1000)}s before the next account`);
                    await sleep(wait);
                }
            }
            const result = await runAccount(selected[i], { cfg, logger, history, persist, paths, headless: opts.headed ? false : undefined });
            results[i] = result;
            ranBrowser = result.status !== 'ALREADY_DONE' && result.status !== 'NO_SESSION';
        }
    };
    await Promise.all(Array.from({ length: lanes }, () => lane()));

    const wins = results.reduce((n, r) => n + r.wins, 0);
    logger.info('main', `Run finished: ${results.length} account(s), ${wins} win(s)`);
    await notifier.sendSummary(results, today, logger.getRunLog());
    return hasProblem(results) ? 2 : 0;
}

function parseArgs(argv: string[]): RunOptions & { help: boolean } {
    const o: RunOptions & { help: boolean } = { help: false, slots: [], emails: [] };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--help' || a === '-h') o.help = true;
        else if (a === '--headed') o.headed = true;
        else if (a === '--account') o.slots?.push(Number(argv[++i]));
        else if (a === '--email') o.emails?.push(argv[++i] ?? '');
    }
    return o;
}

async function main(): Promise<void> {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        console.log('Usage: npm run start -- [--account N] [--email you@gmail.com] [--headed]\n  --account N   only ACCOUNT_N from .env (repeatable)\n  --email X     only this account (repeatable)\n  --headed      show the browser window');
        return;
    }
    loadEnvFile();
    const cfg = loadConfig();
    const accounts = loadAccounts();
    if (!accounts.length) throw new Error('No accounts found. Add ACCOUNT_1_EMAIL=... to .env (see env.example).');
    process.exitCode = await runAll(cfg, accounts, args);
}

if (require.main === module) {
    main().catch((e) => {
        console.error(errMsg(e));
        process.exit(1);
    });
}
