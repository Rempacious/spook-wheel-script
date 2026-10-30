import test from 'node:test';
import assert from 'node:assert';
import { buildEmbed, buildText, hasProblem } from '../src/summary';
import { buildConfig } from '../src/config';
import type { AccountResult } from '../src/types';

const mk = (over: Partial<AccountResult>): AccountResult => ({
    account: { index: 1, email: 'juan@gmail.com', label: 'Main' },
    status: 'LIMIT', wins: 0, noTreat: 0, prizes: [], error: null, screenshot: null, ...over
});

test('embed: counts, colours, masking, 25-field cap', () => {
    const cfg = buildConfig({});
    const good = [mk({ wins: 2, noTreat: 3, prizes: ['You Got Your GHOSTo!'] })];
    const e = buildEmbed(good, cfg, '2026-10-30');
    assert.ok(e.description.includes('1 account(s)') && e.description.includes('2 win(s)'));
    assert.strictEqual(e.color, 0x57f287);
    assert.ok(e.fields[0].value.includes('ju***@gmail.com'));
    assert.ok(!JSON.stringify(e).includes('juan@gmail.com'));

    const bad = [mk({}), mk({ status: 'LOGIN_REQUIRED', error: 'Not signed in' })];
    assert.ok(hasProblem(bad));
    assert.strictEqual(buildEmbed(bad, cfg, 'd').color, 0xed4245);
    assert.ok(buildEmbed(bad, cfg, 'd').description.includes('1 need attention'));

    const many = Array.from({ length: 40 }, () => mk({}));
    assert.strictEqual(buildEmbed(many, cfg, 'd').fields.length, 25);

    const unmasked = buildConfig({ webhook: { maskIdentity: false } });
    assert.ok(buildEmbed(good, unmasked, 'd').fields[0].value.includes('juan@gmail.com'));
});

test('plain text summary for Telegram / ntfy', () => {
    const t = buildText([mk({ wins: 1, noTreat: 1, prizes: ['Free drink'] })], buildConfig({}), '2026-10-30');
    assert.ok(t.includes('Spook the Wheel: 2026-10-30') && t.includes('Free drink') && t.includes('Done: 1 win(s)'));
});
