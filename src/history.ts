import fs from 'node:fs';
import path from 'node:path';
import type { HistoryEntry } from './types';

export function loadHistory(file: string): HistoryEntry[] {
    try {
        const v: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
        return Array.isArray(v) ? (v as HistoryEntry[]) : [];
    } catch {
        return [];
    }
}

export function saveHistory(file: string, list: HistoryEntry[]): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(list, null, 2));
    fs.renameSync(tmp, file);
}

export function alreadyLimitedToday(history: HistoryEntry[], email: string, today: string): boolean {
    const e = email.toLowerCase();
    return history.some((h) => h.account.toLowerCase() === e && h.date === today && h.result === 'DAILY LIMIT');
}
