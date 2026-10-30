import test from 'node:test';
import assert from 'node:assert';
import { loadAccounts } from '../src/accounts';

test('loadAccounts reads slots in ascending order, with gaps', () => {
    const accts = loadAccounts({
        ACCOUNT_4_EMAIL: 'd@x.com',
        ACCOUNT_2_EMAIL: 'b@x.com',
        ACCOUNT_2_LABEL: 'Second',
        ACCOUNT_10_EMAIL: 'j@x.com'
    });
    assert.deepStrictEqual(accts.map((a) => a.index), [2, 4, 10]);
    assert.strictEqual(accts[0].label, 'Second');
    assert.strictEqual(accts[1].label, 'Account 4');
});

test('proxy settings are parsed and validated', () => {
    const [a] = loadAccounts({
        ACCOUNT_1_EMAIL: 'a@x.com',
        ACCOUNT_1_PROXY_URL: '127.0.0.1:8080',
        ACCOUNT_1_PROXY_USERNAME: 'u',
        ACCOUNT_1_PROXY_PASSWORD: 'p'
    });
    assert.deepStrictEqual(a.proxy, { server: 'http://127.0.0.1:8080', username: 'u', password: 'p' });
    assert.throws(() => loadAccounts({ ACCOUNT_1_EMAIL: 'a@x.com', ACCOUNT_1_PROXY_URL: 'socks5://h:1080', ACCOUNT_1_PROXY_USERNAME: 'u', ACCOUNT_1_PROXY_PASSWORD: 'p' }));
    assert.throws(() => loadAccounts({ ACCOUNT_1_EMAIL: 'a@x.com', ACCOUNT_1_PROXY_URL: 'http://h:1', ACCOUNT_1_PROXY_USERNAME: 'u' }));
    assert.throws(() => loadAccounts({ ACCOUNT_1_EMAIL: 'a@x.com', ACCOUNT_1_PROXY_URL: 'ftp://h:1' }));
});

test('bad or duplicate emails are rejected', () => {
    assert.throws(() => loadAccounts({ ACCOUNT_1_EMAIL: 'nope' }));
    assert.throws(() => loadAccounts({ ACCOUNT_1_EMAIL: 'a@x.com', ACCOUNT_2_EMAIL: 'A@X.com' }));
    assert.deepStrictEqual(loadAccounts({}), []);
});
