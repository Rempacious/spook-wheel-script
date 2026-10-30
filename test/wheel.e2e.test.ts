// End-to-end: real Chromium + a fake promo page + a fake Discord webhook.
// Skipped automatically when the bundled Chromium is not installed (npx playwright install chromium).
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { chromium } from 'playwright';
import { runAll } from '../src/index';
import { buildConfig } from '../src/config';
import { loadHistory } from '../src/history';
import type { Account } from '../src/accounts';
import type { Config } from '../src/config';
import type { RunPaths } from '../src/paths';

function browserInstalled(): boolean {
    try { return fs.existsSync(chromium.executablePath()); } catch { return false; }
}

const PAGE = `<!doctype html><html><body>
<div id="av" class="user-avatar__image"></div>
<button class="promo-entry__start">Spook the Wheel</button>
<dialog class="promotion__modal">
  <p id="msg"></p>
  <button id="again">SPIN AGAIN</button>
  <button class="cep-modal-dialog__close">X</button>
</dialog>
<script>
const q = new URLSearchParams(location.search);
if (q.get('signedin') === '0') document.getElementById('av').remove();
const seq = (q.get('seq') || 'noTreat,win,limit').split(',');
const texts = { noTreat: 'Boo! No Treat This Time', win: 'You Got Your GHOSTo! Free drink', limit: "That's it for today!" };
let i = 0;
const dlg = document.querySelector('dialog');
const start = document.querySelector('.promo-entry__start');
function spin() { start.disabled = true; setTimeout(function () {
  document.getElementById('msg').textContent = texts[seq[Math.min(i++, seq.length - 1)]];
  if (!dlg.open) dlg.showModal();
}, 150); }
start.onclick = spin;
document.getElementById('again').onclick = function () { dlg.close(); spin(); };
document.querySelector('.cep-modal-dialog__close').onclick = function () { dlg.close(); start.disabled = false; };
</script></body></html>`;

function listen(handler: http.RequestListener): Promise<{ server: http.Server; base: string }> {
    return new Promise((resolve) => {
        const server = http.createServer(handler);
        server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` }));
    });
}

test('wheel e2e', { skip: !browserInstalled() && 'Chromium not installed' }, async (t) => {
    const site = await listen((_req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(PAGE); });
    const hooks: string[] = [];
    const discord = await listen((req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => { hooks.push(Buffer.concat(chunks).toString('latin1')); res.writeHead(204); res.end(); });
    });
    t.after(() => { site.server.close(); discord.server.close(); });

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spook-e2e-'));
    const paths: RunPaths = { logDir: path.join(tmp, 'logs'), historyFile: path.join(tmp, 'logs', 'history.json'), diagnosticsDir: path.join(tmp, 'diag') };
    const account: Account = { index: 1, email: 'juan.delacruz@gmail.com', label: 'Main' };
    fs.mkdirSync(path.join(tmp, 'sessions', 'juan.delacruz_gmail.com'), { recursive: true });

    const cfgFor = (query: string, extra: unknown = {}): Config => buildConfig({
        promoUrl: `${site.base}/?${query}`,
        sessionPath: path.join(tmp, 'sessions'),
        browser: 'chromium',
        headless: true,
        accountDelay: { min: '0ms', max: '0ms' },
        globalTimeout: '10sec',
        wheel: { pollInterval: '100ms', clickCooldown: '250ms', resultDedupe: '800ms', loginCheckTimeout: '3sec', stuckAfter: '20sec', accountTimeout: '60sec' },
        webhook: { discord: { enabled: true, url: `${discord.base}/hook` } },
        ...(extra as object)
    });

    await t.test('spins, logs a win, stops at the daily limit, reports to Discord', async () => {
        const code = await runAll(cfgFor('seq=noTreat,win,limit'), [account], { paths });
        assert.strictEqual(code, 0);
        const results = loadHistory(paths.historyFile).map((h) => h.result);
        assert.deepStrictEqual(results, ['NO TREAT', 'WON PRIZE', 'DAILY LIMIT']);
        const summary = hooks.find((h) => h.includes('payload_json') && h.includes('embeds')) ?? '';
        assert.ok(summary.includes('1 win(s)'));
        assert.ok(summary.includes('ju***@gmail.com'));
        assert.ok(!summary.includes('juan.delacruz@gmail.com'));
        assert.ok(summary.includes('filename="run-'));
    });

    await t.test('a second run the same day skips the finished account', async () => {
        const before = loadHistory(paths.historyFile).length;
        const code = await runAll(cfgFor('seq=noTreat,win,limit'), [account], { paths });
        assert.strictEqual(code, 0);
        assert.strictEqual(loadHistory(paths.historyFile).length, before);
        assert.ok(hooks[hooks.length - 1].includes('Already finished today'));
    });

    await t.test('signed-out session is reported as LOGIN_REQUIRED (exit code 2)', async () => {
        const other: Account = { index: 2, email: 'maria@gmail.com', label: 'Second' };
        fs.mkdirSync(path.join(tmp, 'sessions', 'maria_gmail.com'), { recursive: true });
        const code = await runAll(cfgFor('signedin=0'), [other], { paths });
        assert.strictEqual(code, 2);
        assert.ok(hooks[hooks.length - 1].includes('Session expired'));
    });

    await t.test('missing session is reported as NO_SESSION without launching a browser', async () => {
        const ghost: Account = { index: 3, email: 'ghost@gmail.com', label: 'Ghost' };
        const code = await runAll(cfgFor('seq=limit'), [ghost], { paths });
        assert.strictEqual(code, 2);
        assert.ok(hooks[hooks.length - 1].includes('No saved session'));
    });

    await t.test('keepSpinningAfterWin=false pauses at the first win', async () => {
        const solo: Account = { index: 4, email: 'solo@gmail.com', label: 'Solo' };
        fs.mkdirSync(path.join(tmp, 'sessions', 'solo_gmail.com'), { recursive: true });
        const code = await runAll(cfgFor('seq=win,noTreat,limit', { wheel: { keepSpinningAfterWin: false } }), [solo], { paths });
        assert.strictEqual(code, 0);
        const mine = loadHistory(paths.historyFile).filter((h) => h.account === solo.email).map((h) => h.result);
        assert.deepStrictEqual(mine, ['WON PRIZE']);
    });

    await t.test('safety cap stops a run that never reaches the limit', async () => {
        const capped: Account = { index: 5, email: 'cap@gmail.com', label: 'Cap' };
        fs.mkdirSync(path.join(tmp, 'sessions', 'cap_gmail.com'), { recursive: true });
        const code = await runAll(cfgFor('seq=noTreat,noTreat,noTreat,noTreat,noTreat', { wheel: { maxSpinsPerAccount: 2 } }), [capped], { paths });
        assert.strictEqual(code, 2);
        const mine = loadHistory(paths.historyFile).filter((h) => h.account === capped.email).map((h) => h.result);
        assert.deepStrictEqual(mine, ['NO TREAT', 'NO TREAT', 'RETRY CAP']);
    });
});
