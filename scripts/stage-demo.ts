import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { configuredSecrets, hasSensitiveContent } from './preview-security';

const card=`---
domain:
- nlp
tags:
- knowledge-grounded-marketing
- demo
language:
- zh
deployspec:
  entry_file: index.html
---

# 知序 · 华为 PC 营销图文工作台

打开即可使用，无需登录或配置 API Key。支持八场景、四平台规则编排，编辑与版本、来源追溯、表达核验及 Markdown / HTML / JSON 导出。

公开演示采用实际核对的华为官网精简规格摘要和官网原站图片链接。它在浏览器内按规则组织内容，不调用 ima 或大模型；不是本地大模型，也不代表完成正式模型验收。输出保留来源与待人工核验标记。

此目录不含原始知识库、私人运行记录或凭据。最近 20 条作品保存在当前浏览器；图片直接从华为官网读取，需要网络。HTML 导出会尝试内嵌图片，失败时如实标记缺图。

源码与完整项目：[GitHub](https://github.com/jixie1111/zhixu-huawei-pc-agent)。本机完整版可使用已授权的完整资料库，并可选择接入真实模型进行创作与独立核验。

将本目录作为静态站点根目录，入口为 index.html。应用使用相对资源地址，可部署于站点子路径。页面刷新和页面内导航无需额外后端路由。
`;
const allowedExtensions=new Set(['.html','.js','.css','.svg','.ico','.png','.jpg','.jpeg','.webp','.woff','.woff2','.ttf']);

/** Prepare a new upload directory; never recurse into the workspace or upload. */
export function stageDemo(root=process.cwd()):string {
  const source=path.join(root,'dist-demo'),secrets=configuredSecrets(root);
  if(!fs.existsSync(path.join(source,'index.html')))throw new Error('请先运行 npm run build:demo，未找到静态预览入口。');
  if(fs.lstatSync(source).isSymbolicLink())throw new Error('静态构建目录不能是符号链接。');
  const collect=(directory:string):string[]=>fs.readdirSync(path.join(source,directory),{withFileTypes:true}).flatMap(entry=>{
    const relative=path.posix.join(directory,entry.name);
    if(entry.isSymbolicLink())throw new Error(`静态预览禁止符号链接：${relative}`);
    if(entry.isDirectory())return collect(relative);
    if(!entry.isFile()||!allowedExtensions.has(path.extname(relative).toLowerCase())||/(^|\/)(?:private|vendor|node_modules|\.git|\.env[^/]*)(\/|$)/i.test(relative))throw new Error(`静态预览存在非构建文件：${relative}`);
    return [relative];
  });
  const payloads=collect('').map(file=>{
    const content=fs.readFileSync(path.join(source,file));
    if(hasSensitiveContent(content.toString('utf8'),secrets))throw new Error(`静态预览疑似包含凭证，已停止准备：${file}。不会输出敏感内容。`);
    return {file,content};
  });
  const output=path.join(root,'output',`static-demo-${new Date().toISOString().replace(/[:.]/g,'-')}`);
  fs.mkdirSync(output,{recursive:true});
  for(const {file,content} of payloads){const destination=path.join(output,file);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,content,{flag:'wx'});}
  fs.writeFileSync(path.join(output,'README.md'),card,{flag:'wx'});
  console.log(`已准备静态预览 ${payloads.length} 个构建文件及 README：${output}`);
  console.log('未执行上传；目录仅用于明确标注的交互演示，不是正式比赛结果。');
  return output;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)stageDemo();
