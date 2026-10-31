import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConfig } from '../src/config';

test('partial config inherits defaults without sharing mutable values', () => {
    const cfg = buildConfig({ wheel: { maxSpinsPerAccount: 3 } });
    assert.equal(cfg.wheel.maxSpinsPerAccount, 3);
    assert.equal(cfg.wheel.pollInterval, '1500ms');
    cfg.schedule.times.push('01:00');
    assert.deepEqual(buildConfig().schedule.times, ['00:05', '12:00']);
});

test('invalid settings report the field instead of a runtime TypeError', () => {
    for (const [value, message] of [
        [null, /config.json must be an object/],
        [{ wheel: null }, /config.json.wheel must be an object/],
        [{ headless: 'false' }, /headless must be a boolean/],
        [{ schedule: { times: '00:05' } }, /schedule.times must be an array/],
        [{ wheel: { maxSpinsPerAccount: 1.5 } }, /whole number/],
        [{ globalTimeout: '0ms' }, /globalTimeout must be greater than zero/],
        [{ accountDelay: { min: '5min', max: '1min' } }, /must not exceed/],
        [{ broser: 'chrome' }, /broser is not a recognized setting/],
        [JSON.parse('{"__proto__": {"polluted": true}}'), /not a recognized setting/]
    ] as const) assert.throws(() => buildConfig(value), message);
});
