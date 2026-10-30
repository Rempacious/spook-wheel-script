import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Logger, passesFilter } from '../src/logger';
import { buildConfig } from '../src/config';
import { dueSlots } from '../src/scheduler';

const base = { enabled: true, mode: 'whitelist' as const, levels: ['error'], keywords: ['won prize'], regexPatterns: ['^limit \\d+'] };

test('whitelist / blacklist / regex filters', () => {
    assert.ok(passesFilter(base, { level: 'error', tag: 't', message: 'x' }));
    assert.ok(passesFilter(base, { level: 'info', tag: 't', message: 'WON PRIZE | cola' }));
    assert.ok(passesFilter(base, { level: 'info', tag: 'limit 3', message: 'regex hit' }));
    assert.ok(!passesFilter(base, { level: 'info', tag: 't', message: 'nothing special' }));
    assert.ok(passesFilter({ ...base, mode: 'blacklist' }, { level: 'info', tag: 't', message: 'nothing special' }));
    assert.ok(!passesFilter({ ...base, mode: 'blacklist' }, { level: 'error', tag: 't', message: 'x' }));
    assert.ok(passesFilter({ ...base, enabled: false }, { level: 'debug', tag: 't', message: 'anything' }));
});

test('Logger writes the file, keeps the run log, hides debug unless enabled, feeds sinks', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spook-log-'));
    const cfg = buildConfig({ consoleLogFilter: { enabled: true, levels: ['error'], keywords: [], regexPatterns: [] } });
    const logger = new Logger(cfg, dir);
    const seen: string[] = [];
    logger.addSink((l) => seen.push(`${l.level}:${l.message}`));
    logger.info('a', 'hello');
    logger.debug('a', 'secret');
    assert.deepStrictEqual(seen, ['info:hello']);
    assert.ok(logger.getRunLog().includes('hello') && !logger.getRunLog().includes('secret'));
    const files = fs.readdirSync(dir);
    assert.strictEqual(files.length, 1);
    assert.ok(fs.readFileSync(path.join(dir, files[0]), 'utf8').includes('[INFO] [a] hello'));

    const dbg = new Logger(buildConfig({ debugLogs: true, consoleLogFilter: { enabled: true, levels: [], keywords: ['zzz'], regexPatterns: [] } }), null);
    dbg.debug('a', 'shown in run log');
    assert.ok(dbg.getRunLog().includes('shown in run log'));
});

test('scheduler: due slots catch up once and only once per day', () => {
    const times = ['00:05', '12:00'];
    assert.deepStrictEqual(dueSlots(times, '00:04', '2026-10-30', []), []);
    assert.deepStrictEqual(dueSlots(times, '00:05', '2026-10-30', []), ['00:05']);
    assert.deepStrictEqual(dueSlots(times, '15:00', '2026-10-30', []), ['00:05', '12:00']);
    assert.deepStrictEqual(dueSlots(times, '15:00', '2026-10-30', ['2026-10-30 00:05']), ['12:00']);
    assert.deepStrictEqual(dueSlots(times, '15:00', '2026-10-31', ['2026-10-30 00:05', '2026-10-30 12:00']), ['00:05', '12:00']);
});
