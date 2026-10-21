/** Explicit, bounded local acquisition. No scraping arbitrary user URLs, no publication.
 * Originals and hashes are retained in a new directory; existing archives are never overwritten.
 * Usage: npx tsx scripts/import-official-ecosystem.ts --import
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';
import { privateDir, publicDeployment } from '../server/config';
import { extractFacts } from '../server/knowledge';
import { imageType } from '../server/network';

const products=[
  {name:'HUAWEI Pura 80',slug:'pura80',kind:'phones'},
  {name:'HUAWEI MatePad 11.5 2026',slug:'matepad-11-5-2026',kind:'tablets'},
];
const hash=(data:string|Buffer)=>createHash('sha256').update(data).digest('hex');
const csv=(value:string)=>`"${value.replaceAll('"','""')}"`;
async function fetchOfficial(url:string,max:number) {
  const target=new URL(url);
  if(target.origin!=='https://consumer.huawei.com')throw new Error('Unexpected source');
  const response=await fetch(target,{redirect:'error',signal:AbortSignal.timeout(45000)});
  if(!response.ok)throw new Error(`Official source HTTP ${response.status}`);
  const chunks:Uint8Array[]=[];let length=0;
  const reader=response.body!.getReader();
  try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>max){await reader.cancel();throw new Error('Source too large');}chunks.push(value);}}finally{reader.releaseLock();}
  return Buffer.concat(chunks);
}
async function main(){
  if(publicDeployment||!process.argv.includes('--import'))throw new Error('Local explicit --import required');
  const destination=path.join(privateDir,'knowledge','official-ecosystem-2026-10');
  // Refuse to overwrite either a prior reviewed snapshot or an interrupted run.
  await fs.mkdir(destination,{recursive:false});
  const browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
  try{
    const context=await browser.newContext({javaScriptEnabled:false});
    await context.route('**/*',route=>route.abort());
    const page=await context.newPage();
    for(const product of products){
      const url=`https://consumer.huawei.com/cn/${product.kind}/${product.slug}/specs/`;
      const html=await fetchOfficial(url,5_000_000);
      await page.setContent(html.toString('utf8'),{waitUntil:'domcontentloaded'});
      const sections=await page.locator('.large-accordion__item').evaluateAll(elements=>elements.map(element=>{
        const content=element.querySelector('.large-accordion__content')?.cloneNode(true) as HTMLElement|undefined;
        content?.querySelectorAll('script,style').forEach(e=>e.remove());
        return {label:element.querySelector('.large-accordion__title')?.textContent?.trim()||'',text:content?.textContent?.replace(/\s+/g,' ').trim()||''};
      }));
      if(!sections.some(s=>s.label==='操作系统')||!sections.some(s=>s.label==='屏幕'))throw new Error('Specification structure changed');
      const markdown=`# ${product.name} - 产品事实\n\n来源：${url}\n\n`+sections.map(s=>`## ${s.label}\n\n${s.text}\n`).join('\n');
      if(extractFacts(markdown,'validation',product.name,'local').length<8)throw new Error('Insufficient factual sections');
      const directory=path.join(destination,product.slug);await fs.mkdir(directory);
      await fs.writeFile(path.join(directory,'source-specs.html'),html,{flag:'wx'});
      await fs.writeFile(path.join(directory,'产品事实.md'),markdown,{flag:'wx'});
      const candidates=await page.locator('img').evaluateAll(elements=>elements.map(img=>({src:img.getAttribute('src')||'',alt:img.getAttribute('alt')||''})));
      const selected=[...new Map(candidates.filter(i=>i.src.startsWith(`/content/dam/huawei-cbg-site/cn/mkt/pdp/${product.kind}/${product.slug}/specs/`)&&i.src.endsWith('.png')).map(i=>[i.src,i])).values()];
      if(selected.length<3||selected.length>10)throw new Error('Review changed original-image inventory');
      const images=[];
      for(const item of selected){
        const source=new URL(item.src,url).href,body=await fetchOfficial(source,7_999_999);
        if(imageType(body)!=='image/png')throw new Error('Original image signature failed');
        const filename=path.basename(new URL(source).pathname);
        await fs.writeFile(path.join(directory,filename),body,{flag:'wx'});
        // PNG IHDR stores dimensions at fixed offsets; decoding is not needed.
        images.push({filename,description:`${product.name} 官方规格页配色图：${item.alt}；外观示意，以实物为准。`,source,width:body.readUInt32BE(16),height:body.readUInt32BE(20),sha256:hash(body)});
      }
      const rows=[['文件名','产品型号','来源页面','官网图片说明','宽度','高度'],...images.map(i=>[i.filename,product.name,url,i.description,String(i.width),String(i.height)])];
      await fs.writeFile(path.join(directory,'图片索引.csv'),rows.map(row=>row.map(csv).join(',')).join('\n'),{flag:'wx'});
      await fs.writeFile(path.join(directory,'provenance.json'),JSON.stringify({product:product.name,sourceUrl:url,retrievedAt:new Date().toISOString(),sha256:hash(html),scope:'中国大陆官方规格页；保留全部规格限定。不同配置不能混合为一个具体SKU。',rights:'仅本地研发及来源核对。官方公开页面不等于获得素材再分发许可。',images},null,2),{flag:'wx'});
      console.log(`${product.name}: ${extractFacts(markdown,'validation',product.name,'local').length} fact groups, ${images.length} original images imported locally`);
    }
  }finally{await browser.close();}
}
await main();
