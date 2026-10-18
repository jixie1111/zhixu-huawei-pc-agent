import https from 'node:https';
import dns from 'node:dns/promises';
import type { IncomingMessage } from 'node:http';
import { isIP } from 'node:net';
import { AppError } from './errors';

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
export interface DownloadOptions {
  kind: 'text' | 'image';
  headers?: Record<string, string>;
  maxBytes?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Test transport only. Production uses HTTPS with a validated, pinned DNS answer. */
  fetch?: FetchLike;
}

const officialPages = new Set(['consumer.huawei.com', 'www.vmall.com', 'vmall.com']);
const mediaHosts = new Set(['ima.qq.com', ...officialPages]);

/** Only a known service or vendor-controlled media domain can be downloaded. */
export function validateMediaUrl(raw: string): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new AppError('IMA_URL_INVALID', '原文链接格式无效，请使用 ima 客户端查看原文。', 422); }
  const host = url.hostname.toLowerCase();
  const allowed = mediaHosts.has(host) || host.endsWith('.myqcloud.com') || host.endsWith('.vmallres.com');
  if (raw.length > 8192 || url.protocol !== 'https:' || url.username || url.password || url.port || !allowed || isIP(host)) {
    throw new AppError('IMA_URL_BLOCKED', '原文位于尚未批准的访问域名，已停止获取；请使用 ima 客户端查看原文。', 422);
  }
  url.hash = '';
  return url;
}

/** Public provenance links never contain private ima links or signed query strings. */
export function publicSourceUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !officialPages.has(url.hostname)) return '';
    url.search = ''; url.hash = '';
    return url.toString();
  } catch { return ''; }
}

export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
  }
  if (isIP(address) === 6) {
    // Accept global unicast only; reject transition/documentation ranges too.
    const first = Number.parseInt(address.split(':')[0], 16);
    return first >= 0x2000 && first <= 0x3fff && !/^2001:(?:0{0,4}|0?db8|0{0,3}2):/i.test(address) && !/^2002:/i.test(address);
  }
  return false;
}

function safeHeaders(input: Record<string, string> | undefined, kind: DownloadOptions['kind']) {
  const headers: Record<string, string> = {
    accept: kind === 'image' ? 'image/png,image/jpeg,image/webp' : 'text/plain,text/markdown,text/csv,application/octet-stream',
    'accept-encoding': 'identity',
  };
  if (Object.keys(input || {}).length > 40) throw new AppError('IMA_HEADERS', '原文访问头超出安全限制。', 422);
  for (const [key, value] of Object.entries(input || {})) {
    const name = key.toLowerCase();
    if (!/^[a-z0-9-]+$/.test(name) || /^(?:host|connection|upgrade|te|trailer|transfer-encoding|content-length|cookie|proxy-authorization|proxy-connection|ima-openapi-.*)$/.test(name) ||
        typeof value !== 'string' || value.length > 8192 || /[\r\n\0]/.test(value)) {
      throw new AppError('IMA_HEADERS', '原文访问头未通过安全校验。', 422);
    }
    headers[name] = value;
  }
  // The response limit applies to wire bytes and decoded bytes alike.
  headers['accept-encoding'] = 'identity';
  return headers;
}

export function imageType(body: Buffer): string {
  if (body.length >= 33 && body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && body.toString('ascii', 12, 16) === 'IHDR') {
    const width = body.readUInt32BE(16), height = body.readUInt32BE(20);
    if (width > 0 && height > 0 && width <= 20_000 && height <= 20_000 && width * height <= 80_000_000) return 'image/png';
  }
  if (body.length >= 12 && body[0] === 255 && body[1] === 216 && body[2] === 255 && body[body.length - 2] === 255 && body[body.length - 1] === 217) return 'image/jpeg';
  if (body.length >= 20 && body.toString('ascii', 0, 4) === 'RIFF' && body.toString('ascii', 8, 12) === 'WEBP' && body.readUInt32LE(4) + 8 === body.length && /^(?:VP8 |VP8L|VP8X)$/.test(body.toString('ascii', 12, 16))) return 'image/webp';
  return '';
}

