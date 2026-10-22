import type { Article, Audit, Brief, Evidence, Finding } from '../shared/types';
import { PLATFORMS } from '../shared/rules';
import { imageSlot } from '../shared/layout';
import { articleBody, lengthFinding } from '../shared/writing-length';

const rules: {id:string;pattern:RegExp;message:string;suggestion:string}[] = [
  {id:'absolute',pattern:/(?:全网|行业|全球|宇宙|同价位)?(?:第一|唯一|最强|最好|最佳|最低|最便宜|顶级|极致性能)|百分之百|100%\s*(?:保证|安全|无故障)|零风险/g,message:'绝对化宣传或无依据排名',suggestion:'使用可验证的具体事实，删除绝对排名或保证。'},
  {id:'promise',pattern:/永不(?:卡顿|损坏|过时)|永久(?:免费|保修)|终身(?:免费|保修)|保证(?:不卡|能用|兼容|提升)|无条件(?:退款|退货)|所有软件(?:都)?(?:支持|兼容)|全(?:部|平台)兼容/g,message:'未经证实的功能或服务承诺',suggestion:'核对型号、系统、软件版本及正式服务条款，不能确认则删除。'},
  {id:'price',pattern:/(?:[¥￥]\s*\d[\d,.]*|\d[\d,.]*\s*元|(?:补贴|优惠|直降|立减|券后|到手价|最低价|库存|限量|仅剩)\s*[:：]?\s*\d[\d,.]*|(?:国补|补贴|优惠券|买一送一|半价|免息))/g,message:'价格、促销或库存缺少当前有效授权依据',suggestion:'暂停使用金额或权益，核实具体配置、时点、地区和条件后再由人工批准。'},
  {id:'comparison',pattern:/吊打|碾压|遥遥领先|完胜|秒杀(?:苹果|联想|戴尔|惠普|华硕|其他|竞品)|(?:苹果|联想|戴尔|惠普|华硕|竞品).{0,12}(?:垃圾|不行|不如|差劲)|比.{0,15}(?:强|快|好|轻)\s*\d+%/g,message:'无依据对比或贬低竞品',suggestion:'改为同配置、同任务且有来源的客观比较，不贬低其他品牌。'},
  {id:'fabrication',pattern:/(?:我|本人|亲测|实测).{0,14}(?:用了|使用了|入手|体验过|测出|续航|跑分)|销量(?:第一|冠军|突破|超)|(?:获得|荣获).{0,12}(?:大奖|金奖)|\d+\s*万(?:人|用户).{0,8}(?:好评|选择|推荐)/g,message:'疑似虚构体验、测试、销量、奖项或评价',suggestion:'删除未经授权的个人经历及统计，不把教学案例写成真实成果。'},
];
export function scanCompliance(text:string):Finding[] {
  const findings:Finding[]=[];
  for(const rule of rules) {
    rule.pattern.lastIndex=0;
    for(const match of text.matchAll(rule.pattern)) {
      if(rule.id==='absolute'&&match[0]==='第一'&&/^(?:堂|次|个|步|天|课|页|篇|段|章|站|项|张|条|眼|本|节|份|年|门|轮|回|局|场|班|组|期|学期|学年|代|季|周|月|晚|趟|笔|行|列|格|封|套|句|栋|座|层|排|首|件|份|支|部|幅|格|帧|封|批|道|题|关|间|所|辆|顿|口|声|下|遍|拍|镜|屏|印象|台(?:电脑|笔记本|手机|平板|设备)|位(?:发言|家人|同学)|阶段)/.test(text.slice((match.index||0)+2))) continue;
      const before=text.slice(Math.max(0,(match.index||0)-10),match.index);
      if(/(?:不得|禁止|不承诺|不能|不要|避免|未核实|不使用)[^。！？\n]{0,5}$/.test(before)) continue;
      findings.push({id:`${rule.id}-${match.index}`,category:'compliance',severity:'block',message:rule.message,excerpt:match[0],suggestion:rule.suggestion});
    }
  }
  return findings;
}
const norm=(s:string)=>s.normalize('NFKC').replace(/\s+/g,'').replace(/×/g,'x').toLowerCase();
const numberUnits=/(\d+(?:\.\d+)?\s*(?:GHz|MHz|GB|TB|Wh|W|kg|mm|英寸|Hz|nits|尼特|小时|%|g\b))/gi;
const quantities=(text:string)=>new Set([...text.matchAll(numberUnits)].map(m=>norm(m[0])));
export function articleText(a:Article) {return [a.title,a.lead,...a.sections.flatMap(s=>[s.heading,s.text]),a.cta,...a.tags,a.disclaimer,...a.images.flatMap(i=>[i.description,i.reason||''])].join('\n');}
export function auditArticle(article:Article,evidence:Evidence,brief:Brief,engine:'local-composer'|'llm'):Audit {
  const findings:Finding[]=scanCompliance(articleText(article));
  const lengthIssue=lengthFinding(articleBody(article),brief);
  if(lengthIssue)findings.push(lengthIssue);
  const add=(id:string,category:Finding['category'],severity:Finding['severity'],message:string,suggestion:string,excerpt?:string)=>findings.push({id,category,severity,message,suggestion,excerpt});
  for(const [field,label] of [['title','标题'],['lead','导语或海报副标题'],['cta','行动引导']] as const) {
    if(!article[field].trim())add(`structure-${field}`,'platform','block',`${label}为空，稿件结构不完整。`,`请补充${label}，再重新核验。`);
  }
  if(!article.sections.length)add('structure-sections','platform','block','正文或海报卖点为空，稿件结构不完整。','至少保留一段正文或一个有依据的卖点。');
  for(const [index,section] of article.sections.entries())if(!section.text.trim())add(`structure-section-${index}`,'platform','block','正文段落或海报卖点仅包含空白。','补充实际内容或删除空白段落。');
  const map=new Map(evidence.facts.map(f=>[f.id,f]));
  for(const fact of evidence.facts) {
    let valid=false;
    try{const u=new URL(fact.sourceUrl);valid=u.protocol==='https:'&&!u.username&&!u.password&&(u.hostname==='ima.qq.com'||u.hostname==='consumer.huawei.com'||u.hostname==='e.huawei.com'||u.hostname==='vmall.com'||u.hostname==='www.vmall.com');}catch{/* invalid source remains unverified */}
    if(!valid)add(`source-url-${fact.id}`,'source','block','事实来源链接无效或不在已核实来源域名内。','请从指定 ima 知识库重新取得可验证来源。');
    if(brief.mode==='ima'&&fact.sourceMode!=='ima')add(`fact-origin-${fact.id}`,'source','block','在线稿包含非 ima 事实来源。','重新执行 ima 检索，不得混用本地资料。');
    if(brief.mode==='local'&&fact.sourceMode!=='local')add(`fact-origin-${fact.id}`,'source','block','本地知识库稿包含其他来源模式的事实。','重新从所选本地知识库取证，保持来源一致。');
  }
  const factChecks:Audit['factChecks']=[];
  for(const [i,section] of article.sections.entries()) {
    const matched=section.factIds.map(id=>map.get(id));
    if(!section.factIds.length) add(`no-evidence-${i}`,'fact','warning','段落没有绑定事实依据。','确认这一段仅为场景建议，不包含产品功能或参数。',section.heading);
    for(const id of section.factIds) {
      const f=map.get(id); factChecks.push({factId:id,label:f?.label||'未知事实',status:f&&f.productId===brief.productId?'supported':'unverified',evidence:f?.text||'无对应来源'});
      if(!f||f.productId!==brief.productId) add(`ref-${id}`,'fact','block','事实引用不存在或与型号不一致。','重新检索当前具体型号。');
    }
    const context=quantities(matched.filter(Boolean).map(f=>f!.text).join(' '));
    for(const match of (section.heading+' '+section.text).matchAll(numberUnits)) if(!context.has(norm(match[0]))) add(`quantity-${i}-${match.index}`,'fact','block','数值或单位不在本段引用事实中。','删除无依据数值，或从正确型号重新取证。',match[0]);
  }
  const allFacts=quantities(evidence.facts.map(f=>f.text).join(' '));
  for(const match of [article.title,article.lead,article.cta].join('\n').matchAll(numberUnits)) if(!allFacts.has(norm(match[0]))) add(`quantity-global-${match.index}`,'fact','block','标题、导语或引导语包含未经证实的数值。','删除或核对原始事实。',match[0]);
  const [min,max]=PLATFORMS[brief.platform].range;
  if(article.images.length<min||article.images.length>max) add('image-count','platform','block',`平台需要 ${min}–${max} 张图片，当前为 ${article.images.length} 张。`,'补充当前型号的合规来源图片，不使用其他型号凑数。');
  if(new Set(article.images.map(i=>i.id)).size!==article.images.length) add('duplicate-images','image','block','同一张图片被重复计数。','选择不同的真实素材。');
  for(const image of article.images) {
    const original=evidence.images.find(i=>i.id===image.id);
    if(original?.editorial?.role==='screen-demo'&&imageSlot(image.position,article.sections.length)==='cover')add(`image-cover-${image.id}`,'image','block','屏幕演示画面没有产品机身，不适合作为产品封面。','从同型号已复核的整机原图中选择封面，演示画面可保留在相关正文。',image.name);
    if(!original||image.productId!==brief.productId||image.productName!==original.productName||image.url!==original.url||image.sourceMode!==original.sourceMode) add(`image-model-${image.id}`,'image','block','图片不在当前型号的来源清单内。','删除错配图片，按型号重新检索。',image.name);
    if(!image.position?.trim()||!image.reason?.trim()||!image.sourceTitle.trim()) add(`image-meta-${image.id}`,'image','block','图片缺少来源、插入位置或配图理由。','补全来源与编排信息。',image.name);
    if(image.position&&imageSlot(image.position,article.sections.length)===undefined) add(`image-position-${image.id}`,'image','warning','配图位置无法对应正文段落，暂放文末。','位置需为“封面”“第 n 段后”或“文末”，段号不能超出正文。',image.position);
    if(brief.mode==='ima'&&image.sourceMode!=='ima') add(`image-origin-${image.id}`,'source','block','在线模式存在非 ima 来源图片。','只使用本次 ima 检索得到的素材。');
    if(brief.mode==='local'&&image.sourceMode!=='local') add(`image-origin-${image.id}`,'source','block','本地知识库稿包含其他来源模式的图片。','仅采用该本地知识库中已按型号索引的原图。');
  }
  for(const conflict of evidence.product.conflicts) add(`conflict-${findings.length}`,'fact','block',conflict,'请人工核对知识库原始资料，冲突未解决前禁止发布。');
  if(brief.platform==='poster'&&article.sections.length>3) add('poster-points','platform','block','海报超过三个卖点。','删减至最多三个卖点。');
  if(brief.platform==='xiaohongshu'&&!article.tags.length) add('tags','platform','warning','小红书内容没有话题标签。','补充与场景有关的话题。');
  if(brief.mode==='local') add('offline-source','source',engine==='llm'?'info':'warning',engine==='llm'?'资料与原图来自本地知识库，内容由模型生成。':'这是本地知识库的规则预览稿。','保留本地来源与原始资料链接；不标记为 ima 在线取证。公开展示仍需素材许可。');
  if(engine==='local-composer') add('offline-engine','source','warning','当前由本地规则编排器生成，不是大模型生成。','配置模型服务并选择 AI 模型创作，完成真实生成与独立核验。');
  if(engine==='llm') add('semantic-review','fact','warning','逐句语义核验尚未完成。','执行独立的模型核验；规则核验不能证明所有语义事实。');
  const blocks=findings.some(f=>f.severity==='block');
  return {status:blocks?'blocked':findings.some(f=>f.severity==='warning')?'review':'passed',findings,factChecks:[...new Map(factChecks.map(f=>[f.factId,f])).values()],checkedAt:new Date().toISOString(),releaseReady:false};
}
