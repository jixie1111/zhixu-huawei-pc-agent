import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewedImage,coverPreference,imageDescription } from '../server/image-editorial';
import { auditArticle } from '../server/audit';
import { scanCompliance } from '../server/audit';
import { composeLocal,buildStrategy } from '../shared/local-composer';
import { evidence,brief,syntheticPng } from './fixtures';

test('原图用途注释不靠文件名或传入metadata放行，字节不符保持未复核',()=>{
  const image=evidence().images[0];
  assert.equal(reviewedImage({...image,productId:'2e36efc687651401'},syntheticPng),undefined);
  const base={...image,editorial:{role:'product-view' as const,note:'测试',basis:'visual-review' as const,sha256:'fake',reviewedAt:'2026-10-19'}};
  assert.ok(coverPreference(base)>coverPreference({...base,editorial:{...base.editorial,role:'screen-demo'}}));
});

test('已复核的中性构图标签与原索引名称分别保留，未知素材不猜画面',()=>{
  const editorial={role:'detail' as const,caption:'屏幕与键盘局部',note:'仅构图，不证明舒适度',basis:'visual-review' as const,sha256:'fixture',reviewedAt:'2026-10-19'};
  assert.deepEqual(imageDescription('舒适键盘细节',editorial),{description:'屏幕与键盘局部',sourceDescription:'舒适键盘细节'});
  assert.deepEqual(imageDescription('来源原名',undefined),{description:'来源原名'});
});
test('依据清单标为屏幕演示的图片不能成为产品封面，正文保留不受阻断',()=>{
  const ev=evidence(),article=composeLocal(brief,ev,buildStrategy(brief));
  const image=article.images[0];
  ev.images.find(i=>i.id===image.id)!.editorial={role:'screen-demo',note:'测试画面',basis:'visual-review',sha256:'test',reviewedAt:'2026-10-19'};
  image.position='封面';assert.ok(auditArticle(article,ev,brief,'llm').findings.some(f=>f.id===`image-cover-${image.id}`&&f.severity==='block'));
  image.position='第 1 段后';assert.ok(!auditArticle(article,ev,brief,'llm').findings.some(f=>f.id===`image-cover-${image.id}`));
});
test('第一项任务、第一张资料是叙事顺序，排名和首创宣称仍核验',()=>{
  assert.equal(scanCompliance('第一项任务，读第一章，拿出第一份资料。第一眼先看屏幕。').length,0);
  assert.ok(scanCompliance('行业第一款旗舰，行业第一。').length>0);
});
