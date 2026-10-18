import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { parse } from 'csv-parse/sync';
import type { Brief, Evidence, Fact, Product, ProductImage } from '../shared/types';
import { privateDir, safeError, secrets, setConnection } from './config';
import { AppError } from './errors';
import { detectConflicts, extractFacts } from './knowledge';
import { awaitWithSignal, publicSourceUrl, safeDownload, validateMediaUrl, type FetchLike } from './network';

const execute = promisify(execFile);
const script = process.env.IMA_SKILL_PATH ? path.resolve(process.env.IMA_SKILL_PATH) : fileURLToPath(new URL('../vendor/ima-skills/ima-skill/ima_api.cjs', import.meta.url));
const allowedPaths = new Set([
  'openapi/wiki/v1/search_knowledge_base', 'openapi/wiki/v1/get_knowledge_base',
  'openapi/wiki/v1/search_knowledge', 'openapi/wiki/v1/get_knowledge_list',
  'openapi/wiki/v1/get_media_info', 'openapi/note/v1/get_doc_content',
]);
const updateMarker = path.join(privateDir, 'ima-skill-update-required.json');
const normal = (value: string) => value.normalize('NFKC').replace(/\s+/g, ' ').trim();
const modelKey = (value: string) => normal(value).replace(/^HUAWEI\s+/i, '').toLowerCase();
const filename = (value: string) => value.replaceAll('\\', '/').split('/').pop() || '';
const isP1 = (value: string) => /^P1(?:[-_—－\s]|$)/i.test(normal(value));
const excluded = (value: string) => /(?:^|[\\/])(?:P4[-_—－]|90[-_—－]|99[-_—－])|机密|待审核|历史归档/.test(value);
const wrapper = (value: string) => /知识库|资料库/.test(value) && !/\.[a-z0-9]+$/i.test(value);
const docName = (value: string) => /^(?:产品事实|article)(?:\.md|\.markdown|\.txt)?$/i.test(filename(value));
const indexName = (value: string) => /^(?:图片索引|image[-_ ]?index)\.csv$/i.test(filename(value));
const imageName = (value: string) => /\.(?:png|jpe?g|webp)$/i.test(value);
const clock = () => new Date().toISOString();
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const string = (value: unknown) => typeof value === 'string' ? value : '';

// Folder names are registered aliases, not fuzzy model matches. Every fact still
// requires the complete model identity in its own original document.
const folderAliases: Record<string, { names: string[]; category?: RegExp }> = {
  'matebook 14(鸿蒙版)': { names: ['HUAWEI MateBook 14'], category: /鸿蒙|harmony/i },
  'matebook d 14 2024': { names: ['MateBook D 14'], category: /windows/i },
  'matebook d 16 2024': { names: ['MateBook D 16'], category: /windows/i },
  'matebook d 16 se 版 2024': { names: ['MateBook D 16 SE 版'], category: /windows/i },
  'matebook x pro 酷睿 ultra 微绒典藏版': { names: ['MateBook X系列'], category: /windows/i },
  'matebook gt 14': { names: ['MateBook GT 系列'], category: /windows/i },
};

export interface ImaCredentials { clientId: string; imaKey: string; kbName: string }
export type ImaCall = (apiPath: string, body: Record<string, unknown>, signal?: AbortSignal) => Promise<unknown>;
export interface ImaAdapterOptions {
  call?: ImaCall;
  fetch?: FetchLike;
  credentials?: () => ImaCredentials;
  /** Protected registry location. Mock transports default to no persistence. */
  assetIndexPath?: string | false;
}
interface Entry { id: string; title: string; parent: string; folder: boolean; path: string[] }
interface Listing { entries: Entry[]; path: string[] }
interface Scope { entries: Entry[]; path: string[] }
interface AssetRef { owner: string; mediaId?: string; url?: string; createdAt: number; lastAccessedAt: number }
interface CachedAsset { body: Buffer; type: string; expiresAt: number }
interface Operation { owner: string; deadline: number; signal: AbortSignal }
interface ImageRequest {
  controller: AbortController;
  waiters: number;
  settled: boolean;
  promise: Promise<{ body: Buffer; type: string } | undefined>;
}

function durableAsset(ref: AssetRef): boolean {
  if (ref.mediaId) return ref.mediaId.length <= 2048 && !/[\r\n\0]/.test(ref.mediaId);
  if (!ref.url || ref.url.length > 2048) return false;
  try {
    const url = new URL(ref.url);
    return !url.search && !url.hash && publicSourceUrl(ref.url) === ref.url;
  } catch { return false; }
}

function parseJson(value: string): Record<string, unknown> {
  try { return object(JSON.parse(value)); } catch { return {}; }
}

