import { Writable } from 'node:stream';

export interface NewRelicLogStreamOptions {
  endpoint: string;
  licenseKey: string;
  service: string;
  environment: string;
  batchSize?: number;
  flushIntervalMs?: number;
  /** Injectable for tests. */
  fetchFn?: typeof fetch;
}

const LEVELS: Record<number, string> = { 10: 'trace', 20: 'debug', 30: 'info', 40: 'warn', 50: 'error', 60: 'fatal' };

/**
 * Batches pino NDJSON lines and posts them to the New Relic Logs API. Delivery failures are
 * reported to stderr (rate limited) and the batch is dropped; logging never throws or blocks requests.
 */
export class NewRelicLogStream extends Writable {
  private buffer: Record<string, unknown>[] = [];
  private inflight: Promise<void> = Promise.resolve();
  private lastErrorAt = 0;
  private readonly timer: NodeJS.Timeout;
  private readonly batchSize: number;
  private readonly fetchFn: typeof fetch;

  constructor(private readonly opts: NewRelicLogStreamOptions) {
    super();
    this.batchSize = opts.batchSize ?? 100;
    this.fetchFn = opts.fetchFn ?? fetch;
    this.timer = setInterval(() => void this.flush(), opts.flushIntervalMs ?? 5000);
    this.timer.unref();
  }

  override _write(chunk: Buffer | string, _enc: BufferEncoding, cb: (err?: Error | null) => void): void {
    for (const line of chunk.toString().split('\n')) {
      if (!line.trim()) continue;
      try {
        this.buffer.push(this.toLogEntry(JSON.parse(line) as Record<string, unknown>));
      } catch {
        this.buffer.push({ message: line, timestamp: Date.now() });
      }
    }
    if (this.buffer.length >= this.batchSize) void this.flush();
    cb();
  }

  override _final(cb: (err?: Error | null) => void): void {
    clearInterval(this.timer);
    this.flush().then(() => cb(), cb);
  }

  /** Sends buffered entries; resolves once all in-flight deliveries finish. */
  flush(): Promise<void> {
    if (this.buffer.length > 0) {
      const logs = this.buffer;
      this.buffer = [];
      this.inflight = this.inflight.then(() => this.send(logs));
    }
    return this.inflight;
  }

  private toLogEntry(rec: Record<string, unknown>): Record<string, unknown> {
    const { msg, time, level, ...rest } = rec;
    return {
      message: typeof msg === 'string' ? msg : '',
      timestamp: typeof time === 'number' ? time : Date.now(),
      level: typeof level === 'number' ? (LEVELS[level] ?? String(level)) : level,
      ...rest,
    };
  }

  private async send(logs: Record<string, unknown>[]): Promise<void> {
    try {
      const res = await this.fetchFn(this.opts.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'api-key': this.opts.licenseKey },
        body: JSON.stringify([
          { common: { attributes: { service: this.opts.service, environment: this.opts.environment } }, logs },
        ]),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) this.reportError(`HTTP ${res.status}`);
    } catch (err) {
      this.reportError(err instanceof Error ? err.message : String(err));
    }
  }

  private reportError(reason: string): void {
    const now = Date.now();
    if (now - this.lastErrorAt < 60_000) return;
    this.lastErrorAt = now;
    process.stderr.write(`[logger] New Relic log delivery failed: ${reason}\n`);
  }
}
