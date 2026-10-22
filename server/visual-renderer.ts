import { createHash } from 'node:crypto';
import { chromium, type Browser, type Page } from 'playwright';
import { zipSync, strToU8 } from 'fflate';
import type { VisualDocument, VisualManifest, VisualPage } from '../shared/visual-export';
import { PLATFORMS } from '../shared/rules';
import { imageSlot } from '../shared/layout';
import { escapeHtml as e } from './export';
import { AppError } from './errors';
import { imageType } from './network';
import type { ImageReader } from './image-verification';
import { validateVisualDocument } from './visual-document';
import { reviewedImage, coverPreference } from './image-editorial';
import type { VisualText } from '../shared/visual-export';

const digest=(data:Buffer)=>createHash('sha256').update(data).digest('hex');
const keepUnits=(html:string)=>html.replace(/\d[\d.,]*(?:\s?[×x]\s?\d[\d.,]*)*\s?(?:mm|cm|kg|g|Wh|mAh|英寸|尼特|nits|Hz|GHz|MHz|GB|TB|MP|W|ppi|%)/gu,m=>`<span style="white-space:nowrap">${m}</span>`);
export const VISUAL_SIZES={xiaohongshu:[1080,1440],wechat:[1200,1600],moments:[1080,1080],poster:[1080,1528]} as const;
export interface VisualBundle {zip:Buffer;manifest:VisualManifest;pages:{filename:string;body:Buffer}[]}
export interface VisualRenderOptions {signal?:AbortSignal;deadlineMs?:number;pageLimit?:number;beforeReturn?:()=>void|Promise<void>}
const MAX_PAGES=32,MAX_TOTAL_BYTES=48_000_000;