function checkBody(body: Buffer, declared: string, kind: DownloadOptions['kind'], url: URL) {
  const type = declared.split(';')[0].trim().toLowerCase();
  if (kind === 'image') {
    const actual = imageType(body);
    if (!actual || (type && type !== 'application/octet-stream' && type !== actual)) {
      throw new AppError('IMA_IMAGE_TYPE', '图片内容或文件签名不匹配，已拒绝展示。', 422);
    }
    return { body, type: actual };
  }
  const textTypes = new Set(['text/plain', 'text/markdown', 'text/x-markdown', 'text/csv', 'application/csv', 'application/md', 'application/markdown']);
  const filePath = decodeURIComponent(url.pathname).toLowerCase();
  if (!textTypes.has(type) && !(type === 'application/octet-stream' && /\.(?:md|markdown|txt|csv)$/.test(filePath))) {
    throw new AppError('IMA_TEXT_TYPE', '当前仅支持可核验的 Markdown、纯文本和 CSV 原文；请在 ima 客户端确认文件类型。', 422);
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(body);
    if (/\0|^\s*(?:<!doctype\s+html|<html\b)/i.test(text)) throw new Error('not text');
  } catch { throw new AppError('IMA_TEXT_ENCODING', '原文不是有效 UTF-8 文本，或返回了登录页面，已停止解析。', 422); }
  return { body, type };
}

function checkResponse(status: number, length: string | null | undefined, encoding: string | null | undefined, maxBytes: number) {
  if (status >= 300 && status < 400) throw new AppError('IMA_REDIRECT', '原文链接发生重定向，安全策略已停止请求；请在 ima 客户端查看原文。', 422);
  if (status !== 200) throw new AppError('IMA_MEDIA_UNAVAILABLE', '原文暂时不可读取，请使用 ima 客户端查看原文。', 422);
  if (encoding && encoding.toLowerCase() !== 'identity') throw new AppError('IMA_ENCODING', '原文使用了不受支持的传输编码，已停止请求。', 422);
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) throw new AppError('IMA_DOWNLOAD_LIMIT', '原文超过单次安全读取大小限制。', 422);
}

/** Stop waiting even if a test/custom transport ignores its cancellation signal. */
export function awaitWithSignal<T>(pending: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return pending;
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    const onAbort = () => { cleanup(); reject(signal.reason); };
    signal.addEventListener('abort', onAbort, { once: true });
    pending.then(value => { cleanup(); if (signal.aborted) reject(signal.reason); else resolve(value); }, error => { cleanup(); reject(signal.aborted ? signal.reason : error); });
    if (signal.aborted) onAbort();
  });
}

async function resolveMedia(hostname: string, signal: AbortSignal, timeoutMs: number) {
  signal.throwIfAborted();
  // lookup() cannot cancel its OS resolver work. A private Resolver lets this
  // download cancel only its own A/AAAA requests without affecting other users.
  const resolver = new dns.Resolver({ timeout: timeoutMs, tries: 1 });
  const onAbort = () => resolver.cancel();
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    const results = await awaitWithSignal(Promise.allSettled([resolver.resolve4(hostname), resolver.resolve6(hostname)]), signal);
    signal.throwIfAborted();
    const addresses = results.flatMap((result, index) => result.status === 'fulfilled' ? result.value.map(address => ({ address, family: index === 0 ? 4 : 6 })) : []);
    if (!addresses.length || addresses.some(answer => !isPublicAddress(answer.address))) throw new AppError('IMA_PRIVATE_NETWORK', '原文域名解析到非公开网络地址，已停止访问。', 422);
    return addresses;
  } finally {
    signal.removeEventListener('abort', onAbort);
    resolver.cancel();
  }
}

