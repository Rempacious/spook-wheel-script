import fs from 'node:fs';
import path from 'node:path';
import type { BrowserContext, Page } from 'playwright';
import type { Account } from './accounts';
import { hasSession, launchSession } from './browser';
import type { Config } from './config';
import { alreadyLimitedToday } from './history';
import type { Logger } from './logger';
import type { RunPaths } from './paths';
import type { AccountResult, HistoryEntry } from './types';
import { classifyModal, clean, clip, errMsg, nowIn, parseDuration, sleep, todayIn } from './util';

const NGPS_HOST = 'prod.global.ngps.coca-cola.com';
const CONFIG_ID = 'mukvmpd4mukvmp';

export interface WheelDeps {
    cfg: Config;
    logger: Logger;
    history: HistoryEntry[];
    persist: () => void;
    paths: RunPaths;
    headless?: boolean;
}

// ---------- code that runs inside the promo page ----------
interface PageState {
    modalOpen: boolean;
    text: string;
    startEnabled: boolean;
    pageLimit: boolean;
}

const readState = (): PageState => {
    const modal = document.querySelector('dialog.promotion__modal') as HTMLDialogElement | null;
    const modalOpen = !!(modal && modal.open);
    const start = document.querySelector('button.promo-entry__start') as HTMLButtonElement | null;
    return {
        modalOpen,
        text: modalOpen && modal ? (modal.innerText || modal.textContent || '') : '',
        startEnabled: !!(start && !start.disabled),
        pageLimit: /that.s it for today|already had your turn today/i.test(document.body ? document.body.innerText : '')
    };
};

const advanceModal = (): boolean => {
    const modal = document.querySelector('dialog.promotion__modal') as HTMLDialogElement | null;
    if (!modal) return false;
    const press = (el: HTMLElement): void => {
        ['mouseover', 'mousedown'].forEach((t) => el.dispatchEvent(new MouseEvent(t, { bubbles: true })));
        el.click();
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    };
    const wanted = ['SPIN NOW', 'SPIN HERE', 'SPIN AGAIN', 'TRY AGAIN'];
    for (const b of Array.from(modal.querySelectorAll('button, [role="button"], a')) as HTMLElement[]) {
        if (b.classList.contains('cep-modal-dialog__close') || (b as HTMLButtonElement).disabled) continue;
        const t = (b.innerText || b.textContent || '').trim().toUpperCase();
        if (wanted.some((w) => t.includes(w))) { press(b); return true; }
    }
    const close = modal.querySelector('.cep-modal-dialog__close') as HTMLElement | null;
    if (close) { press(close); return true; }
    if (typeof modal.close === 'function') { modal.close(); return true; }
    return false;
};

const clickStart = (): boolean => {
    const b = document.querySelector('button.promo-entry__start') as HTMLButtonElement | null;
    if (!b || b.disabled) return false;
    ['mouseover', 'mousedown'].forEach((t) => b.dispatchEvent(new MouseEvent(t, { bubbles: true })));
    b.click();
    b.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    return true;
};

// ---------- helpers ----------
const screenshot = (page: Page): Promise<Buffer | null> => page.screenshot({ type: 'png' }).catch(() => null);

/** True when the promo page shows the signed-in avatar */
export async function checkSignedIn(page: Page, timeoutMs: number): Promise<boolean> {
    const el = await page.waitForSelector('.user-avatar__image', { timeout: timeoutMs, state: 'attached' }).catch(() => null);
    return el !== null;
}

async function saveDiagnostics(page: Page, account: Account, why: string, paths: RunPaths, logger: Logger): Promise<void> {
    try {
        fs.mkdirSync(paths.diagnosticsDir, { recursive: true });
        const base = path.join(paths.diagnosticsDir, `${account.label.replace(/\W+/g, '_')}-${why}-${Date.now()}`);
        await page.screenshot({ path: `${base}.png` }).catch(() => undefined);
        fs.writeFileSync(`${base}.html`, await page.content().catch(() => ''));
        logger.debug(account.label, `Diagnostics saved: ${base}.png/.html`);
    } catch { /* diagnostics are best effort */ }
}

/** Opens the saved session headless and reports whether it is still signed in (used after manual-login) */
export async function verifySession(cfg: Config, account: Account): Promise<boolean> {
    let context: BrowserContext | undefined;
    try {
        context = await launchSession(cfg, account, true);
        const page = context.pages()[0] ?? (await context.newPage());
        await page.goto(cfg.promoUrl, { waitUntil: 'domcontentloaded' });
        return await checkSignedIn(page, parseDuration(cfg.wheel.loginCheckTimeout));
    } finally {
        if (context) await context.close().catch(() => undefined);
    }
}