const SHEET_CSS=`
*{box-sizing:border-box}body{margin:0;background:#f5f5f7;color:#1d1d1f;font-family:'HarmonyOS Sans SC','PingFang SC','Microsoft YaHei UI','Microsoft YaHei','Noto Sans SC',system-ui,sans-serif}
.sheet{position:relative;padding:64px;display:flex;flex-direction:column;overflow:hidden;background:#f5f5f7}
.sheet::before{display:none}
header{display:flex;align-items:center;justify-content:space-between;gap:20px;font-size:22px;flex-shrink:0;border-bottom:2px solid #e5e5ea;padding-bottom:22px}
.brand{font-weight:700;color:#1d1d1f}.platform{color:#6e6e73}.status{font-size:19px;color:#b25b1f;border:2px solid #f0c9a8;border-radius:999px;padding:2px 14px}
.content{flex:1;min-height:0;padding:40px 0;display:flex;flex-direction:column;gap:22px}
h1,h2,p{margin:0;overflow-wrap:anywhere;white-space:pre-wrap}
h1{font-size:66px;font-weight:700;line-height:1.32;letter-spacing:-1px;color:#1d1d1f;text-wrap:balance}
h2{font-size:40px;line-height:1.45;font-weight:700}
.body{font-size:30px;line-height:1.85;letter-spacing:.3px;color:#424245}
.eyebrow{font-size:23px;color:#0071e3;font-weight:500}
.product-line{font-size:25px;line-height:1.6;color:#6e6e73}
.hero{flex:1;min-height:0;display:grid;grid-template-columns:repeat(var(--columns),minmax(0,1fr));gap:22px}
.product{min-height:0;display:flex;flex-direction:column;background:#fff;border:2px solid #e5e5ea;border-radius:24px;padding:24px;gap:16px}
.product img{display:block;width:100%;height:0;flex:1;min-height:0;object-fit:contain;object-position:center}
.caption{font-size:22px;line-height:1.5;text-align:center;color:#86868b;overflow-wrap:anywhere}
.page-heading{padding-left:20px;border-left:6px solid #0071e3}
.text-zone{flex:1;min-height:0;border-radius:24px;background:#fff;padding:32px 36px}
.continuation{font-size:22px;color:#86868b}
.foot{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;font-size:19px;line-height:1.55;color:#86868b;border-top:2px solid #e5e5ea;padding-top:20px;flex-shrink:0}.foot span:first-child{max-width:82%}
.draft-mark{position:absolute;right:55px;bottom:115px;border:3px solid #c0632a;color:#c0632a;border-radius:10px;padding:8px 16px;font-size:24px;font-weight:700;transform:rotate(-8deg);opacity:.85;pointer-events:none}
.inline-visual{height:300px;flex-shrink:0}.inline-visual>.hero{height:100%}.inline-visual .product{padding:16px}.inline-visual .caption{font-size:20px}
.flow-zone{display:flex;flex-direction:column;gap:18px;flex-shrink:0}
.flow-zone.is-final{gap:26px}
.body{text-wrap:pretty}
.flow-fragment{border-radius:20px;padding:18px 24px;display:flex;flex-direction:column;gap:14px;flex-shrink:0}
.flow-fragment h2{font-size:34px;line-height:1.45;color:#1d1d1f}.flow-fragment .body{font-size:30px;line-height:1.8}
.flow-fragment.is-lead{background:#fff;border:2px solid #e5e5ea}
.flow-fragment.is-cta{background:#e8f1fc}.flow-fragment.is-cta .body,.flow-fragment.is-cta h2{color:#0066cc}
.flow-fragment.is-tags{padding:14px 22px;background:#e8f1fc;border-radius:18px}.flow-fragment.is-tags .body{color:#0071e3}
.flow-fragment.is-tags .body,.flow-fragment.is-conditions .body{font-size:25px;line-height:1.7}
.flow-fragment.is-conditions{border:0;border-top:2px solid #e5e5ea;border-radius:0;background:none;padding:16px 4px 0;gap:8px}.flow-fragment.is-conditions .body{color:#6e6e73}
.condition-label{font-weight:700;color:#1d1d1f}
.flow-fragment .inline-visual .product{padding:12px;gap:10px}.flow-fragment.image-only{padding-top:0;padding-bottom:0}
.sheet.is-cover{background:#f5f5f7}
.sheet.is-cover::before{display:none}
.sheet.is-cover header{border-bottom-color:rgba(0,0,0,.08)}
.sheet.is-cover h1{font-weight:600;letter-spacing:-.5px;text-align:center}
.sheet.is-cover .product{background:none;border:0;box-shadow:none;padding:0;gap:14px}
.sheet.is-cover .product img{width:auto;max-width:100%;align-self:center;border-radius:24px;background:none;box-shadow:0 24px 50px rgba(0,0,0,.1)}
.sheet.is-cover .product.is-cutout img{border-radius:0;box-shadow:none;background:none;filter:drop-shadow(0 30px 34px rgba(0,0,0,.18))}
.sheet.is-cover .caption{display:block;font-size:20px;color:#86868b;visibility:hidden}
.sheet.is-cover.tone-match{background:var(--stage)}
.sheet.is-cover.tone-match .product img{border-radius:0;box-shadow:none;background:none;-webkit-mask-image:radial-gradient(75% 75% at 50% 50%,#000 70%,transparent 100%);mask-image:radial-gradient(75% 75% at 50% 50%,#000 70%,transparent 100%)}
.sheet.is-cover.tone-white .product img{border-radius:0;box-shadow:none;background:none;mix-blend-mode:multiply}
.sheet.is-cover.tone-dark h1,.sheet.is-cover.tone-dark .brand{color:#f5f5f7}
.sheet.is-cover.tone-dark header,.sheet.is-cover.tone-dark .foot{border-color:rgba(255,255,255,.16)}
.sheet.is-cover.tone-dark .foot,.sheet.is-cover.tone-dark .caption{color:rgba(255,255,255,.6)}
.sheet.is-cover.tone-dark .status{color:#ffb27a;border-color:rgba(255,178,122,.5)}
.sheet.is-cover.tone-dark .draft-mark{color:#ffb27a;border-color:#ffb27a}
.poster-content{gap:16px;padding:26px 0}.poster-content h1{font-size:50px;line-height:1.3}.poster-content .inline-visual{height:330px}
.poster-content .body{font-size:25px;line-height:1.65}.poster-content h2{font-size:28px;line-height:1.4;color:#1d1d1f}
.poster-content .poster-copy{display:flex;flex-direction:column;gap:12px}
.poster-content .conditions .body{font-size:22px;line-height:1.55;color:#6e6e73}.poster-content .conditions{border-top:2px solid #e5e5ea;padding-top:10px}
.poster-content .caption{font-size:20px}`;
function shell(doc:VisualDocument){
  const [width,height]=VISUAL_SIZES[doc.platform];
  const brand=doc.products.map(p=>p.name).join(' + ');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none';img-src data:;style-src 'unsafe-inline';font-src 'none';base-uri 'none'"><style>${SHEET_CSS}.sheet{width:${width}px;height:${height}px}</style></head><body><main class="sheet"><header><span class="brand">${e(brand)}</span>${doc.draft?`<span class="status">${doc.engine==='local-composer'?'规则预览 · 待审草稿':'待审草稿'}</span>`:''}</header><div class="content"></div><footer class="foot"><span>${doc.draft?'草稿仅供审阅 · 原图及完整适用条件见本组图文':'图片仅示意 · 配置及适用条件以官方信息为准'}</span><span class="page-number"></span></footer>${doc.draft?'<div class="draft-mark">待审稿</div>':''}</main></body></html>`;
}
async function setContent(page:Page,html:string){await page.locator('.content').evaluate((node,html)=>{node.innerHTML=html;},html);}
async function validLayout(page:Page){
  const errors=await page.evaluate(()=>{
    const result:string[]=[];const sheet=document.querySelector('.sheet')!.getBoundingClientRect(),zone=document.querySelector('.content')!.getBoundingClientRect();
    for(const node of document.querySelectorAll<HTMLElement>('h1,h2,.body,.caption,.product-line,.continuation,.flow-zone,.flow-fragment,img')){const r=node.getBoundingClientRect();if(r.bottom>zone.bottom+1||r.right>zone.right+1||r.left<zone.left-1||node.scrollHeight>node.clientHeight+1||node.scrollWidth>node.clientWidth+1||node.tagName==='IMG'&&(!r.width||!r.height||getComputedStyle(node).objectFit!=='contain'))result.push(node.className||node.tagName);}
    if(sheet.height!==document.documentElement.clientHeight||document.documentElement.scrollWidth>sheet.width)result.push('viewport');
    return result;
  });
  if(errors.length)throw new AppError('VISUAL_OVERFLOW','当前文案超出版面，请缩短标题或拆分作品后导出。',422,{elements:errors});
}
/** Local, isolated browser rendering: no auth profile, URL navigation, scripts,
 * file URLs, external fonts or network requests. Original bytes stay unchanged. */
