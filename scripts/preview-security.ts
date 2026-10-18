import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'dotenv';

const secretNames=['IMA_OPENAPI_CLIENTID','IMA_CLIENT_ID','IMA_OPENAPI_APIKEY','IMA_API_KEY','LLM_API_KEY','ADMIN_TOKEN','MODELSCOPE_ACCESS_KEY','GH_TOKEN','GITHUB_TOKEN'];

/** Values stay in memory and never appear in diagnostics or packaged files. */
export function configuredSecrets(root:string):string[] {
  const environments=['.env','private/deploy.env'].map(file=>{
    const absolute=path.join(root,file);
    return fs.existsSync(absolute)?parse(fs.readFileSync(absolute)):{};
  });
  return [...new Set(secretNames.flatMap(name=>[process.env[name],...environments.map(env=>env[name])]).filter((value):value is string=>!!value&&value.length>=8))];
}

export function hasSensitiveContent(text:string,secrets:string[]):boolean {
  const assignment=/^(?:IMA_OPENAPI_CLIENTID|IMA_CLIENT_ID|IMA_OPENAPI_APIKEY|IMA_API_KEY|LLM_API_KEY|ADMIN_TOKEN|MODELSCOPE_ACCESS_KEY|GH_TOKEN|GITHUB_TOKEN)[\t ]*=[\t ]*[^\s#]+/m;
  const token=/\b(?:sk-[A-Za-z0-9_-]{32,}|ms-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/i;
  return assignment.test(text)||secrets.some(value=>text.includes(value))||token.test(text)||/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text);
}