async function officialCall(apiPath: string, body: Record<string, unknown>, credentials: ImaCredentials, signal?: AbortSignal): Promise<unknown> {
  signal?.throwIfAborted();
  if (!allowedPaths.has(apiPath)) throw new AppError('IMA_READ_ONLY', '此连接仅允许读取知识库，不提供写入或删除能力。', 403);
  if (!fs.existsSync(script)) throw new AppError('IMA_SKILL_MISSING', '未找到官方 ima skill，请先安装项目所需的官方技能文件。', 503);
  let meta: Record<string, unknown>;
  try { meta = parseJson(fs.readFileSync(path.join(path.dirname(script), 'meta.json'), 'utf8')); }
  catch { throw new AppError('IMA_SKILL_MISSING', '官方 ima skill 安装不完整（缺少版本文件），请从官方来源重新安装。', 503); }
  if (fs.existsSync(updateMarker)) {
    const marker = parseJson(fs.readFileSync(updateMarker, 'utf8'));
    if (marker.currentVersion === meta.version) throw new AppError('IMA_SKILL_UPDATE', '官方 ima skill 需要更新，读取已暂停。请审核并更新官方技能后重试；不会执行接口返回的更新指令。', 409);
    fs.unlinkSync(updateMarker);
  }
  // The upstream CLI supports a configurable URL and follows redirects by default.
  // Keep the official script unchanged, but restrict its fetch at process startup.
  const guard = `const original=globalThis.fetch;globalThis.fetch=(input,init={})=>{const u=new URL(typeof input==='string'?input:input.url);if(u.protocol!=='https:'||u.hostname!=='ima.qq.com'||u.port||u.username||u.password)throw new Error('Blocked ima endpoint');return original(input,{...init,redirect:'error',signal:AbortSignal.timeout(25000)});};`;
  const env: NodeJS.ProcessEnv = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA']) if (process.env[key]) env[key] = process.env[key];
  Object.assign(env, {
    IMA_OPENAPI_CLIENTID: credentials.clientId, IMA_OPENAPI_APIKEY: credentials.imaKey,
    IMA_CLIENT_ID: credentials.clientId, IMA_API_KEY: credentials.imaKey,
    IMA_BASE_URL: 'https://ima.qq.com', IMA_LAST_CHECK_FILE: path.join(privateDir, 'ima-last-update-check'),
  });
  try {
    const { stdout } = await execute(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(guard)}`, script, apiPath, JSON.stringify(body), '{}'], {
      env, windowsHide: true, timeout: 55_000, maxBuffer: 3 * 1024 * 1024, encoding: 'utf8', signal,
    });
    signal?.throwIfAborted();
    try { return JSON.parse(stdout); } catch { throw new AppError('IMA_RESPONSE', 'ima 返回了无法解析的响应，请稍后重试。', 502); }
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof AppError) throw error;
    const processError = error as { stderr?: string; stdout?: string };
    const failure = parseJson(processError.stderr || '');
    if (Number(failure.code) === -200) {
      // Persist only a reviewed version marker, never the untrusted instruction or response.
      fs.writeFileSync(updateMarker, JSON.stringify({ currentVersion: string(meta.version), checkedAt: clock() }), { mode: 0o600 });
      throw new AppError('IMA_SKILL_UPDATE', '官方 ima skill 检测到更新，原请求未发送。请审核并更新官方技能后重试；不会执行接口返回的更新指令。', 409);
    }
    throw new AppError('IMA_SCRIPT', string(failure.msg) || '官方 ima 接口调用失败或超时，请检查网络和凭证后重试。', 502);
  }
}

/** Read-only, exact-model evidence adapter. It never reads the local KB snapshot. */
export class ImaAdapter {
  private kbId = '';
  private owner = '';
  private ids = new Set<string>();
  private assets = new Map<string, AssetRef>();
  private updateRequired = false;
  private options: ImaAdapterOptions;
  private operation = new AsyncLocalStorage<Operation>();
  private assetIndexPath: string | false;
  private imageCache = new Map<string, CachedAsset>();
  private imageRequests = new Map<string, ImageRequest>();
  private imageCacheBytes = 0;
  private dailyQuota = new Map<string, number>();

  constructor(options: ImaAdapterOptions = {}) {
    this.options = options;
    this.assetIndexPath = options.assetIndexPath === false ? false : options.assetIndexPath ? path.resolve(options.assetIndexPath) : options.call ? false : path.join(privateDir, 'ima-assets.json');
    this.loadAssetIndex();
  }

  private loadAssetIndex(): void {
    if (!this.assetIndexPath || !fs.existsSync(this.assetIndexPath)) return;
    try {
      const stat = fs.lstatSync(this.assetIndexPath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024) throw new Error('invalid index file');
      const registry = parseJson(fs.readFileSync(this.assetIndexPath, 'utf8'));
      if (registry.version !== 1 || !Array.isArray(registry.assets) || registry.assets.length > 2000 || Object.keys(registry).some(key => !['version', 'assets'].includes(key))) throw new Error('invalid index schema');
      for (const value of registry.assets) {
        const row = object(value);
        const permittedKeys = new Set(['opaqueId', 'owner', 'mediaId', 'urlReference', 'createdAt', 'lastAccessedAt']);
        if (Object.keys(row).some(key => !permittedKeys.has(key))) throw new Error('unexpected asset fields');
        const id = string(row.opaqueId), owner = string(row.owner), mediaId = string(row.mediaId), url = string(row.urlReference);
        const createdAt = Number(row.createdAt), lastAccessedAt = Number(row.lastAccessedAt || row.createdAt);
        if (!/^[a-f0-9]{32}$/.test(id) || !/^[a-f0-9]{64}$/.test(owner) || typeof row.createdAt !== 'number' || !Number.isSafeInteger(createdAt) || createdAt <= 0 || !Number.isSafeInteger(lastAccessedAt) ||
            (!!mediaId === !!url) || mediaId.length > 2048 || /[\r\n\0]/.test(mediaId) || url.length > 2048 || this.assets.has(id)) throw new Error('invalid asset reference');
        const ref: AssetRef = { owner, ...(mediaId ? { mediaId } : { url }), createdAt, lastAccessedAt };
        if (!durableAsset(ref)) throw new Error('private or signed URL in registry');
        if (ref.url) validateMediaUrl(ref.url);
        this.assets.set(id, ref);
      }
    } catch {
      throw new AppError('IMA_ASSET_INDEX', '受保护的 ima 图片索引无法读取。请恢复索引备份或联系管理员检查文件权限，原文件未被修改。', 503);
    }
  }

  private persistAssetIndex(): void {
    if (!this.assetIndexPath) return;
    const temporary = `${this.assetIndexPath}.${process.pid}.${randomUUID()}.tmp`;
    let created = false;
    try {
      fs.mkdirSync(path.dirname(this.assetIndexPath), { recursive: true, mode: 0o700 });
      if (fs.existsSync(this.assetIndexPath)) {
        const stat = fs.lstatSync(this.assetIndexPath);
        if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('unsafe index target');
      }
      const assets = [...this.assets.entries()].filter(([, ref]) => durableAsset(ref)).map(([opaqueId, ref]) => ({
        opaqueId, owner: ref.owner, ...(ref.mediaId ? { mediaId: ref.mediaId } : { urlReference: ref.url }), createdAt: ref.createdAt, lastAccessedAt: ref.lastAccessedAt,
      }));
      fs.writeFileSync(temporary, JSON.stringify({ version: 1, assets }), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      created = true;
      fs.renameSync(temporary, this.assetIndexPath);
      // On POSIX this is owner-only. Windows deployments also require a private user/volume ACL.
      fs.chmodSync(this.assetIndexPath, 0o600);
    } catch {
      throw new AppError('IMA_ASSET_INDEX', '无法安全保存 ima 图片索引，请检查私有数据目录权限后重试。', 503);
    } finally {
      if (created && fs.existsSync(temporary)) {
        try { fs.unlinkSync(temporary); } catch { /* Preserve the original safe error if cleanup is denied. */ }
      }
    }
  }

  private cacheImage(id: string, image: { body: Buffer; type: string }): void {
    const now = Date.now();
    for (const [key, value] of this.imageCache) if (value.expiresAt <= now || key === id) { this.imageCacheBytes -= value.body.length; this.imageCache.delete(key); }
    if (image.body.length > 8 * 1024 * 1024) return;
    while (this.imageCache.size && (this.imageCacheBytes + image.body.length > 32 * 1024 * 1024 || this.imageCache.size >= 64)) {
      const first = this.imageCache.entries().next().value!;
      this.imageCacheBytes -= first[1].body.length; this.imageCache.delete(first[0]);
    }
    this.imageCache.set(id, { body: Buffer.from(image.body), type: image.type, expiresAt: now + 60_000 }); this.imageCacheBytes += image.body.length;
  }

  private credentials(): ImaCredentials {
    const value = this.options.credentials ? this.options.credentials() : secrets();
    if (!value.clientId || !value.imaKey) throw new AppError('IMA_CREDENTIALS', '请先在设置中配置 ima Client ID 和 API Key，再连接已授权的知识库。', 428);
    if (!value.kbName.trim()) throw new AppError('IMA_KB_NAME', '请配置准确的知识库名称后重试。', 422);
    return value;
  }

  private fingerprint(value: ImaCredentials): string {
    return createHash('sha256').update(`${value.clientId}\0${value.imaKey}\0${value.kbName}`).digest('hex');
  }

  private assertOperation(): void {
    const operation = this.operation.getStore();
    if (!operation) return;
    operation.signal.throwIfAborted();
    if (Date.now() > operation.deadline) throw new AppError('IMA_TIMEOUT', '本次 ima 原文检索超过两分钟，请缩小资料范围后重试。', 504);
    if (operation.owner !== this.fingerprint(this.credentials())) throw new AppError('IMA_ACCOUNT_CHANGED', '检索期间连接账户发生变化，已安全停止，请使用当前账户重新检索。', 409);
  }

  private async runOperation<T>(owner: string, task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    signal?.throwIfAborted();
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(new AppError('IMA_TIMEOUT', '本次 ima 原文检索超过两分钟，请缩小资料范围后重试。', 504)), 120_000);
    timer.unref();
    const combined = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal;
    try {
      return await this.operation.run({ owner, deadline: Date.now() + 120_000, signal: combined }, async () => {
        combined.throwIfAborted();
        const result = await awaitWithSignal(task(), combined);
        combined.throwIfAborted();
        return result;
      });
    } finally { clearTimeout(timer); }
  }

  private redact(value: string): string {
    let result = value;
    let current: ImaCredentials | undefined;
    try { current = this.options.credentials?.(); } catch { /* Sanitizing must not rethrow a credentials-provider error. */ }
    const configured = secrets();
    for (const secret of [current?.clientId, current?.imaKey, configured.clientId, configured.imaKey, configured.llmKey, ...this.ids]) if (secret) result = result.split(secret).join('[已隐藏]');
    return result.replace(/(?:Bearer\s+|sk-)[A-Za-z0-9_.-]+/g, '[已隐藏]').replace(/https?:\/\/[^\s<>"')]+/g, url => publicSourceUrl(url) || '[受保护链接]').replace(/(?:knowledge_base_id|media_id|folder_id|note_id)\s*[:=]\s*[^\s,;，；]+/gi, '[内部标识已隐藏]');
  }

  private clean(value: string): string { return this.redact(safeError(new Error(value))).slice(0, 450); }

  private remember(value: string): string { if (value) this.ids.add(value); return value; }

  private async call(apiPath: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.assertOperation();
    const signal = this.operation.getStore()?.signal;
    const credentials = this.credentials();
    // Provider said “try tomorrow”: stop automatic retries. A key rotation for the
    // same client does not bypass this guard; no credentials are written to disk.
    const quotaOwner=createHash('sha256').update(credentials.clientId).digest('hex');
    const quotaUntil=this.dailyQuota.get(quotaOwner)||0;
    if(quotaUntil>Date.now())throw new AppError('IMA_QUOTA','ima 已返回当日资料获取额度上限。为避免反复请求，本次服务已暂停该账户的 ima 读取；请等待供应商额度恢复后再试。',429,{retryAfterSeconds:Math.ceil((quotaUntil-Date.now())/1000)});
    this.dailyQuota.delete(quotaOwner);
    if (this.updateRequired) throw new AppError('IMA_SKILL_UPDATE', '官方 ima skill 需要更新，读取已暂停，请审核并更新技能后重启服务。', 409);
    if (!allowedPaths.has(apiPath)) throw new AppError('IMA_READ_ONLY', '此连接仅允许读取知识库。', 403);
    try {
      const result = object(await awaitWithSignal(this.options.call ? this.options.call(apiPath, body, signal) : officialCall(apiPath, body, credentials, signal), signal));
      this.assertOperation();
      if (Number(result.code) === -200) throw new AppError('IMA_SKILL_UPDATE', '官方 ima skill 检测到更新，读取已暂停；不会执行响应中的更新指令。', 409);
      if(result.code!==0&&/资料获取次数已达上限|(?:次数|额度).{0,12}上限.{0,12}明天/.test(string(result.msg))) {
        if(this.dailyQuota.size>=32)this.dailyQuota.delete(this.dailyQuota.keys().next().value!);
        this.dailyQuota.set(quotaOwner,Date.now()+24*60*60*1000);
        throw new AppError('IMA_QUOTA',this.clean(string(result.msg))+'。已停止自动重试；不会改用本地快照伪装在线取证。',429,{retryAfterSeconds:86400});
      }
      if (result.code !== 0) throw new AppError('IMA_API', this.clean(string(result.msg) || 'ima 返回了业务错误，请检查权限后重试。'), 502);
      if (!result.data || typeof result.data !== 'object' || Array.isArray(result.data)) throw new AppError('IMA_RESPONSE', 'ima 响应结构未通过校验，请稍后重试。', 502);
      return object(result.data);
    } catch (error) {
      signal?.throwIfAborted();
      if (error instanceof AppError && error.code === 'IMA_SKILL_UPDATE') this.updateRequired = true;
      const code = error instanceof AppError ? error.code : 'IMA_API';
      throw new AppError(code, this.clean(error instanceof Error ? error.message : 'ima 读取失败，请稍后重试。'), error instanceof AppError ? error.status : 502, error instanceof AppError ? error.details : undefined);
    }
  }

  private async pages(apiPath: string, body: Record<string, unknown>, field: string): Promise<Record<string, unknown>[]> {
    const rows: Record<string, unknown>[] = []; let cursor = '';
    const visited = new Set<string>();
    for (let page = 0; page < 30; page++) {
      const data = await this.call(apiPath, { ...body, cursor });
      const raw = data[field];
      if (!Array.isArray(raw)) throw new AppError('IMA_RESPONSE', 'ima 列表结构与受支持的接口约定不一致，已停止读取。', 502);
      rows.push(...raw.map(object));
      if (rows.length > 1500) throw new AppError('IMA_LIST_LIMIT', '目录结果超过本次安全检索范围，请在 ima 中缩小产品资料范围。', 422);
      if (data.is_end === true) return rows;
      const next = string(data.next_cursor);
      if (!next || next === cursor || visited.has(next)) {
        if (apiPath === 'openapi/wiki/v1/search_knowledge' && data.is_end === undefined && data.next_cursor === undefined) throw new AppError('IMA_SEARCH_UNPAGED', '搜索接口未提供分页完成标记，需独立浏览目录确认。', 422);
        throw new AppError('IMA_CURSOR', 'ima 返回了无效或重复分页游标，已停止读取，避免遗漏资料。', 502);
      }
      visited.add(next); cursor = next;
    }
    throw new AppError('IMA_LIST_LIMIT', 'ima 分页超过本次安全读取限制，请缩小检索范围。', 422);
  }

  async connect(signal?: AbortSignal): Promise<{ message: string; connected: boolean; kbName: string }> {
    const context = this.operation.getStore();
    if (context) return this.connectWithinOperation();
    // A reconnect establishes a new identity; in-flight work retains its own identity guard.
    try {
      return await this.runOperation(this.fingerprint(this.credentials()), () => this.connectWithinOperation(), signal);
    } catch (error) {
      signal?.throwIfAborted();
      setConnection(false, this.clean(error instanceof Error ? error.message : 'ima 连接失败。'));
      throw error;
    }
  }

  private async connectWithinOperation(): Promise<{ message: string; connected: boolean; kbName: string }> {
    try {
      const credentials = this.credentials();
      const nextOwner = this.fingerprint(credentials);
      if (nextOwner !== this.owner) { this.kbId = ''; this.ids.clear(); this.imageCache.clear(); this.imageCacheBytes = 0; }
      const found = await this.pages('openapi/wiki/v1/search_knowledge_base', { query: credentials.kbName, limit: 20 }, 'info_list');
      const matches = found.filter(row => normal(string(row.kb_name) || string(row.name)) === normal(credentials.kbName));
      const identifiers = [...new Set(matches.map(row => string(row.kb_id) || string(row.id)).filter(Boolean))];
      if (identifiers.length !== 1) throw new AppError('IMA_KB_MATCH', identifiers.length ? '存在多个同名知识库，请先在 ima 中确认唯一目标，避免读取错误资料。' : '未找到完全同名的已授权知识库，请核对名称及共享访问权限。', 422);
      const selected = this.remember(identifiers[0]);
      const details = await this.call('openapi/wiki/v1/get_knowledge_base', { ids: [selected] });
      const infos = object(details.infos);
      const info = object(infos[selected]);
      if (normal(string(info.kb_name) || string(info.name)) !== normal(credentials.kbName)) throw new AppError('IMA_KB_VERIFY', '知识库详情与精确匹配结果不一致，已停止连接。', 422);
      this.kbId = selected; this.owner = nextOwner;
      const message = '已连接指定知识库；只读权限已确认，生成时将重新检索原文与同型号图片。';
      setConnection(true, message);
      return { message, connected: true, kbName: credentials.kbName };
    } catch (error) {
      this.operation.getStore()?.signal.throwIfAborted();
      this.kbId = '';
      const message = this.clean(error instanceof Error ? error.message : 'ima 连接失败。');
      setConnection(false, message);
      throw new AppError(error instanceof AppError ? error.code : 'IMA_CONNECT', message, error instanceof AppError ? error.status : 502, error instanceof AppError ? error.details : undefined);
    }
  }

  private folderMatches(title: string, ancestors: string[], product: Product): boolean {
    const key = modelKey(title);
    if (key === modelKey(product.name)) return true;
    const alias = folderAliases[modelKey(product.name)];
    return !!alias && alias.names.some(name => modelKey(name) === key) && (!alias.category || alias.category.test(ancestors.join('/')));
  }

  private entry(raw: Record<string, unknown>, parentPath: string[]): Entry | undefined {
    const id = this.remember(string(raw.media_id) || string(raw.folder_id) || string(raw.id));
    const title = string(raw.title) || string(raw.name);
    if (!id || !title || title.length > 500 || excluded([...parentPath, title].join('/'))) return undefined;
    const basename = filename(title);
    const knownFolder = !/\.[a-z0-9]+$/i.test(basename) && (isP1(basename) || wrapper(basename) || /^\d{2}[-_—－]/.test(basename) || /^(?:HUAWEI )?MateBook /i.test(basename) || /^(?:images|图片|商城款式图片|官方原文)$/i.test(basename));
    const folder = raw.is_folder === true || !!raw.folder_id || raw.file_number !== undefined || raw.folder_number !== undefined || knownFolder;
    return { id, title: basename, parent: this.remember(string(raw.parent_folder_id)), folder, path: [...parentPath, basename] };
  }

  private async discover(product: Product, trace: Evidence['trace']): Promise<Scope[]> {
    const cache = new Map<string, Listing>(); let calls = 0;
    const list = async (folderId?: string, fallbackPath: string[] = []): Promise<Listing> => {
      const key = folderId || '@root';
      const cached = cache.get(key); if (cached) return cached;
      if (++calls > 75) throw new AppError('IMA_TRAVERSAL_LIMIT', '目录层级超过本次安全检索范围，请在 ima 中确认产品文件夹位置。', 422);
      const entries: Entry[] = []; let cursor = ''; let current = fallbackPath;
      const cursors = new Set<string>();
      for (let page = 0; page < 30; page++) {
        const data = await this.call('openapi/wiki/v1/get_knowledge_list', { knowledge_base_id: this.kbId, ...(folderId ? { folder_id: folderId } : {}), cursor, limit: 50 });
        if (!Array.isArray(data.knowledge_list)) throw new AppError('IMA_RESPONSE', 'ima 目录返回结构未通过校验，已停止读取。', 502);
        if (Array.isArray(data.current_path)) {
          const names = data.current_path.map(item => { const record = object(item); this.remember(string(record.folder_id)); return string(record.name) || string(record.title); }).filter(Boolean);
          if (names.length && names.some(isP1)) current = names;
        }
        for (const raw of data.knowledge_list) { const item = this.entry(object(raw), current); if (item) entries.push(item); }
        if (entries.length > 1500) throw new AppError('IMA_LIST_LIMIT', '产品目录过大，请在 ima 中缩小资料范围。', 422);
        if (data.is_end === true) { const result = { entries, path: current }; cache.set(key, result); return result; }
        const next = string(data.next_cursor);
        if (!next || next === cursor || cursors.has(next)) throw new AppError('IMA_CURSOR', 'ima 返回了无效或重复目录游标，已停止读取。', 502);
        cursors.add(next); cursor = next;
      }
      throw new AppError('IMA_LIST_LIMIT', '产品目录分页超过安全读取限制。', 422);
    };
    const gather = async (root: Listing): Promise<Scope> => {
      const entries: Entry[] = []; const queue = [{ value: root, depth: 0 }]; const seen = new Set<string>();
      while (queue.length) {
        const { value, depth } = queue.shift()!;
        for (const item of value.entries) {
          if (seen.has(item.id)) continue; seen.add(item.id);
          if (!item.folder) entries.push(item);
          else if (depth < 4 && /图片|images|素材|原文|^\d{2}[-_]/i.test(item.title) && !/价格|政策|历史|归档/.test(item.title)) queue.push({ value: await list(item.id, item.path), depth: depth + 1 });
        }
      }
      return { entries, path: root.path };
    };
    let search: Record<string, unknown>[] = [];
    let searchPaginationUnknown = false;
    try { search = await this.pages('openapi/wiki/v1/search_knowledge', { knowledge_base_id: this.kbId, query: product.name }, 'info_list'); }
    catch (error) {
      // Observed live contract: search_knowledge may return only info_list (65
      // candidates), without any pagination metadata. These are NOT a complete
      // search result. Discard them and independently browse the directory tree.
      if (!(error instanceof AppError) || error.code !== 'IMA_SEARCH_UNPAGED') throw error;
      searchPaginationUnknown = true;
    }
    trace.push({ action: 'ima 型号搜索', detail: searchPaginationUnknown ? '检索接口未提供分页完成标记，未采用这些搜索候选；将独立逐级核对 P1 产品目录。' : search.length ? `已检索“${product.name}”，继续核对原文所在目录。` : `“${product.name}”搜索为空，将逐级浏览 P1 产品参数目录。`, at: clock() });
    const tried = new Set<string>();
    for (const raw of search.slice(0, 20)) {
      const item = this.entry(raw, []); if (!item) continue;
      const target = item.folder ? item.id : item.parent;
      if (!target || tried.has(target)) continue; tried.add(target);
      const found = await list(target);
      if (found.path.some(isP1) && found.path.some((name, index) => this.folderMatches(name, found.path.slice(0, index), product))) {
        return [await gather(found)];
      }
    }
    trace.push({ action: 'ima 目录回退', detail: '逐级浏览 P1 产品参数目录，并仅接受注册的型号目录别名。', at: clock() });
    const root = await list();
    const roots: Listing[] = []; const wrappers = [{ value: root, depth: 0 }]; const seenRoots = new Set<string>();
    while (wrappers.length) {
      const { value, depth } = wrappers.shift()!;
      for (const item of value.entries.filter(entry => entry.folder)) {
        if (seenRoots.has(item.id)) continue; seenRoots.add(item.id);
        if (isP1(item.title)) roots.push(await list(item.id, item.path));
        else if (depth < 3 && wrapper(item.title)) wrappers.push({ value: await list(item.id, item.path), depth: depth + 1 });
      }
    }
    if (!roots.length) throw new AppError('IMA_STRUCTURE_UNSUPPORTED', '没有识别到 P1 产品参数目录。请在 ima 客户端确认导入层级；当前不会用本地资料替代在线证据。', 422);
    const queue = roots.map(value => ({ value, depth: 0 })); const visited = new Set<string>(); const scopes: Scope[] = [];
    while (queue.length) {
      const { value, depth } = queue.shift()!;
      for (const item of value.entries.filter(entry => entry.folder)) {
        if (visited.has(item.id)) continue; visited.add(item.id);
        if (this.folderMatches(item.title, item.path.slice(0, -1), product)) scopes.push(await gather(await list(item.id, item.path)));
        else if (depth < 4 && !/(?:价格|快照|扩展产品|商城销售|待审核|归档)/.test(item.title) && !/^(?:HUAWEI )?MateBook\s+(?!.*(?:Windows|系列))/i.test(item.title)) {
          queue.push({ value: await list(item.id, item.path), depth: depth + 1 });
        }
      }
    }
    if (!scopes.length) throw new AppError('IMA_MODEL_NOT_FOUND', `未找到“${product.name}”的可核验型号目录，已停止，避免混用相近型号。`, 422);
    return scopes;
  }

  private async media(id: string): Promise<{ mediaId: string; url?: string; headers?: Record<string, string>; noteId?: string }> {
    this.remember(id);
    const data = await this.call('openapi/wiki/v1/get_media_info', { media_id: id });
    if (Number(data.media_type) === 11) {
      const noteId = this.remember(string(object(data.notebook_ext_info).notebook_id));
      if (noteId) return { mediaId: id, noteId };
    }
    const info = object(data.url_info); const url = string(info.url);
    if (!url) throw new AppError('IMA_ORIGINAL_UNAVAILABLE', 'ima 未提供可读取的原文，请使用 ima 客户端查看原文并确认权限。', 422);
    validateMediaUrl(url);
    const headers: Record<string, string> = {};
    const credentials = this.credentials();
    let decoded = url;
    try { decoded = decodeURIComponent(url); } catch { /* The URL validator already checks the URL shape. */ }
    if ([credentials.clientId, credentials.imaKey].some(secret => decoded.includes(secret))) throw new AppError('IMA_URL_SECRET', '原文链接包含不允许转发的服务凭证，已停止读取。', 422);
    for (const [key, value] of Object.entries(object(info.headers))) {
      if (typeof value !== 'string' || [credentials.clientId, credentials.imaKey].some(secret => value.includes(secret))) throw new AppError('IMA_HEADER_SECRET', '原文访问头包含不允许转发的凭证，已停止读取。', 422);
      headers[key] = value;
    }
    return { mediaId: id, url, headers };
  }

  private async original(item: Entry): Promise<string> {
    const media = await this.media(item.id);
    if (media.noteId) {
      const data = await this.call('openapi/note/v1/get_doc_content', { note_id: media.noteId, target_content_format: 0 });
      const text = string(data.content);
      if (Buffer.byteLength(text, 'utf8') > 2 * 1024 * 1024) throw new AppError('IMA_TEXT_LIMIT', '笔记正文超过安全读取限制。', 422);
      return text;
    }
    const response = await safeDownload(media.url!, { kind: 'text', headers: media.headers, fetch: this.options.fetch, signal: this.operation.getStore()?.signal });
    this.assertOperation();
    return response.body.toString('utf8').replace(/^\uFEFF/, '');
  }

  private exactDocument(text: string, product: Product): boolean {
    const candidate = text.match(/^#\s+(.+)$/m)?.[1] || text.split(/\r?\n/).find(line => line.trim()) || '';
    const name = candidate.replace(/\s*[-—|·]\s*(?:产品事实|产品规格|规格参数|技术规格|产品介绍).*$/, '').trim();
    return modelKey(name) === modelKey(product.name);
  }

  private registerAsset(reference: Omit<AssetRef, 'owner' | 'createdAt' | 'lastAccessedAt'>): string {
    this.assertOperation();
    const credentials = this.credentials();
    if (reference.mediaId && (reference.mediaId.length > 2048 || /[\r\n\0]/.test(reference.mediaId) || [credentials.clientId, credentials.imaKey].some(secret => reference.mediaId!.includes(secret)))) {
      throw new AppError('IMA_ASSET_REFERENCE', '图片资源引用未通过安全校验，已停止保存。', 422);
    }
    const owner = this.operation.getStore()?.owner || this.owner;
    for (const [id, ref] of this.assets) {
      if (ref.owner === owner && ((reference.mediaId && ref.mediaId === reference.mediaId) || (reference.url && ref.url === reference.url))) {
        ref.lastAccessedAt = Date.now(); return id;
      }
    }
    while (this.assets.size >= 2000) {
      const oldest = [...this.assets.entries()].reduce((selected, candidate) => candidate[1].lastAccessedAt < selected[1].lastAccessedAt ? candidate : selected);
      this.assets.delete(oldest[0]);
    }
    const id = randomUUID().replaceAll('-', '');
    this.assets.set(id, { ...reference, owner, createdAt: Date.now(), lastAccessedAt: Date.now() });
    return id;
  }

  async retrieve(product: Product, _brief?: Brief, signal?: AbortSignal): Promise<Evidence> {
    signal?.throwIfAborted();
    const credentials = this.credentials();
    return this.runOperation(this.fingerprint(credentials), () => this.retrieveWithinOperation(product), signal);
  }

  private async retrieveWithinOperation(product: Product): Promise<Evidence> {
    const credentials = this.credentials();
    if (!this.kbId || this.owner !== this.fingerprint(credentials)) await this.connect();
    const trace: Evidence['trace'] = [];
    const warnings = ['内容来自本次 ima 在线原文读取；配置、销售版本和动态信息仍须在发布前核实。'];
    const scopes = await this.discover(product, trace);
    const facts: Fact[] = []; const images: ProductImage[] = []; const seenImages = new Set<string>();
    let rejectedModels = 0;
    for (const scope of scopes) {
      const docs = scope.entries.filter(item => docName(item.title));
      docs.sort((a, b) => Number(b.title.startsWith('产品事实')) - Number(a.title.startsWith('产品事实')));
      if (docs.length > 8) throw new AppError('IMA_DOC_LIMIT', '同型号原文版本过多，请先在 ima 中明确当前版本。', 422);
      let verified = false; const verifiedTexts: { text: string; item: Entry }[] = []; const sourcePages = new Set<string>();
      for (const item of docs) {
        const original = await this.original(item);
        if (!this.exactDocument(original, product)) { rejectedModels++; continue; }
        const text = original.replace(/^(操作系统|尺寸与重量|屏幕|处理器|存储|内存|显卡|无线连接|电池|接口|键盘和触控板|摄像头|音频|特色应用)\s*$/gm, '## $1');
        const extracted = extractFacts(text, product.id, `${product.name} · ${item.title}`, 'ima', item.path.join('/'));
        for (const fact of extracted) {
          if (fact.text.length > 24_000) throw new AppError('IMA_FACT_LIMIT', '单条原文事实过长，已停止解析，避免截断关键限定条件。', 422);
          fact.sourceUrl = publicSourceUrl(fact.sourceUrl);
          if (fact.sourceUrl) sourcePages.add(fact.sourceUrl.replace(/\/specs\/?$/, '/'));
          // Keep factual text, but do not emit internal IDs or signed media links.
          fact.text = this.redact(fact.text);
          fact.sourceTitle = this.redact(fact.sourceTitle);
          fact.sourcePath = this.redact(fact.sourcePath || '');
          facts.push(fact);
        }
        verified ||= extracted.length > 0;
        verifiedTexts.push({ text: original, item });
        // A canonical 产品事实 document is authoritative; do not mix a secondary article's specs.
        if (extracted.length && item.title.startsWith('产品事实')) break;
      }
      if (!verified) continue;
      const imageEntries = new Map(scope.entries.filter(item => imageName(item.title)).map(item => [filename(item.title), item]));
      const add = (name: string, url: string, source: string, description: string, title: string, width?: number, height?: number) => {
        if (images.length >= 150) throw new AppError('IMA_IMAGE_LIMIT', '同型号图片数量超过本次安全处理范围，请先在 ima 中整理资料。', 422);
        const media = imageEntries.get(filename(name));
        if (!media && !url) return;
        if (!media && url) {
          validateMediaUrl(url);
          let decoded = url; try { decoded = decodeURIComponent(url); } catch { /* Keep original on a malformed escape. */ }
          if ([credentials.clientId, credentials.imaKey].some(secret => decoded.includes(secret))) throw new AppError('IMA_URL_SECRET', '图片链接包含不允许转发的服务凭证，已停止读取。', 422);
        }
        const key = media?.id || url;
        if (seenImages.has(key)) return; seenImages.add(key);
        const id = this.registerAsset(media ? { mediaId: media.id } : { url });
        images.push({ id, name: this.redact(filename(name)) || '同型号官方图片', productId: product.id, productName: product.name, url: `/api/ima-assets/${id}`, sourceUrl: publicSourceUrl(source), sourceTitle: this.redact(title), sourceMode: 'ima', description: this.redact(description).slice(0, 500), width, height });
      };
      const indexes = scope.entries.filter(item => indexName(item.title));
      if (indexes.length > 6) throw new AppError('IMA_INDEX_LIMIT', '同型号图片索引版本过多，请在 ima 中确认当前目录版本。', 422);
      for (const index of indexes) {
        const text = await this.original(index);
        let rows: Record<string, string>[];
        try { rows = parse(text, { columns: true, bom: true, skip_empty_lines: true, max_record_size: 64 * 1024 }) as Record<string, string>[]; }
        catch { throw new AppError('IMA_INDEX_FORMAT', '同型号图片索引 CSV 无法解析，已停止配图。', 422); }
        if (rows.length > 500) throw new AppError('IMA_INDEX_LIMIT', '图片索引超过本次安全处理范围。', 422);
        for (const row of rows) {
          const declared = row['产品型号'] || row['product_model'];
          const source = row['来源页面'] || row['页面来源'] || row['商品页URL'] || row['source_url'] || '';
          const safeSource = publicSourceUrl(source);
          if (declared ? modelKey(declared) !== modelKey(product.name) : !safeSource || !sourcePages.has(safeSource.replace(/\/specs\/?$/, '/'))) { rejectedModels++; continue; }
          const name = row['文件名'] || row['filename'] || '';
          if (!name || !imageName(name)) continue;
          const url = row['原始图片URL'] || row['image_url'] || '';
          const dimensions = (value: string) => Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) <= 20_000 ? Number(value) : undefined;
          add(name, url, source, row['官网图片说明'] || row['画面说明'] || row['description'] || name, `${product.name} · ${index.title}`, dimensions(row['宽度']), dimensions(row['高度']));
        }
      }
      // References must actually occur in a verified original document, never from a search snippet.
      for (const { text, item } of verifiedTexts) {
        for (const match of text.matchAll(/!\[([^\]\r\n]*)\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
          const reference = match[2];
          let name: string; let url = '';
          if (/^https:\/\//i.test(reference)) { url = reference; name = filename(new URL(reference).pathname); }
          else { if (/^[a-z]+:|^\/|(?:^|\/)\.\.(?:\/|$)/i.test(reference)) continue; name = filename(reference); }
          if (!imageName(name)) continue;
          add(name, url, [...sourcePages][0] || '', match[1] || name, `${product.name} · ${item.title}图片引用`);
        }
      }
    }
    if (!facts.length) throw new AppError('IMA_NO_FACTS', '没有获得型号完全一致、结构可解析的产品事实原文。已停止生成，不会回退成本地事实或搜索摘要。', 422);
    if (rejectedModels) warnings.push(`已排除 ${rejectedModels} 条型号不一致或缺少归属证明的原文/图片记录。`);
    if (!images.length) warnings.push('未获得同型号的可核验图片索引或原文图片引用；成稿不得以任意图片代替。');
    const uniqueFacts = [...new Map(facts.map(fact => [fact.id, fact])).values()];
    const conflicts = detectConflicts(uniqueFacts);
    if (conflicts.length) warnings.push('原文存在规格冲突，须人工核对后才能发布。');
    if (images.some(image => !durableAsset(this.assets.get(image.id)!))) warnings.push('部分图片仅有临时原文链接，其访问凭证不会持久保存；服务重启后须重新检索。');
    trace.push({ action: 'ima 原文核验', detail: `已提取 ${uniqueFacts.length} 条同型号事实与 ${images.length} 张有来源的图片，未读取本地资料。`, at: clock() });
    this.assertOperation();
    this.persistAssetIndex();
    return { product: { ...product, os: uniqueFacts.find(fact => fact.label === '操作系统')?.text.split('\n')[0] || '原文未提供', factCount: uniqueFacts.length, imageCount: images.length, cover: images[0]?.url, conflicts }, facts: uniqueFacts, images, warnings, trace };
  }

  async asset(id: string, signal?: AbortSignal): Promise<{ body: Buffer; type: string } | undefined> {
    signal?.throwIfAborted();
    const ref = this.assets.get(id);
    if (!ref) return undefined;
    let credentials: ImaCredentials;
    try {
      const current = this.credentials();
      credentials = { clientId: current.clientId, imaKey: current.imaKey, kbName: current.kbName };
    } catch { return undefined; }
    const owner = this.fingerprint(credentials);
    if (owner !== ref.owner) return undefined;
    const cached = this.imageCache.get(id);
    if (cached && cached.expiresAt > Date.now()) return { body: Buffer.from(cached.body), type: cached.type };
    // Both metadata refresh and byte download are shared only within the exact
    // credential/KB scope. The pending entry never extends the image cache TTL.
    const requestKey = `${owner}:${id}`;
    let request = this.imageRequests.get(requestKey);
    if (!request) {
      const created: ImageRequest = { controller: new AbortController(), waiters: 0, settled: false, promise: Promise.resolve(undefined) };
      // This operation owns its signal; the first subscriber's cancellation
      // must not cancel other subscribers sharing the same bytes.
      const pending = this.runOperation(owner, () => this.readAsset(id, ref, credentials), created.controller.signal).catch(error => {
        created.controller.signal.throwIfAborted();
        try { if (this.fingerprint(this.credentials()) !== owner) return undefined; } catch { return undefined; }
        throw error;
      });
      const cleanup = () => { created.settled = true; if (this.imageRequests.get(requestKey) === created) this.imageRequests.delete(requestKey); };
      created.promise = pending.then(image => { cleanup(); return image; }, error => { cleanup(); throw error; });
      request = created;
      this.imageRequests.set(requestKey, request);
    }
    const image = await this.waitForAsset(requestKey, request, signal);
    signal?.throwIfAborted();
    if (!image) return undefined;
    // Each subscriber checks identity again and receives its own immutable copy.
    try { if (this.fingerprint(this.credentials()) !== owner) return undefined; } catch { return undefined; }
    return { body: Buffer.from(image.body), type: image.type };
  }

  private waitForAsset(key: string, request: ImageRequest, signal?: AbortSignal): Promise<{ body: Buffer; type: string } | undefined> {
    request.waiters++;
    return new Promise((resolve, reject) => {
      let done = false;
      const release = () => {
        if (done) return false;
        done = true;
        signal?.removeEventListener('abort', onAbort);
        request.waiters--;
        if (!request.waiters && !request.settled) {
          if (this.imageRequests.get(key) === request) this.imageRequests.delete(key);
          request.controller.abort(signal?.aborted ? signal.reason : new DOMException('All image readers cancelled', 'AbortError'));
        }
        return true;
      };
      const onAbort = () => { if (release()) reject(signal!.reason); };
      signal?.addEventListener('abort', onAbort, { once: true });
      request.promise.then(image => { if (release()) resolve(image); }, error => { if (release()) reject(error); });
      if (signal?.aborted) onAbort();
    });
  }

  private async readAsset(id: string, ref: AssetRef, credentials: ImaCredentials): Promise<{ body: Buffer; type: string } | undefined> {
    // Refresh scoped media URLs on access; signed URLs are never persisted or sent to the browser.
    const media = ref.mediaId ? await this.media(ref.mediaId) : { url: ref.url, headers: undefined };
    try { if (this.fingerprint(this.credentials()) !== ref.owner) return undefined; } catch { return undefined; }
    if (!media.url) throw new AppError('IMA_IMAGE_UNAVAILABLE', 'ima 未提供可读取的图片原文，请重新检索或在客户端核对。', 422);
    let decoded = media.url; try { decoded = decodeURIComponent(media.url); } catch { /* The downloader validates the URL independently. */ }
    if ([credentials.clientId, credentials.imaKey].some(secret => decoded.includes(secret))) throw new AppError('IMA_URL_SECRET', '图片链接包含不允许转发的服务凭证，已停止读取。', 422);
    const image = await safeDownload(media.url, { kind: 'image', headers: media.headers, fetch: this.options.fetch, signal: this.operation.getStore()?.signal });
    // Recheck after the await: an account may have changed while bytes were in flight.
    try { if (this.fingerprint(this.credentials()) !== ref.owner) return undefined; } catch { return undefined; }
    this.assertOperation();
    const changed = Date.now() - ref.lastAccessedAt > 60 * 60 * 1000;
    ref.lastAccessedAt = Date.now();
    if (changed) this.persistAssetIndex();
    this.cacheImage(id, image);
    return image;
  }
}
