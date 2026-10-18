import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { KnowledgeStore } from './knowledge';
import { RunStore } from './store';
import { ImaAdapter } from './ima';
import { configure, clearSession, settings, publicDeployment, safeError, deploymentSecurity, allowsWriteOrigin } from './config';
import { AppError } from './errors';
import { generate } from './agent';
import { auditArticle, scanCompliance } from './audit';
import { editableSchema, testModel, verifySemantic } from './llm';
import { toHtml, toMarkdown } from './export';
import type { Run } from '../shared/types';
import { publicCatalog } from './catalog';
import { verifyImageAvailability } from './image-verification';
import { hasPublicOnlineLineage } from './public-history';
import { createEvidenceImageReader } from './evidence-images';

export function createApp(options:{knowledge?:KnowledgeStore;store?:RunStore;ima?:ImaAdapter}={}) {
  const security=deploymentSecurity();
  const app=express(),knowledge=options.knowledge||new KnowledgeStore(),store=options.store||new RunStore(),ima=options.ima||new ImaAdapter();
  // All expensive workflows share one budget. A disconnected request retains its
  // slot until its upstream work has actually stopped, then finally releases it.
  let active=0;
  const withRequest=async(req:Request,res:Response,heavy:boolean,work:(signal:AbortSignal)=>Promise<void>)=>{
    if(heavy&&active>=2)throw new AppError('BUSY','正在处理其他检索、创作、核验或图文导出任务，请稍后重试。',429);
    if(heavy)active++;
    const abort=new AbortController();
    const disconnect=()=>{if(!res.writableEnded)abort.abort(new DOMException('客户端已断开请求。','AbortError'));};
    req.once('aborted',disconnect);res.once('close',disconnect);
    try{if(req.aborted||res.destroyed)disconnect();abort.signal.throwIfAborted();await work(abort.signal);}
    finally{req.off('aborted',disconnect);res.off('close',disconnect);if(heavy)active--;}
  };
  app.disable('x-powered-by');
  app.set('trust proxy',false);
  const products=()=>publicDeployment?publicCatalog:knowledge.products;
  const development=!publicDeployment&&process.env.NODE_ENV!=='production'&&!process.argv.includes('--production');
  // The local Vite React refresh preamble is inline. Production keeps strict script-src.
  app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:development?["'self'","'unsafe-inline'"]:["'self'"],styleSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'",'data:','blob:'],connectSrc:development?["'self'",'ws://127.0.0.1:*','ws://localhost:*']:["'self'"],fontSrc:["'self'"],objectSrc:["'none'"],baseUri:["'self'"],frameAncestors:security.frameAncestors,upgradeInsecureRequests:null}},xFrameOptions:security.frameAncestors[0]==="'none'"?{action:'deny'}:false,crossOriginEmbedderPolicy:false}));
  app.use((req,res,next)=>{
    if(!publicDeployment&&!['127.0.0.1','localhost','::1','[::1]'].includes(req.hostname))return res.status(403).json({code:'HOST_DENIED',message:'仅允许本机访问。'});
    if(req.path.startsWith('/api/'))res.setHeader('Cache-Control','no-store');
    if(!['GET','HEAD','OPTIONS'].includes(req.method)) {
      const origin=req.get('origin');
      if(origin!==undefined&&!allowsWriteOrigin(origin,req.get('host'),req.protocol,security))return res.status(403).json({code:'ORIGIN_DENIED',message:publicDeployment&&!security.publicOrigin?'公开浏览器写入尚未启用，请管理员配置 PUBLIC_ORIGIN。':'拒绝跨站写入请求。'});
      if(origin===undefined&&req.get('sec-fetch-site')==='cross-site')return res.status(403).json({code:'ORIGIN_DENIED',message:'拒绝缺少来源的跨站写入请求。'});
      if(!req.is('application/json'))return res.status(415).json({code:'JSON_REQUIRED',message:'请使用 JSON 请求。'});
    }
    next();
  });
  app.use(express.json({limit:'128kb'}));
  const requireAdmin=(req:Request,res:Response,next:NextFunction)=>{
    if(!publicDeployment)return next();
    const expected=process.env.ADMIN_TOKEN||'',given=req.get('x-admin-token')||'';
    if(!expected||Buffer.byteLength(given)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(given),Buffer.from(expected)))return res.status(401).json({code:'ADMIN_REQUIRED',message:'公开预览仅展示界面；访问私人知识库和生成需管理员授权。'});
    next();
  };
  const rate=new Map<string,{start:number;count:number}>();
  app.use('/api',(req,res,next)=>{
    const ip=req.ip||'local',now=Date.now(),value=rate.get(ip);
    if(!value||now-value.start>60000)rate.set(ip,{start:now,count:1});
    else if(++value.count>240)return res.status(429).json({code:'RATE_LIMIT',message:'请求过于频繁，请稍后再试。'});
    if(rate.size>1000)for(const [key,v]of rate)if(now-v.start>60000)rate.delete(key);
    next();
  });
  app.get('/api/status',(_req,res)=>res.json({name:'知序',version:'0.1.0',mode:publicDeployment?'public-preview':'local',ready:true}));
  app.get('/api/bootstrap',(_req,res)=>res.json({products:publicDeployment?publicCatalog:knowledge.products,stats:publicDeployment?{documents:0,images:0,products:publicCatalog.length,categories:0}:knowledge.stats,settings:settings(),runs:publicDeployment?[]:store.list()}));
  app.use('/api',requireAdmin);
  app.get('/api/products/:id',(req,res)=>{
    if(publicDeployment){const product=publicCatalog.find(p=>p.id===req.params.id);if(!product)throw new AppError('PRODUCT_UNKNOWN','未知型号。',404);return res.json({product,facts:[],images:[],warnings:['公开预览只包含型号名称。生成时需从已授权的 ima 知识库取证。'],trace:[]});}
    res.json(knowledge.get(req.params.id));
  });
  app.get('/api/knowledge',(req,res)=>{
    if(publicDeployment)throw new AppError('PRIVATE_SNAPSHOT','本地知识库不在公开部署中展示。',403);
    const q=String(req.query.q||''),category=String(req.query.category||''),page=Math.max(1,Math.min(10000,Number(req.query.page)||1));
    res.json(knowledge.search(q,category,page));
  });
  app.get('/api/knowledge/:id',(req,res)=>{
    if(publicDeployment)throw new AppError('PRIVATE_SNAPSHOT','本地知识库不在公开部署中展示。',403);
    const doc=knowledge.docs.find(d=>d.id===req.params.id);if(!doc)throw new AppError('DOC_NOT_FOUND','资料不存在。',404);res.json(doc);
  });
  app.get('/api/assets/:id',(req,res)=>{
    if(publicDeployment)throw new AppError('PRIVATE_ASSET','本地知识素材不公开传播。',403);
    const filename=knowledge.assets.get(req.params.id);if(!filename)throw new AppError('ASSET_NOT_FOUND','图片不存在。',404);
    res.sendFile(filename);
  });
  app.get('/api/ima-assets/:id',async(req,res)=>{
    await withRequest(req,res,false,async signal=>{const asset=await ima.asset(req.params.id,signal);signal.throwIfAborted();if(!asset)throw new AppError('ASSET_NOT_FOUND','ima 图片记录不可用，请重新检索。',404);res.type(asset.type).send(asset.body);});
  });
  app.get('/api/runs',(_req,res)=>res.json(publicDeployment?store.list().filter(summary=>{const run=store.get(summary.id);return !!run&&hasPublicOnlineLineage(run,id=>store.get(id));}):store.list()));
  const getRun=(id:string)=>{const run=store.get(id);if(!run)throw new AppError('RUN_NOT_FOUND','作品不存在。',404);if(publicDeployment&&!hasPublicOnlineLineage(run,key=>store.get(key)))throw new AppError('PRIVATE_RUN','公开部署不读取本地、混合来源或来源链不完整的历史作品。请在本地查看原稿，或重新进行 ima 在线创作。',403);return run;};
  app.get('/api/runs/:id',(req,res)=>res.json(getRun(req.params.id)));
  app.post('/api/retrieve',async(req,res)=>{
    const {productId}=z.object({productId:z.string().min(1),mode:z.literal('ima')}).strict().parse(req.body);
    const product=products().find(p=>p.id===productId);if(!product)throw new AppError('PRODUCT_UNKNOWN','请选择一个明确产品型号。',422);
    await withRequest(req,res,true,async signal=>{const evidence=await ima.retrieve(product,undefined,signal);signal.throwIfAborted();res.json(evidence);});
  });
  app.post('/api/generate',async(req,res)=>{
    await withRequest(req,res,true,async signal=>{
    res.status(200).set({'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();
    const send=(event:string,data:unknown)=>{if(!signal.aborted&&!res.destroyed&&!res.writableEnded)res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);};
    const heartbeat=setInterval(()=>{if(!signal.aborted&&!res.destroyed&&!res.writableEnded)res.write(': keep-alive\n\n');},10000);
    try{const run=await generate(req.body,{knowledge,store,ima,signal,onStage:data=>send('stage',data)});signal.throwIfAborted();send('result',run);}
    catch(error){if(!signal.aborted)send('error',{code:error instanceof AppError?error.code:'GENERATE_FAILED',message:safeError(error),details:error instanceof AppError?error.details:undefined});}
    finally{clearInterval(heartbeat);if(!res.destroyed&&!res.writableEnded)res.end();}
    });
  });
  app.post('/api/runs/:id/edit',async(req,res)=>{
    const original=getRun(req.params.id);const parsed=editableSchema.parse(req.body);
    await withRequest(req,res,original.engine==='llm',async signal=>{
    const article={...original.article,...parsed};let audit=auditArticle(article,original.evidence,original.brief,original.engine);
    if(original.engine==='llm') {
      await verifyImageAvailability(article,audit,createEvidenceImageReader(knowledge,ima,original.brief.mode),signal);
      try{audit=await verifySemantic(article,original.evidence,audit,signal,original.brief.mode);}catch(error){if(signal.aborted)throw error;audit.findings.push({id:'semantic-failed',category:'fact',severity:'block',message:'编辑后的独立语义核验未完成，当前修改仅保存为待审版本。',suggestion:'检查模型服务后重新修改或生成；不能沿用旧稿通过状态。'});audit.status='blocked';audit.releaseReady=false;}
    }
    signal.throwIfAborted();
    const now=new Date().toISOString();const next:Run={...original,id:randomUUID(),parentId:original.id,brief:{...original.brief,parentId:original.id},version:original.version+1,createdAt:now,updatedAt:now,article,audit,trace:[...original.trace,{action:'人工编辑并重新核验',detail:'保留原稿，创建新版本；不是覆盖旧证据。',at:now}]};res.json(store.save(next));
    });
  });
  app.get('/api/runs/:id/export',async(req,res)=>{
    const run=getRun(req.params.id);if(!run.audit.releaseReady&&req.query.draft!=='true')throw new AppError('EXPORT_NOT_APPROVED','该稿件尚未通过完整验收，只能导出带标记的草稿。',409);
    const format=String(req.query.format||'md');if(!['md','json','html'].includes(format))throw new AppError('EXPORT_FORMAT','不支持的导出格式。');
    const name=`zhixu-${run.id.slice(0,8)}-v${run.version}${run.audit.releaseReady?'':'-DRAFT'}.${format}`;
    if(format==='json')return res.setHeader('Content-Disposition',`attachment; filename="${name}"`).type('application/json').send(JSON.stringify(run,null,2));
    if(format==='md')return res.setHeader('Content-Disposition',`attachment; filename="${name}"`).type('text/markdown; charset=utf-8').send(toMarkdown(run));
    await withRequest(req,res,true,async signal=>{
    const imageData=new Map<string,string>();
    for(const image of run.article.images) {
      signal.throwIfAborted();
      try{
        let body:Buffer|undefined,type='image/png';
        if(image.sourceMode==='local'&&!publicDeployment){const filename=knowledge.assets.get(image.id);if(filename){body=await fs.promises.readFile(filename,{signal});type=path.extname(filename).toLowerCase()==='.jpg'?'image/jpeg':path.extname(filename).toLowerCase()==='.webp'?'image/webp':'image/png';}}
        else if(image.sourceMode==='ima'){const asset=await ima.asset(image.id,signal);body=asset?.body;type=asset?.type||type;}
        signal.throwIfAborted();
        if(body&&body.length<8000000)imageData.set(image.id,`data:${type};base64,${body.toString('base64')}`);
      }catch(error){if(signal.aborted)throw error;/* Export transparently labels unavailable assets; never invents an image. */}
    }
    signal.throwIfAborted();
    if(run.audit.releaseReady&&req.query.draft!=='true'&&imageData.size!==run.article.images.length)throw new AppError('EXPORT_IMAGES_UNAVAILABLE','部分原始图片暂时不可读取，无法导出完整图文。请恢复图片访问后重试，或明确选择带标记的草稿导出。',503);
    res.setHeader('Content-Disposition',`attachment; filename="${name}"`).type('html').send(toHtml(run,imageData));
    });
  });
  app.post('/api/audit',(req,res)=>{
    const {text,productId}=z.object({text:z.string().min(1).max(20000),productId:z.string().optional()}).parse(req.body);
    const findings=scanCompliance(text);
    if(productId&&!products().some(p=>p.id===productId))throw new AppError('PRODUCT_UNKNOWN','无法确认产品型号。',422);
    findings.push({id:'scope',category:'fact',severity:'info',message:'此独立文本检查仅扫描营销合规规则，未进行逐项产品事实认证。',suggestion:'请在创作流程中绑定来源后运行完整事实核验。'});
    res.json({findings});
  });
  app.post('/api/settings',(req,res)=>res.json(configure(req.body)));
  app.post('/api/settings/clear',(_req,res)=>{clearSession();res.json(settings());});
  app.post('/api/settings/test',async(req,res)=>{
    const {target}=z.object({target:z.enum(['ima','llm'])}).parse(req.body);
    const result=target==='ima'?await ima.connect():{message:await testModel()};
    res.json({ok:true,message:result.message,settings:settings()});
  });
  app.use('/api',(_req,res)=>res.status(404).json({code:'NOT_FOUND',message:'接口不存在。'}));
  app.use((error:unknown,_req:Request,res:Response,_next:NextFunction)=>{
    if(res.headersSent||res.destroyed||res.writableEnded)return;
    if(error instanceof z.ZodError)return res.status(422).json({code:'VALIDATION',message:'输入格式不正确，请检查表单。',details:error.issues.map(i=>({path:i.path,message:i.message}))});
    const status=error instanceof AppError?error.status:400;
    res.status(status).json({code:error instanceof AppError?error.code:'REQUEST_FAILED',message:safeError(error),details:error instanceof AppError?error.details:undefined});
  });
  return app;
}
