import type { Config } from './config';
import type { AccountResult, Status } from './types';
import { PROBLEM_STATUSES } from './types';
import { clip, maskIdentity } from './util';

type View = (r: AccountResult) => [string, string];

const STATUS_VIEW: Record<Status, View> = {
    LIMIT: (r) => (r.wins > 0 ? ['🎉', `Done: ${r.wins} win(s)`] : ['🛑', 'Done: no win today']),
    ALREADY_DONE: () => ['✅', 'Already finished today (from log)'],
    WON_STOPPED: () => ['🎉', 'Won, paused (keepSpinningAfterWin is off)'],
    CAP: () => ['⚠️', 'Stopped at the safety cap'],
    TIMEOUT: () => ['⚠️', 'Timed out'],
    STUCK: () => ['⚠️', 'Got stuck'],
    LOGIN_REQUIRED: () => ['🔑', 'Session expired, sign in again'],
    NO_SESSION: () => ['🔑', 'No saved session yet'],
    ERROR: () => ['❌', 'Error']
};

export function hasProblem(results: AccountResult[]): boolean {
    return results.some((r) => PROBLEM_STATUSES.includes(r.status));
}

function who(r: AccountResult, cfg: Config): string {
    return cfg.webhook.maskIdentity ? maskIdentity(r.account.email) : r.account.email;
}

export interface DiscordEmbed {
    title: string;
    description: string;
    color: number;
    fields: Array<{ name: string; value: string; inline: boolean }>;
    footer: { text: string };
    timestamp: string;
}

export function buildEmbed(results: AccountResult[], cfg: Config, today: string): DiscordEmbed {
    const totalWins = results.reduce((n, r) => n + r.wins, 0);
    const problems = results.filter((r) => PROBLEM_STATUSES.includes(r.status)).length;
    const fields = results.slice(0, 25).map((r) => {
        const [icon, label] = STATUS_VIEW[r.status](r);
        const lines = [`👤 ${clip(who(r, cfg), 80)}`];
        if (r.status !== 'ALREADY_DONE' && r.status !== 'NO_SESSION') lines.push(`🎯 Wins: ${r.wins} · No Treat: ${r.noTreat}`);
        r.prizes.slice(0, 3).forEach((p) => lines.push(`🏆 ${clip(p, 120)}`));
        if (r.error) lines.push(`⚠️ ${clip(r.error, 200)}`);
        return { name: clip(`${icon} ${r.account.label}: ${label}`, 256), value: clip(lines.join('\n'), 1024), inline: false };
    });
    return {
        title: `🎡 Spook the Wheel: ${today}`,
        description: `${results.length} account(s) · ${totalWins} win(s)` + (problems ? ` · ${problems} need attention` : ''),
        color: problems ? 0xed4245 : totalWins ? 0x57f287 : 0xfee75c,
        fields,
        footer: { text: `Timezone: ${cfg.timezone}` },
        timestamp: new Date().toISOString()
    };
}

/** Plain-text version for Telegram / ntfy */
export function buildText(results: AccountResult[], cfg: Config, today: string): string {
    const totalWins = results.reduce((n, r) => n + r.wins, 0);
    const lines = [`Spook the Wheel: ${today}`, `${results.length} account(s), ${totalWins} win(s)`, ''];
    for (const r of results) {
        const [icon, label] = STATUS_VIEW[r.status](r);
        lines.push(`${icon} ${r.account.label} (${who(r, cfg)}): ${label}`);
        if (r.status !== 'ALREADY_DONE' && r.status !== 'NO_SESSION') lines.push(`   Wins ${r.wins}, No Treat ${r.noTreat}`);
        r.prizes.slice(0, 3).forEach((p) => lines.push(`   🏆 ${clip(p, 120)}`));
        if (r.error) lines.push(`   ${clip(r.error, 200)}`);
    }
    return lines.join('\n');
}
