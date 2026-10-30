export type ModalKind = 'win' | 'limit' | 'noTreat' | null;

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function errMsg(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

/** "500ms", "30sec", "1min", "2h" (or a plain number of milliseconds) -> milliseconds */
export function parseDuration(value: string | number): number {
    if (typeof value === 'number') return value;
    const m = /^\s*(\d+(?:\.\d+)?)\s*(ms|s|sec|secs|m|min|mins|h|hr|hrs)\s*$/i.exec(value);
    if (!m) throw new Error(`Invalid duration "${value}" (examples: 500ms, 30sec, 1min, 2h)`);
    const n = parseFloat(m[1]);
    const unit = m[2].toLowerCase();
    if (unit === 'ms') return n;
    if (unit.startsWith('s')) return n * 1000;
    if (unit.startsWith('m')) return n * 60_000;
    return n * 3_600_000;
}

export function randomBetween(min: number, max: number): number {
    if (max <= min) return min;
    return min + Math.floor(Math.random() * (max - min + 1));
}

export function clip(value: unknown, max: number): string {
    const s = String(value ?? '');
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

export function clean(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/** YYYY-MM-DD in the given timezone */
export function todayIn(tz: string, d: Date = new Date()): string {
    return d.toLocaleDateString('en-CA', { timeZone: tz });
}

/** HH:MM (24h) in the given timezone */
export function timeIn(tz: string, d: Date = new Date()): string {
    return d.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
}

export function nowIn(tz: string, d: Date = new Date()): string {
    return d.toLocaleString('en-US', { timeZone: tz });
}

export function maskIdentity(v: string): string {
    if (v.includes('@')) {
        const [user, domain] = v.split('@');
        return `${user.slice(0, 2)}***@${domain}`;
    }
    return v;
}

/** Folder name for an account's saved browser session */
export function sessionKey(email: string): string {
    return email.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '_');
}

/** What the promo popup says -> what happened */
export function classifyModal(text: string): ModalKind {
    const t = String(text || '');
    if (t.includes('You Got Your GHOSTo!') || t.includes("Congratulations, you're a winner!")) return 'win';
    if (t.includes('That’s it for today!') || t.includes("That's it for today!") || t.includes('already had your turn today')) return 'limit';
    if (t.includes('Boo! No Treat This Time')) return 'noTreat';
    return null;
}
