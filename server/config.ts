import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { z } from 'zod';
import type { Settings } from '../shared/types';
import { AppError } from './errors';
import { loadReleasedData } from './release-data';

export const privateDir = path.resolve(process.env.DATA_DIR || 'private');
fs.mkdirSync(privateDir, { recursive: true });
const readSecret = (file: string) => { try { return fs.readFileSync(file,'utf8').trim(); } catch { return ''; } };
type ConnectionState = { session: Record<string,string>; connection: Pick<Settings,'connected'|'connectionCheckedAt'|'connectionMessage'>; touched: number };
const emptyConnection=():ConnectionState=>({session:{},connection:{connected:false},touched:Date.now()});
let localConnection=emptyConnection();
const visitorScope=new AsyncLocalStorage<string>();
const visitorConnections=new Map<string,ConnectionState>();
export const publicDeployment = process.env.PUBLIC_DEPLOYMENT === 'true';
const releasedDirectory = process.env.PUBLISHED_DATA_DIR || '';
export const releasedData = releasedDirectory ? loadReleasedData(releasedDirectory) : undefined;
export const restrictedPublic = publicDeployment && !releasedData;
export function withVisitorSession<T>(id:string,work:()=>T):T {return visitorScope.run(id,work);}
function connectionState(create=false):ConnectionState {
  if(!publicDeployment||!releasedData)return localConnection;
  const id=visitorScope.getStore();
  if(!id){if(create)throw new AppError('WORKSPACE_REQUIRED','请刷新页面以建立创作空间。',401);return emptyConnection();}
  const now=Date.now();
  for(const [key,value] of visitorConnections)if(now-value.touched>2*60*60*1000)visitorConnections.delete(key);
  let value=visitorConnections.get(id);
  if(!value&&create){if(visitorConnections.size>=200)throw new AppError('BUSY','当前连接较多，请稍后再试。',429);value=emptyConnection();visitorConnections.set(id,value);}
  if(value)value.touched=now;
  return value??emptyConnection();
}
export interface DeploymentSecurity {
  publicOrigin?: string;
  frameAncestors: string[];
}