// ---------- one account ----------
export async function runAccount(account: Account, deps: WheelDeps): Promise<AccountResult> {
    const { cfg, logger, history, persist, paths } = deps;
    const tag = account.label;
    const out: AccountResult = { account, status: 'ERROR', wins: 0, noTreat: 0, prizes: [], error: null, screenshot: null };
    const today = todayIn(cfg.timezone);

    if (alreadyLimitedToday(history, account.email, today)) {
        out.status = 'ALREADY_DONE';
        logger.info(tag, 'Already at the daily limit today, skipping');
        return out;
    }
    if (!hasSession(cfg, account.email)) {
        out.status = 'NO_SESSION';
        out.error = `Run: npm run manual-login -- --email ${account.email}`;
        logger.warn(tag, `No saved session. ${out.error}`);
        return out;
    }

    logger.info(tag, 'Starting account');
    let context: BrowserContext | undefined;
    let page: Page | undefined;
    try {
        context = await launchSession(cfg, account, deps.headless);
        page = context.pages()[0] ?? (await context.newPage());

        let lastStatus: number | null = null;
        let lastBody = '';
        page.on('response', (res) => {
            const u = res.url();
            if (u.includes(NGPS_HOST) || u.includes(CONFIG_ID)) {
                lastStatus = res.status();
                res.text().then((t) => { lastBody = clean(t).slice(0, 200); }).catch(() => undefined);
            }
        });

        const record = (result: string, note = ''): void => {
            history.push({
                uid: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                ts: Date.now(),
                time: nowIn(cfg.timezone),
                date: today,
                account: account.email,
                label: account.label,
                result,
                httpStatus: lastStatus,
                response: lastBody,
                note
            });
            persist();
            logger.info(tag, `${result}${note ? ' | ' + note : ''}`);
        };

        logger.debug(tag, 'Opening promo page');
        await page.goto(cfg.promoUrl, { waitUntil: 'domcontentloaded' });

        if (!(await checkSignedIn(page, parseDuration(cfg.wheel.loginCheckTimeout)))) {
            out.status = 'LOGIN_REQUIRED';
            out.error = `Not signed in. Run: npm run manual-login -- --email ${account.email}`;
            logger.error(tag, out.error);
            out.screenshot = await screenshot(page);
            if (cfg.errorDiagnostics) await saveDiagnostics(page, account, 'login', paths, logger);
            return out;
        }
        await page.waitForSelector('button.promo-entry__start', { state: 'attached', timeout: 30_000 }).catch(() => null);

        await spinLoop(page, account, deps, out, record);

        if (['STUCK', 'TIMEOUT', 'CAP'].includes(out.status)) {
            out.screenshot = out.screenshot ?? (await screenshot(page));
            if (cfg.errorDiagnostics) await saveDiagnostics(page, account, out.status.toLowerCase(), paths, logger);
        }
    } catch (e) {
        out.status = 'ERROR';
        out.error = clip(errMsg(e).split('\n')[0], 300);
        logger.error(tag, `Error: ${out.error}`);
        if (page) {
            out.screenshot = out.screenshot ?? (await screenshot(page));
            if (cfg.errorDiagnostics) await saveDiagnostics(page, account, 'error', paths, logger);
        }
    } finally {
        if (context) await context.close().catch(() => undefined);
    }
    return out;
}

/** Same state machine as the userscript: spin, record the result, respin/close, until the daily limit */
async function spinLoop(
    page: Page,
    account: Account,
    deps: WheelDeps,
    out: AccountResult,
    record: (result: string, note?: string) => void
): Promise<void> {
    const { cfg } = deps;
    const w = cfg.wheel;
    const pollMs = parseDuration(w.pollInterval);
    const cooldownMs = parseDuration(w.clickCooldown);
    const dedupeMs = parseDuration(w.resultDedupe);
    const stuckMs = parseDuration(w.stuckAfter);
    const deadline = Date.now() + parseDuration(w.accountTimeout);

    let lastProgress = Date.now();
    let lastAction = 0;
    let lastWin = 0;
    let lastNoTreat = 0;
    let winLoggedThisModal = false;

    while (Date.now() < deadline) {
        await sleep(pollMs);
        const st = await page.evaluate(readState);
        if (!st.modalOpen) winLoggedThisModal = false;
        const canAct = Date.now() - lastAction > cooldownMs;

        if (st.modalOpen) {
            const kind = classifyModal(st.text);

            if (kind === 'limit') {
                record('DAILY LIMIT');
                out.status = 'LIMIT';
                return;
            }
            if (kind === 'win' && (!winLoggedThisModal || Date.now() - lastWin > dedupeMs)) {
                winLoggedThisModal = true;
                lastWin = Date.now();
                lastProgress = Date.now();
                out.wins++;
                const prize = clean(st.text).slice(0, 160);
                out.prizes.push(prize);
                record('WON PRIZE', prize);
            }
            if (kind === 'noTreat' && Date.now() - lastNoTreat > dedupeMs) {
                lastNoTreat = Date.now();
                lastProgress = Date.now();
                out.noTreat++;
                record('NO TREAT');
            }
            if (kind === 'win' && !w.keepSpinningAfterWin) {
                out.status = 'WON_STOPPED';
                return;
            }
            if ((kind === 'win' || kind === 'noTreat') && out.wins + out.noTreat >= w.maxSpinsPerAccount) {
                record('RETRY CAP');
                out.status = 'CAP';
                out.error = `Stopped after ${out.wins + out.noTreat} results (wheel.maxSpinsPerAccount)`;
                return;
            }
            if (canAct && (await page.evaluate(advanceModal))) lastAction = Date.now();
        } else if (!st.startEnabled && st.pageLimit) {
            record('DAILY LIMIT', 'detected from page text');
            out.status = 'LIMIT';
            return;
        } else if (canAct && st.startEnabled) {
            if (await page.evaluate(clickStart)) {
                lastAction = Date.now();
                deps.logger.debug(account.label, 'Clicked the main button');
            }
        }

        if (Date.now() - lastProgress > stuckMs) {
            out.status = 'STUCK';
            out.error = `No result for ${w.stuckAfter} (the page may have changed)`;
            out.screenshot = await screenshot(page);
            return;
        }
    }
    out.status = 'TIMEOUT';
    out.error = `Still running after ${w.accountTimeout}`;
}
