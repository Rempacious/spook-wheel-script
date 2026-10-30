import fs from 'node:fs';
import path from 'node:path';
import type { Config, LogFilter } from './config';
import { todayIn } from './util';

export type Level = 'debug' | 'info' | 'warn' | 'error';

export interface LogLine {
    time: Date;
    level: Level;
    tag: string;
    message: string;
    text: string;
}

export type LineSink = (line: LogLine) => void;

/** whitelist: only matching lines pass. blacklist: matching lines are dropped. */
export function passesFilter(filter: LogFilter, line: Pick<LogLine, 'level' | 'tag' | 'message'>): boolean {
    if (!filter.enabled) return true;
    const haystack = `${line.tag} ${line.message}`;
    const lower = haystack.toLowerCase();
    const hit =
        filter.levels.includes(line.level) ||
        filter.keywords.some((k) => lower.includes(k.toLowerCase())) ||
        filter.regexPatterns.some((p) => {
            try { return new RegExp(p, 'i').test(haystack); } catch { return false; }
        });
    return filter.mode === 'whitelist' ? hit : !hit;
}

export class Logger {
    private readonly sinks: LineSink[] = [];
    private readonly buffer: string[] = [];

    constructor(private readonly cfg: Config, private readonly logDir: string | null) {}

    addSink(sink: LineSink): void {
        this.sinks.push(sink);
    }

    /** Every line of this run (unfiltered), used for the log file attached to the summary */
    getRunLog(): string {
        return this.buffer.join('\n') + '\n';
    }

    log(level: Level, tag: string, message: string): void {
        if (level === 'debug' && !this.cfg.debugLogs) return;
        const time = new Date();
        const text = `[${time.toISOString()}] [${level.toUpperCase()}] [${tag}] ${message}`;
        const line: LogLine = { time, level, tag, message, text };

        this.buffer.push(text);
        if (this.logDir) {
            try {
                fs.mkdirSync(this.logDir, { recursive: true });
                fs.appendFileSync(path.join(this.logDir, `run-${todayIn(this.cfg.timezone, time)}.log`), text + '\n');
            } catch { /* logging must never crash the run */ }
        }
        if (passesFilter(this.cfg.consoleLogFilter, line)) {
            (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(text);
        }
        for (const sink of this.sinks) {
            try { sink(line); } catch { /* ignore */ }
        }
    }

    debug(tag: string, message: string): void { this.log('debug', tag, message); }
    info(tag: string, message: string): void { this.log('info', tag, message); }
    warn(tag: string, message: string): void { this.log('warn', tag, message); }
    error(tag: string, message: string): void { this.log('error', tag, message); }
}
