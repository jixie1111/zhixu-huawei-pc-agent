import type { Run } from '../shared/types';
import { SCENES, PLATFORMS } from '../shared/rules';
import { planImagePlacement } from '../shared/layout';

export const escapeHtml=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const safeLink=(url:string)=>{try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password?u.toString():'';}catch{return '';}};
export function toMarkdown(run:Run):string {
  const {brief:b,article:a,evidence:e,audit:v,strategy:s}=run;
  const state=v.releaseReady?'已通过自动核验，发布前仍需人工审阅':'未验收草稿 · 不用于正式发布或在线接入证明';
  return [
    `# ${a.title}`,`> 物有言 · ${state}\n> 来源：${b.mode==='ima'?'ima 在线检索':'本地 ZIP 快照'}｜引擎：${run.engine==='llm'?run.model:'本地规则编排'}｜版本 ${run.version}`,
    '## 一、场景判断',`- 目标人群：${b.audience}\n- 使用场景：${SCENES[b.scene].name}\n- 用户问题：${s.problem}\n- 购买阶段：${b.stage}\n- 内容目标：${b.goal}\n- 平台：${PLATFORMS[b.platform].name}\n- 切入策略：${s.angle}\n- 策略解释：${s.rationale}`,
    '## 二、知识库依据',`产品型号：${e.product.name}`,
    ...e.facts.map(f=>`### ${f.label}\n\n${f.text}\n\n资料：${f.sourceTitle}\n来源：${safeLink(f.sourceUrl)||'待确认'}\n取证时间：${f.retrievedAt}`),
    '## 三、图文软文',`### ${a.title}`,a.lead,...a.sections.map(p=>`### ${p.heading}\n\n${p.text}`),a.cta,a.tags.map(t=>`#${t}`).join(' '),a.disclaimer,
    '### 图片编排',...a.images.map((image,i)=>`${i+1}. ${image.name}\n   - 型号：${image.productName}\n   - 来源：${image.sourceTitle}（${image.sourceMode==='ima'?'ima':'本地快照'}）\n   - 来源页面：${safeLink(image.sourceUrl)||'查看 ima 原始资料'}\n   - 插入位置：${image.position}\n   - 图片说明：${image.description}\n   - 配图理由：${image.reason}`),
    '## 四、核验结果',`状态：${v.status==='blocked'?'已拦截':v.status==='review'?'待复核':'自动核验通过'}\n逐项事实检查：${v.factChecks.length} 项\n检查时间：${v.checkedAt}`,
    ...v.findings.map(f=>`- [${f.severity==='block'?'拦截':f.severity==='warning'?'待复核':'提示'}] ${f.message}${f.excerpt?`（${f.excerpt}）`:''}；建议：${f.suggestion}`),
    '### 流程记录',...run.trace.map(t=>`- ${t.at}｜${t.action}：${t.detail}`),
  ].join('\n\n');
}
export function toHtml(run:Run,imageData:Map<string,string>=new Map()):string {
  const a=run.article,e=escapeHtml;
  const layout=planImagePlacement(a.images,a.sections.length);
  const embedded=(id:string)=>/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(imageData.get(id)||'');
  const missing=a.images.filter(image=>!embedded(image.id)).length;
  const figure=(image:typeof a.images[number])=>`<figure>${embedded(image.id)?`<img src="${imageData.get(image.id)}" alt="${e(image.description)}">`:`<div class="unavailable">图片未嵌入，请在工作台核对原始素材：${e(image.name)}</div>`}<figcaption>${e(image.description)} · ${e(image.position||'文末')}<br>来源：${e(image.sourceTitle)}<br>${e(image.reason||'')}</figcaption></figure>`;
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<title>${e(a.title)}</title><style>
body{font:16px/1.9 system-ui,'Microsoft YaHei',sans-serif;color:#263b33;background:#f4f2eb;margin:0}
main{max-width:820px;margin:40px auto;padding:64px;background:#fff;border-radius:20px;overflow-wrap:anywhere}
h1{font-size:32px;line-height:1.5}h2{font-size:22px;margin-top:36px}.brand{letter-spacing:3px;font-size:13px;color:#416452}
.notice{padding:14px;background:#f7edda;border-radius:10px;font-size:14px}p{white-space:pre-wrap}figure{margin:30px 0}
img{width:100%;max-height:560px;object-fit:contain;background:#f4f3ef;border-radius:16px}figcaption,footer{font-size:12px;color:#69796e}
pre{white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.8 system-ui}details{border-top:1px solid #ddd;padding-top:24px}.unavailable{padding:30px;background:#f4f2eb}
@media(max-width:600px){main{margin:0;padding:24px;border-radius:0}}
</style></head><body><main>
<div class="brand">物有言 / WUYAN · ${e(PLATFORMS[run.brief.platform].name)}</div>
<p class="notice">${run.audit.releaseReady&&!missing?'自动核验通过，发布前请人工审阅。':'未验收草稿，不用于正式发布或在线接入证明。'} ${run.brief.mode==='local'?'本地知识库。':'ima 在线检索。'} ${run.engine==='llm'?'模型生成。':'本地规则编排。'}${missing?` ${missing} 张图片尚未成功嵌入，本导出不完整。`:''}</p>
<h1>${e(a.title)}</h1><p>${e(a.lead)}</p>${layout.cover.map(figure).join('')}
${a.sections.map((s,i)=>`<section><h2>${e(s.heading)}</h2><p>${e(s.text)}</p>${layout.after[i].map(figure).join('')}</section>`).join('')}
${layout.end.map(figure).join('')}${a.cta?`<p>${e(a.cta)}</p>`:""}<p>${e(a.tags.map(t=>t.startsWith('#')?t:'#'+t).join(' '))}</p>
<footer>${e(a.disclaimer)}</footer><details><summary>完整场景、事实依据、图片来源与核验记录</summary><pre>${e(toMarkdown(run))}</pre></details>
</main></body></html>`;
}
