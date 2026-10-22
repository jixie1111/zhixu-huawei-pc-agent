import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import type { Evidence, Fact, Product, ProductCategory, ProductImage, SourceMode } from '../shared/types';
import { privateDir, restrictedPublic, releasedData } from './config';
import { AppError } from './errors';
import { publicCatalog } from './catalog';
import { imageType } from './network';
import { reviewedImage, coverPreference, imageDescription } from './image-editorial';

export const digest=(value:string)=>createHash('sha256').update(value).digest('hex').slice(0,16);
const normal=(text:string)=>text.normalize('NFKC').replace(/\s+/g,' ').trim();
const modelKey=(text:string)=>text.normalize('NFKC').replace(/^HUAWEI\s*/i,'').replace(/\s+/g,'').toLowerCase();
const safeSource=(raw:string)=>{try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&(u.hostname==='consumer.huawei.com'||u.hostname==='e.huawei.com'||u.hostname==='www.vmall.com'||u.hostname==='vmall.com')?u.toString():'';}catch{return '';}};
const excluded=/(^|[\\/])(P4-|90-|99-)/;
function files(dir:string):string[] { if(!fs.existsSync(dir)) return []; return fs.readdirSync(dir,{withFileTypes:true}).flatMap(f=>f.isSymbolicLink()?[]:f.isDirectory()?files(path.join(dir,f.name)):[path.join(dir,f.name)]); }
export function extractFacts(text:string,productId:string,sourceTitle:string,sourceMode:SourceMode,sourcePath?:string):Fact[] {
  const sourceUrl=safeSource(text.match(/https:\/\/consumer\.huawei\.com\/[^\s)]+\/specs\//)?.[0]||text.match(/https:\/\/[^\s)]+/)?.[0]||'');
  const sections=text.split(/^##\s+/m).slice(1);
  const allowed=['操作系统','尺寸与重量','屏幕','处理器','存储','内存','显卡','无线连接','电池','接口','键盘和触控板','摄像头','音频','特色应用','前置摄像头','后置摄像头','拍摄功能','充电','传感器','定位','网络制式','防尘防水','手写笔','配件兼容','数据连接','感应器','防尘抗水','NFC','麦克风','扬声器'];
  return sections.flatMap(section=>{
    const [rawLabel,...rest]=section.split('\n'); const label=rawLabel.trim();
    if(!allowed.includes(label)) return [];
    const text=rest.join('\n').split('即将离开consumer.huawei.com')[0].trim();
    if(!text) return [];
    return [{id:digest(productId+sourceTitle+label+text),label,text,sourceTitle,sourceUrl,sourcePath,sourceMode,productId,retrievedAt:new Date().toISOString()}];
  });
}
export function detectConflicts(facts:Fact[],category:ProductCategory='computer'):string[] {
  const found:string[]=[];
  const dims=facts.filter(f=>f.label==='尺寸与重量');
  for(const f of dims) {
    const thickness=f.text.match(/厚度\s*(\d+(?:\.\d+)?)\s*mm/i);
    const length=f.text.match(/长度\s*(\d+(?:\.\d+)?)\s*mm/i);
    if(category==='computer'&&(thickness&&Number(thickness[1])>60||length&&Number(length[1])<100)) found.push('尺寸字段疑似错位：机身长度或厚度超出常见笔记本范围。需人工核对原始资料，已停止生成。');
  }
  const map=new Map<string,string>();
  for(const f of facts) { const value=normal(f.text); if(map.has(f.label)&&map.get(f.label)!==value) found.push(`“${f.label}”存在不同来源的冲突内容，需人工确认版本。`); map.set(f.label,value); }
  return [...new Set(found)];
}
interface Doc { id:string; title:string; path:string; category:string; text:string }
/** Product category is descriptive only. It never grants cross-device compatibility. */
export function classifyProduct(name:string,directory:string):ProductCategory {
  if(/MatePad|平板/i.test(name+' '+directory))return 'tablet';
  if(/\bPura\b|\bMate\s*\d|\bMate\s*X|\bnova\b|手机/i.test(name+' '+directory))return 'phone';
  if(/MateBook|MateStation|电脑|Notebook/i.test(name+' '+directory))return 'computer';
  return 'other';
}
export class KnowledgeStore {
  products:Product[]=[]; evidence=new Map<string,Evidence>(); assets=new Map<string,string>(); docs:Doc[]=[];
  stats={documents:0,images:0,products:0,categories:0};
  constructor(root=releasedData?path.join(releasedData.root,'knowledge'):process.env.KNOWLEDGE_DIR||path.join(privateDir,'knowledge')) {
    // Even an accidentally mounted local archive must not be read in public mode.
    if(restrictedPublic){this.products=structuredClone(publicCatalog);this.stats.products=this.products.length;return;}
    const inventory=files(root); const permitted=inventory.filter(p=>!excluded.test(p));
    for(const file of permitted.filter(f=>f.endsWith('.md'))) {
      const text=fs.readFileSync(file,'utf8'); const relative=path.relative(root,file).replaceAll('\\','/');
      const category=relative.split('/').find(c=>/^P[1-8]-|^00-/.test(c))||'全库说明';
      this.docs.push({id:digest(relative),title:text.match(/^#\s+(.+)$/m)?.[1]||path.basename(file),path:relative,category,text});
    }
    for(const file of permitted.filter(f=>path.basename(f)==='产品事实.md')) {
      const directory=path.dirname(file), text=fs.readFileSync(file,'utf8');
      const name=text.match(/^#\s+(.+?)\s*-\s*产品事实/m)?.[1]||path.basename(directory);
      const id=digest(name), relative=path.relative(root,file).replaceAll('\\','/');
      const facts=extractFacts(text,id,`${name} · 产品事实`,'local',relative);
      const images:ProductImage[]=[];
      const warnings:string[]=[];
      for(const index of permitted.filter(f=>f.startsWith(directory+path.sep)&&path.basename(f)==='图片索引.csv')) {
        const rows=parse(fs.readFileSync(index,'utf8'),{columns:true,skip_empty_lines:true,bom:true}) as Record<string,string>[];
        for(const row of rows) {
          const filename=row['文件名']; if(!filename) continue;
          const mimeByExtension:Record<string,string>={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};
          const expectedType=mimeByExtension[path.extname(filename).toLowerCase()];
          if(!expectedType){warnings.push(`已排除不支持的图片类型：${filename}`);continue;}
          if(modelKey(row['产品型号']||'')!==modelKey(name)){warnings.push(`已排除型号标签不一致的图片：${filename}`);continue;}
          if(!safeSource(row['来源页面']||'')){warnings.push(`已排除来源页面无效的图片：${filename}`);continue;}
          const actual=permitted.find(f=>f.startsWith(directory+path.sep)&&path.basename(f)===filename); if(!actual) continue;
          try {
            const stat=fs.lstatSync(actual),relativeAsset=path.relative(fs.realpathSync(directory),fs.realpathSync(actual));
            if(!stat.isFile()||stat.isSymbolicLink()||stat.size>=8000000||relativeAsset.startsWith('..'+path.sep)||path.isAbsolute(relativeAsset)||imageType(fs.readFileSync(actual))!==expectedType)throw new Error('invalid bitmap');
          } catch {warnings.push(`已排除内容签名或路径未通过校验的图片：${filename}`);continue;}
          const assetId=digest(path.relative(root,actual)); this.assets.set(assetId,actual);
          if(images.some(i=>i.id===assetId)) continue;
          const editorial=reviewedImage({productId:id},fs.readFileSync(actual));
          images.push({id:assetId,name:filename,productId:id,productName:row['产品型号']||name,url:`/api/assets/${assetId}`,sourceUrl:safeSource(row['来源页面']||''),...imageDescription(row['官网图片说明']||filename,editorial),sourceTitle:path.relative(root,index).replaceAll('\\','/'),width:Number(row['宽度'])||undefined,height:Number(row['高度'])||undefined,sourceMode:'local',editorial});
        }
      }
      // Stable editorial cover selection, never substitute a different model.
      images.sort((a,b)=>coverPreference(b)-coverPreference(a)||Number(/原野绿/.test(b.name))-Number(/原野绿/.test(a.name)));
      const category=classifyProduct(name,directory);
      const family=category==='phone'?'手机':category==='tablet'?'平板':category==='computer'?(directory.includes('鸿蒙电脑')?'鸿蒙电脑':'电脑'):'其他产品';
      const product:Product={id,name,shortName:name.replace(/^HUAWEI /,''),family,category,os:facts.find(f=>f.label==='操作系统')?.text.split('\n')[0]||'待核验',factCount:facts.length,imageCount:images.length,cover:images[0]?.url,conflicts:detectConflicts(facts,category)};
      this.products.push(product);this.evidence.set(id,{product,facts,images,warnings:['资料与原图来自本地知识库，不是 ima 在线检索。','配置、版本和动态信息须在发布前重新核实。',...warnings],trace:[{action:'本地资料检索',detail:`精确读取 ${name} 的产品事实与图片索引`,at:new Date().toISOString()}]});
    }
    this.products.sort((a,b)=>Number(b.shortName==='MateBook 14（鸿蒙版）')-Number(a.shortName==='MateBook 14（鸿蒙版）')||a.name.localeCompare(b.name,'zh'));
    this.stats={documents:this.docs.length,images:this.assets.size,products:this.products.length,categories:new Set(this.docs.map(d=>d.category)).size};
    if(!this.products.length)this.products=structuredClone(publicCatalog);
  }
  get(productId:string):Evidence {
    if(restrictedPublic) throw new AppError('PRIVATE_SNAPSHOT','公开部署禁止读取未授权的知识库快照。',403);
    const data=this.evidence.get(productId); if(!data) throw new AppError('PRODUCT_UNKNOWN','请选择一个明确的产品型号；相近系列不可混用。',422);
    return structuredClone(data);
  }
  search(query:string,category?:string,page=1) {
    if(restrictedPublic) throw new AppError('PRIVATE_SNAPSHOT','公开部署禁止检索未授权的知识库快照。',403);
    const q=query.slice(0,100).toLowerCase(); const tokens=q.split(/\s+/).filter(Boolean);
    const matches=this.docs.filter(d=>(!category||d.category===category)&&tokens.every(t=>(d.title+' '+d.text).toLowerCase().includes(t)));
    const start=(page-1)*20;
    return {total:matches.length,page,categories:[...new Set(this.docs.map(d=>d.category))].sort((a,b)=>a.localeCompare(b,'zh')),items:matches.slice(start,start+20).map(d=>({id:d.id,title:d.title,category:d.category,path:d.path,excerpt:d.text.replace(/^#+\s*/gm,'').slice(0,180)}))};
  }
}
