import type { Config } from './config';
import type { Logger } from './logger';
import { passesFilter } from './logger';
import type { AccountResult } from './types';
import { buildEmbed, buildText, hasProblem } from './summary';
import { errMsg, sleep } from './util';

type WebhookCfg = Config['webhook'];

interface FileAttachment {
    name: string;
    data: string | Buffer;
    type: string;
}

const FLUSH_AFTER_MS = 3000;

function toBlobPart(data: string | Buffer): BlobPart {
    return typeof data === 'string' ? data : new Uint8Array(data);
}

function chunk(text: string, size: number): string[] {
    const out: string[] = [];
    for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
    return out.length ? out : [''];
}

/** Sends live log lines (filtered) and an end-of-run summary to Discord / Telegram / ntfy. */
export class Notifier {
    private queue: string[] = [];
    private timer: NodeJS.Timeout | null = null;

    constructor(private readonly cfg: Config) {}

    private get wh(): WebhookCfg { return this.cfg.webhook; }

    private discordOn(): boolean { return this.wh.discord.enabled && Boolean(this.wh.discord.url); }
    private telegramOn(): boolean { return this.wh.telegram.enabled && Boolean(this.wh.telegram.botToken) && Boolean(this.wh.telegram.chatId); }
    private ntfyOn(): boolean { return this.wh.ntfy.enabled && Boolean(this.wh.ntfy.url) && Boolean(this.wh.ntfy.topic); }

    enabled(): boolean { return this.discordOn() || this.telegramOn() || this.ntfyOn(); }

    /** Forward log lines that pass webhook.webhookLogFilter */
    attach(logger: Logger): void {
        if (!this.enabled()) return;
        logger.addSink((line) => {
            if (line.level === 'debug') return;
            if (!passesFilter(this.wh.webhookLogFilter, line)) return;
            this.enqueue(`[${line.level.toUpperCase()}] [${line.tag}] ${line.message}`);
        });
    }

    private enqueue(text: string): void {
        this.queue.push(text);
        if (!this.timer) {
            this.timer = setTimeout(() => { void this.flush(); }, FLUSH_AFTER_MS);
        }
    }

    async flush(): Promise<void> {
        if (this.timer) { clearTimeout(this.timer); this.timer = null; }
        if (!this.queue.length) return;
        const text = this.queue.join('\n');
        this.queue = [];
        await this.sendPlain(text);
    }

    private async sendPlain(text: string): Promise<void> {
        const tasks: Array<Promise<void>> = [];
        if (this.discordOn()) {
            for (const part of chunk(text, 1900)) {
                tasks.push(this.postDiscord({ content: part, allowed_mentions: { parse: [] } }));
            }
        }
        if (this.telegramOn()) {
            for (const part of chunk(text, 3900)) tasks.push(this.postTelegram(part));
        }
        if (this.ntfyOn()) tasks.push(this.postNtfy(text));
        await Promise.all(tasks);
    }

    async sendSummary(results: AccountResult[], today: string, runLog: string): Promise<void> {
        await this.flush();
        const tasks: Array<Promise<void>> = [];

        if (this.discordOn()) {
            const files: FileAttachment[] = [{ name: `run-${today}.txt`, data: runLog, type: 'text/plain' }];
            results.filter((r) => r.screenshot).slice(0, 8).forEach((r) => {
                files.push({ name: `${r.account.label.replace(/\W+/g, '_')}-${r.status.toLowerCase()}.png`, data: r.screenshot as Buffer, type: 'image/png' });
            });
            const mention = this.wh.mention;
            tasks.push(this.postDiscord({
                content: hasProblem(results) && mention ? `${mention} some accounts need attention` : '',
                embeds: [buildEmbed(results, this.cfg, today)],
                allowed_mentions: { parse: mention ? ['users', 'roles'] : [] }
            }, files));
        }
        const text = buildText(results, this.cfg, today);
        if (this.telegramOn()) tasks.push(this.postTelegram(text.slice(0, 3900)));
        if (this.ntfyOn()) tasks.push(this.postNtfy(text));
        await Promise.all(tasks);
    }

    // ---------- transports (errors are printed, never thrown, so a bad webhook can't kill a run) ----------

    private async postDiscord(payload: Record<string, unknown>, files: FileAttachment[] = [], attempt = 0): Promise<void> {
        try {
            const form = new FormData();
            form.append('payload_json', JSON.stringify(payload));
            files.forEach((f, i) => form.append(`files[${i}]`, new Blob([toBlobPart(f.data)], { type: f.type }), f.name));
            const res = await fetch(this.wh.discord.url, { method: 'POST', body: form });
            if (res.status === 429 && attempt < 2) {
                const j = (await res.json().catch(() => ({}))) as { retry_after?: number };
                await sleep((j.retry_after ?? 2) * 1000 + 250);
                return this.postDiscord(payload, files, attempt + 1);
            }
            if (!res.ok) console.error(`Discord webhook failed: HTTP ${res.status}`);
        } catch (e) {
            console.error(`Discord webhook error: ${errMsg(e)}`);
        }
    }

    private async postTelegram(text: string): Promise<void> {
        try {
            const { botToken, chatId } = this.wh.telegram;
            const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text })
            });
            if (!res.ok) console.error(`Telegram webhook failed: HTTP ${res.status}`);
        } catch (e) {
            console.error(`Telegram webhook error: ${errMsg(e)}`);
        }
    }

    private async postNtfy(text: string): Promise<void> {
        try {
            const n = this.wh.ntfy;
            const headers: Record<string, string> = {
                Title: n.title.replace(/[^\x20-\x7e]/g, ''),
                Tags: n.tags.join(','),
                Priority: String(n.priority)
            };
            if (n.token) headers.Authorization = `Bearer ${n.token}`;
            const res = await fetch(`${n.url.replace(/\/+$/, '')}/${n.topic}`, { method: 'POST', headers, body: text });
            if (!res.ok) console.error(`ntfy failed: HTTP ${res.status}`);
        } catch (e) {
            console.error(`ntfy error: ${errMsg(e)}`);
        }
    }
}
