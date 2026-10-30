import test from 'node:test';
import assert from 'node:assert';
import { classifyModal, maskIdentity, parseDuration, sessionKey, timeIn, todayIn } from '../src/util';
import { buildConfig } from '../src/config';

test('parseDuration understands ms/sec/min/h and rejects junk', () => {
    assert.strictEqual(parseDuration('500ms'), 500);
    assert.strictEqual(parseDuration('30sec'), 30_000);
    assert.strictEqual(parseDuration('1min'), 60_000);
    assert.strictEqual(parseDuration('2h'), 7_200_000);
    assert.strictEqual(parseDuration(1234), 1234);
    assert.throws(() => parseDuration('soon'));
});

test('classifyModal recognises each popup', () => {
    assert.strictEqual(classifyModal('You Got Your GHOSTo! claim it'), 'win');
    assert.strictEqual(classifyModal("Congratulations, you're a winner!"), 'win');
    assert.strictEqual(classifyModal("That's it for today!"), 'limit');
    assert.strictEqual(classifyModal('That’s it for today!'), 'limit');
    assert.strictEqual(classifyModal('Boo! No Treat This Time'), 'noTreat');
    assert.strictEqual(classifyModal('something else'), null);
});

test('maskIdentity and sessionKey', () => {
    assert.strictEqual(maskIdentity('juan.dela@gmail.com'), 'ju***@gmail.com');
    assert.strictEqual(sessionKey(' Juan.Dela@Gmail.com '), 'juan.dela_gmail.com');
});

test('date helpers return stable formats', () => {
    assert.match(todayIn('Asia/Manila'), /^\d{4}-\d{2}-\d{2}$/);
    assert.match(timeIn('Asia/Manila'), /^([01]\d|2[0-3]):[0-5]\d$/);
    assert.strictEqual(timeIn('Asia/Manila', new Date('2026-10-29T16:05:00Z')), '00:05');
    assert.strictEqual(todayIn('Asia/Manila', new Date('2026-10-29T16:05:00Z')), '2026-10-30');
});

test('buildConfig merges over defaults and validates', () => {
    const cfg = buildConfig({ clusters: 2, wheel: { maxSpinsPerAccount: 5 } });
    assert.strictEqual(cfg.clusters, 2);
    assert.strictEqual(cfg.wheel.maxSpinsPerAccount, 5);
    assert.strictEqual(cfg.wheel.pollInterval, '1500ms');   // untouched default
    assert.throws(() => buildConfig({ timezone: 'Mars/Base' }));
    assert.throws(() => buildConfig({ accountDelay: { min: 'x', max: '1min' } }));
    assert.throws(() => buildConfig({ schedule: { times: ['25:00'] } }));
    assert.throws(() => buildConfig({ clusters: 0 }));
});