export async function renderVisualBundle(doc:VisualDocument,reader:ImageReader,options:VisualRenderOptions={}):Promise<VisualBundle>{
  validateVisualDocument(doc);options.signal?.throwIfAborted();
  const pageLimit=options.pageLimit??MAX_PAGES;
  if(!Number.isInteger(pageLimit)||pageLimit<1||pageLimit>MAX_PAGES)throw new AppError('VISUAL_PAGE_LIMIT','图文页数上限须在1–32之间。',422);
  const timeout=AbortSignal.timeout(options.deadlineMs??90000),signal=options.signal?AbortSignal.any([options.signal,timeout]):timeout;
  const assets=new Map<string,{url:string;body:Buffer;type:string}>();let assetBytes=0;
  for(const image of doc.images){
    signal.throwIfAborted();const asset=await reader.asset?.(image.id,signal);signal.throwIfAborted();
    if(!asset||!asset.body.length||asset.body.length>8_000_000||imageType(asset.body)!==asset.type)throw new AppError('VISUAL_IMAGE','原始图片读取或文件签名校验失败，已停止导出。',422);
    if(asset.type==='image/png'&&(image.width&&asset.body.readUInt32BE(16)!==image.width||image.height&&asset.body.readUInt32BE(20)!==image.height))throw new AppError('VISUAL_IMAGE','原图尺寸与来源索引不一致。',422);
    assetBytes+=asset.body.length;if(assetBytes>24_000_000)throw new AppError('VISUAL_SIZE','原始图片总量超出本次导出限制。',413);
    assets.set(image.id,{...asset,url:`data:${asset.type};base64,${asset.body.toString('base64')}`});
  }
  let browser:Browser|undefined;
  const close=()=>{void browser?.close().catch(()=>undefined);};signal.addEventListener('abort',close,{once:true});
  const pages:VisualBundle['pages']=[],manifestPages:VisualPage[]=[];
  try{
    try{browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined,timeout:25000});}catch{signal.throwIfAborted();throw new AppError('VISUAL_BROWSER','图文渲染浏览器未就绪。Windows需要Edge；其他环境请安装Playwright Chromium。',503);}
    signal.throwIfAborted();
    const [width,height]=VISUAL_SIZES[doc.platform];
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,javaScriptEnabled:false,serviceWorkers:'block',acceptDownloads:false,locale:'zh-CN',colorScheme:'light'});
    await context.route('**/*',route=>route.abort());
    const page=await context.newPage();page.setDefaultTimeout(10000);
    // Inject styles as part of the static document. addStyleTag waits for a load
    // event that may never fire with JavaScript disabled in the isolated context.
    await page.setContent(shell(doc),{waitUntil:'domcontentloaded'});await page.evaluate(()=>document.fonts.ready);
    const originals:VisualManifest['originals']=[];
    // Decode original bytes in the same sandbox before embedding in any layout.
    for(const image of doc.images){
      signal.throwIfAborted();
      const size=await page.evaluate(async url=>{const img=new Image();img.src=url;await img.decode();return {width:img.naturalWidth,height:img.naturalHeight};},assets.get(image.id)!.url);
      if(!size.width||!size.height||size.width*size.height>40_000_000||image.width&&image.width!==size.width||image.height&&image.height!==size.height)throw new AppError('VISUAL_IMAGE','原图解码或尺寸校验失败。',422);
      originals.push({id:image.id,productId:image.productId,sourceUrl:image.sourceUrl,sha256:digest(assets.get(image.id)!.body),...size,editorial:reviewedImage(image,assets.get(image.id)!.body)});
    }
    const capture=async(kind:VisualPage['kind'],imageIds:string[],textRanges:VisualPage['textRanges'])=>{
      signal.throwIfAborted();if(pages.length>=pageLimit)throw new AppError('VISUAL_PAGE_LIMIT',`内容超过${pageLimit}张图，请拆分作品后导出；系统不会截掉剩余文字。`,422);
      await page.locator('.page-number').evaluate((node,value)=>node.textContent=value,`${String(pages.length+1).padStart(2,'0')}`);
      await page.evaluate(async()=>{await Promise.all([...document.images].map(i=>i.decode()));});await validLayout(page);
      const body=await page.screenshot({type:'png',animations:'disabled',timeout:10000});signal.throwIfAborted();
      if(imageType(body)!=='image/png'||body.readUInt32BE(16)!==width||body.readUInt32BE(20)!==height)throw new AppError('VISUAL_RENDER','输出尺寸不符合版式。',500);
      if(pages.reduce((n,p)=>n+p.body.length,0)+body.length>MAX_TOTAL_BYTES)throw new AppError('VISUAL_SIZE','图文包超过大小限制，请拆分作品后导出。',413);
      const filename=`${String(pages.length+1).padStart(2,'0')}-${kind}.png`;pages.push({filename,body});manifestPages.push({filename,kind,width,height,sha256:digest(body),imageIds,textRanges});
    };
    const figures=(ids:string[])=>`<div class="hero" style="--columns:${ids.length>1?2:1}">${ids.map(id=>{const image=doc.images.find(i=>i.id===id)!,screen=reviewedImage(image,assets.get(id)!.body)?.role==='screen-demo';const cutout=assets.get(id)!.type==='image/png'&&[4,6].includes(assets.get(id)!.body[25]);return `<div class="product${cutout?' is-cutout':''}"><img src="${assets.get(id)!.url}" alt="${e(screen?'屏幕演示画面':image.productName)}"><div class="caption">${e(screen?'屏幕演示画面 · 非整机实拍':image.productName)}</div></div>`;}).join('')}</div>`;
    if(doc.platform==='poster'){
      // A poster is one complete image, not a title card mislabelled as a poster.
      // Never remove qualifiers or silently shrink text to force an overfull fit.
      const ids=doc.images.map(i=>i.id);
      await page.locator('.content').evaluate(node=>node.classList.add('poster-content'));
      await setContent(page,`<h1>${e(doc.title)}</h1><div class="inline-visual">${figures(ids)}</div><div class="poster-copy">${doc.blocks.map(b=>`<section class="${b.kind==='conditions'?'conditions':''}">${b.heading?`<h2>${e(b.heading)}</h2>`:''}<p class="body">${e(b.text)}</p></section>`).join('')}</div>`);
      await capture('poster',ids,doc.blocks.map(b=>({blockId:b.id,start:0,end:Array.from(b.text).length})));
    }else{
    // Prefer a byte-reviewed product view over a screenshot/detail, even when a
    // legacy article labelled a scenery-only source as its cover. Keep every
    // selected image elsewhere in the bundle; never alter the saved article.
    const coverIds=doc.products.map(p=>doc.images.filter(i=>i.productId===p.id).map(i=>({...i,editorial:reviewedImage(i,assets.get(i.id)!.body)})).sort((a,b)=>coverPreference(b)-coverPreference(a))[0].id);
    // An opaque photo with a plain studio backdrop (e.g. mint KV) would read as a
    // card on the dark stage; extend its own backdrop colour across the cover
    // instead. The original image bytes are never altered.
    const tone=coverIds.length===1?await page.evaluate(async url=>{
      const img=new Image();img.src=url;await img.decode();
      const c=document.createElement('canvas');c.width=32;c.height=32;const x=c.getContext('2d')!;x.drawImage(img,0,0,32,32);
      // Sample the whole border; the backdrop is the colour most edge pixels share.
      const edge:number[][]=[];for(let i=0;i<32;i++)for(const [a,b] of [[i,0],[i,31],[0,i],[31,i]])edge.push(Array.from(x.getImageData(a,b,1,1).data));
      const median=[0,1,2].map(i=>edge.map(p=>p[i]).sort((m,n)=>m-n)[edge.length>>1]);
      const near=edge.filter(p=>[0,1,2].every(i=>Math.abs(p[i]-median[i])<=18)).length/edge.length;
      return {opaque:edge.every(p=>p[3]>240),avg:median,share:near};
    },assets.get(coverIds[0])!.url):undefined;
    const matched=tone&&tone.opaque&&tone.share>=.8;
    const luma=tone?0.299*tone.avg[0]+0.587*tone.avg[1]+0.114*tone.avg[2]:0;
    const light=matched&&luma>150;
    // Near-white studio photos: multiply them onto the page gray so the white
    // backdrop disappears instead of reading as a card. Pixels are not altered.
    // Multiply is harmless on white even where the product touches the frame edge.
    const tinted=tone?Math.max(...tone.avg)-Math.min(...tone.avg)>6:false;
    const whiteBackdrop=!!tone&&tone.opaque&&!tinted&&luma>238&&tone.share>=.4;
    await page.locator('.sheet').evaluate((node,{matched,light,white,rgb})=>{node.classList.add('is-cover');if(white)node.classList.add('tone-white');else if(matched){node.classList.add('tone-match',light?'tone-light':'tone-dark');node.style.setProperty('--stage',`rgb(${rgb.join(',')})`);}},{matched:!!matched,light:!!light,white:whiteBackdrop,rgb:tone?.avg??[0,0,0]});
    await setContent(page,`<h1>${e(doc.title)}</h1>${figures(coverIds)}`);
    await capture('cover',coverIds,[]);
    await page.locator('.sheet').evaluate(node=>{node.classList.remove('is-cover','tone-match','tone-white','tone-light','tone-dark');node.style.removeProperty('--stage');});
    // End-of-article images join the closing passage instead of becoming
    // oversized, context-free scenery pages. Every selected original is kept.
    const sections=doc.blocks.filter(b=>b.kind==='section');
    const assigned=new Map<string,string[]>(),endImages:string[]=[];
    for(const image of doc.images.filter(i=>!coverIds.includes(i.id))){const slot=imageSlot(image.position,sections.length);if(typeof slot==='number'){const id=sections[slot-1].id;assigned.set(id,[...(assigned.get(id)??[]),image.id]);}else endImages.push(image.id);}
    const endAnchor=[...doc.blocks].reverse().find(b=>b.kind==='cta')??sections.at(-1)??doc.blocks.at(-1);
    if(endAnchor&&endImages.length)assigned.set(endAnchor.id,[...(assigned.get(endAnchor.id)??[]),...endImages]);
    type Fragment={block:VisualText;start:number;end:number;images:string[]};
    let pending:Fragment[]=[];
    const figureHeight=(ids:string[])=>{
      const columnWidth=(width-128-48-24*ids.length-22*(ids.length-1))/ids.length;
      const natural=Math.max(...ids.map(id=>{const original=originals.find(i=>i.id===id)!;return columnWidth*original.height/original.width;}));
      const allScreens=ids.every(id=>originals.find(i=>i.id===id)?.editorial?.role==='screen-demo');
      return Math.min(allScreens?220:300,Math.max(200,Math.round(natural+65)));
    };
    const fragmentHtml=({block,start,end,images}:Fragment)=>{
      const hasText=start!==end,inlineHeading=block.kind==='conditions';
      const heading=hasText&&block.heading&&!inlineHeading?`<h2>${e(block.heading)}${start?' · 续':''}</h2>`:hasText&&start?'<div class="continuation">接上页</div>':'';
      const label=hasText&&inlineHeading&&block.heading?`<span class="condition-label">${e(block.heading)}：</span>`:'';
      const body=hasText?`<p class="body">${label}${keepUnits(e(Array.from(block.text).slice(start,end).join('')))}</p>`:'';
      return `<section class="flow-fragment is-${block.kind}${hasText?'':' image-only'}">${heading}${body}${images.length?`<div class="inline-visual" style="height:${figureHeight(images)}px">${figures(images)}</div>`:''}</section>`;
    };
    const flow=async(items:Fragment[])=>{
      await setContent(page,`<div class="flow-zone">${items.map(fragmentHtml).join('')}</div>`);
    };
    const fits=async(items:Fragment[])=>{signal.throwIfAborted();await flow(items);try{await validLayout(page);return true;}catch(error){if(error instanceof AppError&&error.code==='VISUAL_OVERFLOW')return false;throw error;}};
    const flush=async(last=false)=>{
      if(!pending.length)return;
      await flow(pending);
      if(last){
        await page.locator('.flow-zone').evaluate(node=>node.classList.add('is-final'));
        // Closing-page spacing is optional decoration. Recheck it against the
        // measured layout; retain the normal spacing instead of losing text.
        try{await validLayout(page);}catch(error){
          if(!(error instanceof AppError)||error.code!=='VISUAL_OVERFLOW')throw error;
          await page.locator('.flow-zone').evaluate(node=>node.classList.remove('is-final'));
        }
      }
      await capture(pending.every(f=>f.start===f.end)?'image':pending.every(f=>f.block.kind==='conditions')?'conditions':'content',pending.flatMap(f=>f.images),pending.filter(f=>f.end>f.start).map(f=>({blockId:f.block.id,start:f.start,end:f.end})));
      pending=[];
    };
    for(const block of doc.blocks){
      const chars=Array.from(block.text),images=assigned.get(block.id)??[];let offset=0,usedImages=0;
      while(offset<chars.length){
        const whole:Fragment={block,start:offset,end:chars.length,images:images.slice(0,2)};
        if(await fits([...pending,whole])){pending.push(whole);offset=chars.length;usedImages=whole.images.length;break;}
        // A figure may move to the following card, but its paragraph can still
        // use the remaining space. Text order and citation ranges never change.
        const textOnly={...whole,images:[]};
        if(images.length&&await fits([...pending,textOnly])){pending.push(textOnly);offset=chars.length;break;}
        // Keep a short paragraph together instead of leaving an orphaned line.
        if(pending.length){await flush();continue;}
        if(await fits([textOnly])){
          pending=[textOnly];offset=chars.length;
          break;
        }
        let low=0,high=chars.length-offset;
        while(low<high){const take=Math.ceil((low+high)/2);if(await fits([{...textOnly,end:offset+take}]))low=take;else high=take-1;}
        if(low<1)throw new AppError('VISUAL_OVERFLOW','当前标题或段落无法完整排版，请拆分后导出。',422);
        let take=low;for(let i=low-1;i>=Math.floor(low*.7);i--)if(/[。！？；\n]/u.test(chars[offset+i])){take=i+1;break;}
        pending=[{...textOnly,end:offset+take}];await flush();offset+=take;
      }
      // At most two originals per row: preserve their aspect ratios and readable
      // captions instead of shrinking a five-image end group into thumbnails.
      for(let i=usedImages;i<images.length;i+=2){
        const fragment:Fragment={block,start:chars.length,end:chars.length,images:images.slice(i,i+2)};
        if(!await fits([...pending,fragment]))await flush();
        if(!await fits([...pending,fragment]))throw new AppError('VISUAL_OVERFLOW','段落原图无法完整排版，请拆分作品。',422);
        pending.push(fragment);
      }
    }
    await flush(true);
    // A legacy document with no text blocks still retains all original images.
    if(!endAnchor)for(let i=0;i<endImages.length;i+=2){const ids=endImages.slice(i,i+2);await setContent(page,`<div class="eyebrow">产品配图</div>${figures(ids)}`);await capture('image',ids,[]);}
    }
    signal.throwIfAborted();await options.beforeReturn?.();signal.throwIfAborted();
    const manifest:VisualManifest={format:'wuyan-visual-bundle-v1',runId:doc.runId,version:doc.version,platform:doc.platform,title:doc.title,draft:doc.draft,engine:doc.engine,createdAt:new Date().toISOString(),pages:manifestPages,originals,content:structuredClone(doc),notes:['图片采用来源原始字节排版，未重绘产品外观。','所有正文及适用条件完整分页，范围按Unicode码点计数。','发布前请整组审阅适用条件、型号及素材使用权限；本包不是官方授权凭证。',...(doc.draft?['待审草稿；规则预览不等于模型创作或发布核验通过。']:[])]};
    const gallery=`<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none';img-src 'self';style-src 'unsafe-inline'"><title>${e(doc.title)}</title><style>body{background:#eef0e8;color:#253e34;font:16px/1.8 system-ui;margin:32px auto;max-width:900px}img{display:block;max-width:100%;margin:24px auto}p{padding:12px}</style><h1>${e(doc.title)}</h1><p>${doc.draft?'待审草稿 · 请完整审阅后再发布':'图文作品 · 发布前请完整审阅适用条件'}</p>${pages.map(p=>`<img src="${p.filename}" alt="${p.filename}">`).join('')}</html>`;
    const files:Record<string,Uint8Array>={'manifest.json':strToU8(JSON.stringify(manifest,null,2)),'index.html':strToU8(gallery),'README.txt':strToU8(['物有言 · 图文作品包',doc.draft?'状态：待审草稿':'状态：原稿自动核验通过，发布前请人工复核','PNG请按文件编号顺序阅读和使用。请保留适用条件页，避免分离条件后传播。','manifest.json含型号、事实引用、来源及原图/成品校验值。',...manifest.notes].join('\n'))};
    for(const item of pages)files[item.filename]=item.body;
    // PNG already compressed; level 0 avoids synchronous expensive recompression.
    const zip=Buffer.from(zipSync(files,{level:0}));signal.throwIfAborted();return {zip,manifest,pages};
  }catch(error){signal.throwIfAborted();throw error;}finally{signal.removeEventListener('abort',close);await browser?.close().catch(()=>undefined);}
}
