import type { Account } from './accounts';

export type Status =
    | 'LIMIT'
    | 'ALREADY_DONE'
    | 'WON_STOPPED'
    | 'CAP'
    | 'TIMEOUT'
    | 'STUCK'
    | 'LOGIN_REQUIRED'
    | 'NO_SESSION'
    | 'ERROR';

export const PROBLEM_STATUSES: Status[] = ['CAP', 'TIMEOUT', 'STUCK', 'LOGIN_REQUIRED', 'NO_SESSION', 'ERROR'];

export interface AccountResult {
    account: Account;
    status: Status;
    wins: number;
    noTreat: number;
    prizes: string[];
    error: string | null;
    screenshot: Buffer | null;
}

export interface HistoryEntry {
    uid: string;
    ts: number;
    time: string;
    date: string;
    account: string;   // email
    label: string;
    result: string;
    httpStatus: number | null;
    response: string;
    note: string;
}