/** A concrete origin only: never a wildcard, URL path, CSP token, or credentials. */
function canonicalOrigin(raw: string, allowHttp = false): string | undefined {
  if (!raw || raw !== raw.trim() || /[\s,;\\'"*]/u.test(raw)) return undefined;
  try {
    const value = new URL(raw);
    if ((value.protocol !== 'https:' && !(allowHttp && value.protocol === 'http:')) || value.username || value.password || value.search || value.hash || value.pathname !== '/') return undefined;
    // Reject empty query/hash delimiters, odd slashes, percent-encoded hosts, and
    // other URL-normalization tricks instead of interpreting them as origins.
    if (!/^https?:\/\/(?:\[[a-fA-F0-9:]+\]|[a-zA-Z0-9.-]+)(?::[0-9]+)?\/?$/u.test(raw) || value.hostname.endsWith('.')) return undefined;
    return value.origin;
  } catch { return undefined; }
}

export function deploymentSecurity(env: NodeJS.ProcessEnv = process.env): DeploymentSecurity {
  const isPublic = env.PUBLIC_DEPLOYMENT === 'true';
  const rawOrigin = env.PUBLIC_ORIGIN?.trim() || '';
  const rawAncestors = env.FRAME_ANCESTORS?.trim() || '';
  if (!isPublic) {
    if (rawOrigin || rawAncestors) throw new AppError('DEPLOYMENT_CONFIG', 'PUBLIC_ORIGIN 和 FRAME_ANCESTORS 仅用于 PUBLIC_DEPLOYMENT=true；本地模式保持禁止嵌入。', 500);
    return { frameAncestors: ["'none'"] };
  }
  const publicOrigin = rawOrigin ? canonicalOrigin(rawOrigin) : undefined;
  if (rawOrigin && !publicOrigin) throw new AppError('DEPLOYMENT_CONFIG', 'PUBLIC_ORIGIN 必须是单个 HTTPS 来源（协议、域名及可选端口），不能包含路径、通配符或凭据。', 500);
  if (!rawAncestors) return { publicOrigin, frameAncestors: ["'none'"] };
  if (!publicOrigin) throw new AppError('DEPLOYMENT_CONFIG', '允许公开页面嵌入前，请先配置 PUBLIC_ORIGIN。', 500);
  const values = rawAncestors.split(',').map(value => canonicalOrigin(value.trim()));
  if (values.length > 8 || values.some(value => !value)) throw new AppError('DEPLOYMENT_CONFIG', 'FRAME_ANCESTORS 仅允许最多 8 个逗号分隔的明确 HTTPS 来源；不能使用通配符、路径或 CSP 指令。', 500);
  return { publicOrigin, frameAncestors: [...new Set(values as string[])] };
}

/** Forwarded headers are deliberately not accepted as input to this decision. */
export function allowsWriteOrigin(origin: string, host: string | undefined, protocol: string, policy: DeploymentSecurity, isPublic = publicDeployment): boolean {
  const supplied = canonicalOrigin(origin, !isPublic);
  if (!supplied) return false;
  if (isPublic) return !!policy.publicOrigin && supplied === policy.publicOrigin;
  if (!host || !['http', 'https'].includes(protocol)) return false;
  const expected = canonicalOrigin(`${protocol}://${host}`, true);
  if (!expected) return false;
  return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(expected).hostname) && supplied === expected;
}

export function secrets() {
  const session=connectionState().session;
  const visitor=publicDeployment&&!!releasedData;
  return {
    clientId: visitor?'':session.clientId || process.env.IMA_OPENAPI_CLIENTID || process.env.IMA_CLIENT_ID || readSecret(path.join(os.homedir(),'.config/ima/client_id')),
    imaKey: visitor?'':session.imaKey || process.env.IMA_OPENAPI_APIKEY || process.env.IMA_API_KEY || readSecret(path.join(os.homedir(),'.config/ima/api_key')),
    llmKey: session.llmKey || (visitor?'':process.env.LLM_API_KEY) || '',
    llmBaseUrl: session.llmBaseUrl || (visitor?'':process.env.LLM_BASE_URL) || (visitor?'':'https://api.siliconflow.cn/v1'),
    llmModel: session.llmModel || (visitor?'':process.env.LLM_MODEL) || '',
    llmReasoningEffort: session.llmReasoningEffort ?? (visitor?'':process.env.LLM_REASONING_EFFORT) ?? '',
    kbName: process.env.IMA_KB_NAME || '任德耀新建华为PC知识库',
  };
}
export function settings(): Settings {
  const s=secrets();
  return { imaConfigured:!!(s.clientId&&s.imaKey),llmConfigured:!!(s.llmKey&&s.llmModel),
    accountLabel:s.clientId?`凭证账户 · ${createHash('sha256').update(s.clientId).digest('hex').slice(0,8)}`:'尚未连接账号',
    kbName:s.kbName,llmBaseUrl:s.llmBaseUrl,llmModel:s.llmModel,llmReasoningEffort:s.llmReasoningEffort,publicDeployment,publishedLibrary:!!releasedData,...connectionState().connection };
}
const configSchema=z.object({clientId:z.string().max(500).optional(),imaKey:z.string().max(1000).optional(),llmKey:z.string().max(1000).optional(),llmBaseUrl:z.string().url().optional(),llmModel:z.string().max(200).optional(),llmReasoningEffort:z.enum(['','low','medium','high','xhigh','max']).optional()}).strict();
export function configure(input:unknown) {
  if(restrictedPublic) throw new AppError('LOCAL_ONLY','公开预览不允许通过网页修改服务凭证。',403);
  const data=configSchema.parse(input);
  if(publicDeployment&&(data.clientId?.trim()||data.imaKey?.trim()))throw new AppError('LOCAL_ONLY','在线工作台使用已授权资料库，此处仅连接个人模型服务。',403);
  if(data.llmBaseUrl) validateLlmUrl(data.llmBaseUrl);
  const state=connectionState(true),session=state.session;
  for(const [k,v] of Object.entries(data)) if(typeof v==='string'&&(v.trim()||k==='llmReasoningEffort')) session[k]=v.trim();
  state.connection={connected:false};
  return settings();
}
export function clearSession() { if(publicDeployment&&releasedData){const id=visitorScope.getStore();if(id)visitorConnections.delete(id);}else localConnection=emptyConnection(); }
export function setConnection(connected:boolean,message:string) {connectionState(true).connection={connected,connectionCheckedAt:new Date().toISOString(),connectionMessage:message};}
export function validateLlmUrl(raw:string, localEndpoint=process.env.LOCAL_LLM_BASE_URL, isPublic=publicDeployment) {
  const u=new URL(raw);
  // Only an operator-selected exact loopback endpoint, never arbitrary LAN/SSRF.
  // LOCAL_LLM_BASE_URL is an environment setting, not writable via the web API.
  const localPattern=/^http:\/\/(localhost|127\.0\.0\.1):([1-9][0-9]{0,4})\/v1\/?$/;
  if(!isPublic&&localEndpoint&&localPattern.test(raw)&&localPattern.test(localEndpoint)) {
    const expected=new URL(localEndpoint);
    if(u.origin===expected.origin&&u.pathname.replace(/\/$/,'')===expected.pathname.replace(/\/$/,'')) {
      // Avoid hostname resolution when sending credentials to the local bridge.
      u.hostname='127.0.0.1';return u.toString().replace(/\/$/,'');
    }
  }
  const approved=['api.siliconflow.cn','dashscope.aliyuncs.com','api.deepseek.com','api.openai.com','api-inference.modelscope.cn'];
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash||!approved.includes(u.hostname)) throw new AppError('MODEL_ENDPOINT','模型接口需要官方 HTTPS 服务，或由本机环境明确授权的回环接口。');
  return u.toString().replace(/\/$/,'');
}
export function safeError(error:unknown) {
  let message=error instanceof Error?error.message:'发生未知错误，请重试。';
  for(const value of [secrets().clientId,secrets().imaKey,secrets().llmKey,process.env.ADMIN_TOKEN]) if(value) message=message.split(value).join('[已脱敏]');
  return message.replace(/(?:sk-|Bearer\s+)[A-Za-z0-9_.-]+/g,'[已脱敏]').slice(0,800);
}