/** No redirects, no private IPs, bounded time/bytes, and no browser-provided URLs. */
export async function safeDownload(raw: string, options: DownloadOptions): Promise<{ body: Buffer; type: string }> {
  options.signal?.throwIfAborted();
  const url = validateMediaUrl(raw);
  const maxBytes = Math.min(options.maxBytes ?? (options.kind === 'image' ? 12 * 1024 * 1024 : 2 * 1024 * 1024), 20 * 1024 * 1024);
  const timeoutMs = Math.min(options.timeoutMs ?? 20_000, 30_000);
  const headers = safeHeaders(options.headers, options.kind);
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(new AppError('IMA_DOWNLOAD_TIMEOUT', '原文读取超时，请稍后重试。', 504)), timeoutMs);
  timer.unref();
  const signal = options.signal ? AbortSignal.any([options.signal, timeout.signal]) : timeout.signal;
  try {
    if (options.fetch) {
      const fetching = options.fetch(url.toString(), { method: 'GET', headers, redirect: 'manual', signal });
      // A custom transport can resolve after it was cancelled. Close that late
      // body too; it must never become an unconsumed background stream.
      void fetching.then(response => { if (signal.aborted && response.body) void response.body.cancel(signal.reason).catch(() => {}); }, () => {});
      const response = await awaitWithSignal(fetching, signal);
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      const onAbort = () => { if (reader) void reader.cancel(signal.reason).catch(() => {}); };
      try {
        signal.throwIfAborted();
        if (response.redirected || (response.url && new URL(response.url).toString() !== url.toString())) throw new AppError('IMA_REDIRECT', '原文链接发生重定向，安全策略已停止请求。', 422);
        checkResponse(response.status, response.headers.get('content-length'), response.headers.get('content-encoding'), maxBytes);
        if (!response.body) throw new AppError('IMA_MEDIA_UNAVAILABLE', '原文没有可读取的内容。', 422);
        reader = response.body.getReader();
        signal.addEventListener('abort', onAbort, { once: true });
        const chunks: Buffer[] = []; let total = 0;
        while (true) {
          signal.throwIfAborted();
          const { done, value } = await awaitWithSignal(reader.read(), signal);
          if (done) break;
          total += value.byteLength;
          if (total > maxBytes) throw new AppError('IMA_DOWNLOAD_LIMIT', '原文超过单次安全读取大小限制。', 422);
          chunks.push(Buffer.from(value));
        }
        signal.throwIfAborted();
        return checkBody(Buffer.concat(chunks, total), response.headers.get('content-type') || '', options.kind, url);
      } finally {
        signal.removeEventListener('abort', onAbort);
        // Do not await an arbitrary custom stream's cancellation hook.
        if (reader) void reader.cancel(signal.aborted ? signal.reason : undefined).catch(() => {});
        else if (response.body) void response.body.cancel(signal.aborted ? signal.reason : undefined).catch(() => {});
      }
    }
    const answers = await resolveMedia(url.hostname, signal, timeoutMs);
    signal.throwIfAborted();
    const selected = answers[0];
    return await new Promise<{ body: Buffer; type: string }>((resolve, reject) => {
      let response: IncomingMessage | undefined;
      let settled = false;
      const finish = (error: unknown, result?: { body: Buffer; type: string }) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', onAbort);
        if (error !== undefined) reject(error); else resolve(result!);
      };
      const onAbort = () => { finish(signal.reason); response?.destroy(); request.destroy(); };
      const request = https.request(url, {
        method: 'GET', headers, agent: false, signal,
        // Pin the validated answer, preventing DNS rebinding between validation and connection.
        lookup: (_hostname, lookupOptions, callback) => {
          if (lookupOptions.all) callback(null, [selected]);
          else callback(null, selected.address, selected.family);
        },
      }, incoming => {
        response = incoming;
        const chunks: Buffer[] = []; let total = 0;
        response.on('error', error => finish(signal.aborted ? signal.reason : error));
        response.on('aborted', () => finish(signal.aborted ? signal.reason : new AppError('IMA_MEDIA_UNAVAILABLE', '原文传输中断，请稍后重试。', 422)));
        if (signal.aborted) { onAbort(); return; }
        try { checkResponse(response.statusCode || 0, response.headers['content-length'], String(response.headers['content-encoding'] || ''), maxBytes); }
        catch (error) { finish(error); response.destroy(); request.destroy(); return; }
        response.on('data', (chunk: Buffer) => {
          if (signal.aborted) { onAbort(); return; }
          total += chunk.length;
          if (total > maxBytes) { finish(new AppError('IMA_DOWNLOAD_LIMIT', '原文超过单次安全读取大小限制。', 422)); response!.destroy(); request.destroy(); }
          else chunks.push(chunk);
        });
        response.on('end', () => {
          try { signal.throwIfAborted(); finish(undefined, checkBody(Buffer.concat(chunks, total), String(response!.headers['content-type'] || ''), options.kind, url)); }
          catch (error) { finish(error); }
        });
      });
      request.on('error', error => finish(signal.aborted ? signal.reason : error));
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort(); else request.end();
    });
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof AppError) throw error;
    throw new AppError('IMA_DOWNLOAD_FAILED', '原文读取失败，请使用 ima 客户端检查访问权限或稍后重试。', 502);
  } finally { clearTimeout(timer); }
}
