import test from 'node:test';
import assert from 'node:assert/strict';
import { auditArticle, scanCompliance } from '../server/audit';
import { buildStrategy, composeLocal } from '../server/agent';
import { brief, evidence, fact, productImage } from './fixtures';

test('拦截绝对化、虚假承诺、价格补贴、无据对比和虚构成果', () => {
  for (const sample of ['全网第一', '这是最强电脑', '100%保证', '永不卡顿', '所有软件都兼容', '终身保修', '到手价999元', '国补立减500', '仅剩3台', '吊打竞品', '苹果电脑就是垃圾', '比竞品快50%', '本人用了两年', '实测续航20小时', '销量冠军', '荣获年度金奖', '10万用户好评']) {
    assert.ok(scanCompliance(sample).some(finding => finding.severity === 'block'), sample);
  }
});

test('合规提示中的否定语境与普通文字不会被当成营销承诺', () => {
  assert.equal(scanCompliance('不要宣传全网第一。不得承诺永不卡顿。').length, 0);
  assert.equal(scanCompliance('带上常用任务，到店核实具体配置。').length, 0);
  assert.equal(scanCompliance('第一站看资料，第二站试装包。').length,0);
  assert.equal(scanCompliance('第一位发言：照片想看，文档也要读。').length,0);
  assert.equal(scanCompliance('第一轮：计划到底写多长？第二轮再看资料。').length,0);
  for(const text of ['第一门课先看什么','第一学期的第一周','第一套复习计划的第一行','第一场小组会'])assert.equal(scanCompliance(text).length,0,text);
  for(const text of ['大学第一台电脑','停在第一栋要去的楼上','第一排座位','第一首歌','准备拍第一支校园短片','第一部作品','第一幅草图','第一印象'])assert.equal(scanCompliance(text).length,0,text);
  for(const text of ['同价位第一','全网第一台'])assert.ok(scanCompliance(text).length>0,text);
  assert.ok(scanCompliance('行业第一，最佳选择。').length>0);
  assert.equal(scanCompliance('全网第一').length, scanCompliance('全网第一').length, '连续调用不得受RegExp lastIndex影响');
});

test('普通轮次例外不放过产品首创或行业排名',()=>{
  for(const text of ['行业第一轮就领先','第一款支持该功能的电脑','全球第一','第一名的性能']){
    assert.ok(scanCompliance(text).some(f=>f.severity==='block'),text);
  }
});

test('第一篇资料为阅读顺序，带全球或行业修饰的排名仍拦截',()=>{
  assert.equal(scanCompliance('第一篇资料的标题下面有陌生概念，先弄明白第一段。').length,0);
  for(const text of ['全球第一篇产品测评','行业第一篇报告','全网第一篇宣传']){
    assert.ok(scanCompliance(text).some(finding=>finding.severity==='block'),text);
  }
});

test('引用存在不等于支持：捏造数值、错型号、未知引用均拦截', () => {
  const data = evidence();
  const article = composeLocal(brief, data, buildStrategy(brief));
  article.sections[0].text += '\n实测续航 99 小时。';
  article.sections[1].factIds = ['nonexistent'];
  data.facts.push(fact('越界事实', '128 GB', { id: 'other-model', productId: 'qa-product-b' }));
  article.sections[2].factIds = ['other-model'];
  const audit = auditArticle(article, data, brief, 'local-composer');
  assert.equal(audit.status, 'blocked'); assert.equal(audit.releaseReady, false);
  assert.ok(audit.findings.some(finding => finding.id.startsWith('quantity-')));
  assert.ok(audit.findings.some(finding => finding.id === 'ref-nonexistent'));
  assert.ok(audit.findings.some(finding => finding.id === 'ref-other-model'));
  assert.ok(audit.factChecks.some(item => item.status === 'unverified'));
});

test('标题与导语的无依据参数也必须拦截', () => {
  const data = evidence(); const article = composeLocal(brief, data, buildStrategy(brief));
  article.title = '99 英寸，超大视野'; article.lead = '配备 999 GB 内存。';
  const audit = auditArticle(article, data, brief, 'local-composer');
  assert.ok(audit.findings.filter(finding => finding.id.startsWith('quantity-global-')).length >= 2);
});

test('数值支撑必须完整匹配，不能把16GB支持成6GB或70Wh支持成70W', () => {
  const data = evidence(); const article = composeLocal(brief, data, buildStrategy(brief));
  article.sections[0] = { heading: '配置', text: '配备 6 GB 内存。', factIds: ['qa-内存'] };
  article.sections[1] = { heading: '功率', text: '支持 70 W 功率。', factIds: ['qa-电池'] };
  const audit = auditArticle(article, data, brief, 'local-composer');
  assert.ok(audit.findings.some(item => item.id.startsWith('quantity-0-')));
  assert.ok(audit.findings.some(item => item.id.startsWith('quantity-1-')));
});

test('同型号、独立图片、受控地址、编排信息与平台数量统一核验', () => {
  const data = evidence(); const article = composeLocal(brief, data, buildStrategy(brief));
  article.images[0].url = 'https://attacker.example/image.png';
  article.images[1].productId = 'other-model';
  article.images[2].position = ''; article.images[2].reason = '';
  let audit = auditArticle(article, data, brief, 'local-composer');
  assert.ok(audit.findings.filter(item => item.id.startsWith('image-model-')).length >= 2);
  assert.ok(audit.findings.some(item => item.id.startsWith('image-meta-')));
  article.images = [article.images[0], article.images[0], article.images[0]];
  audit = auditArticle(article, data, brief, 'local-composer');
  assert.ok(audit.findings.some(item => item.id === 'duplicate-images'));
  article.images = [];
  assert.ok(auditArticle(article, data, brief, 'local-composer').findings.some(item => item.id === 'image-count'));
});

test('线上模式不能夹带本地图片；海报卖点不得超三项', () => {
  const data = evidence(); const input = { ...brief, platform: 'poster' as const, mode: 'ima' as const };
  const article = composeLocal(input, data, buildStrategy(input));
  article.sections = Array.from({ length: 4 }, () => article.sections[0]);
  const audit = auditArticle(article, data, input, 'llm');
  assert.ok(audit.findings.some(item => item.id.startsWith('image-origin-')));
  assert.ok(audit.findings.some(item => item.id === 'poster-points'));
  assert.equal(audit.releaseReady, false);
});

test('图片不能靠改productId伪装同型号', () => {
  const data = evidence(); const article = composeLocal(brief, data, buildStrategy(brief));
  article.images[0].productName = '另一个相似型号';
  const audit = auditArticle(article, data, brief, 'local-composer');
  assert.ok(audit.findings.some(item => item.category === 'image' && item.severity === 'block'));
});

test('没有合法来源链接的事实不能被宣布为线上可发布证据', () => {
  const data = evidence(); const input = { ...brief, mode: 'ima' as const };
  data.facts = data.facts.map(item => ({ ...item, sourceMode: 'ima', sourceUrl: 'javascript:alert(1)' }));
  data.images = data.images.map(item => ({ ...item, sourceMode: 'ima' }));
  const article = composeLocal(input, data, buildStrategy(input));
  const audit = auditArticle(article, data, input, 'llm');
  assert.ok(audit.findings.some(item => item.category === 'source' && item.severity === 'block'));
});

test('直接构造稿的空正文与空白配图信息也阻断，不依赖输入schema',()=>{
  const data=evidence(),article=composeLocal(brief,data,buildStrategy(brief));
  article.sections=[];
  assert.ok(auditArticle(article,data,brief,'llm').findings.some(f=>f.id==='structure-sections'&&f.severity==='block'));
  article.sections=[{heading:'',text:' \n ',factIds:['qa-屏幕']}];
  article.images[0].reason='  ';article.images[0].position='  ';
  const checked=auditArticle(article,data,brief,'llm');
  assert.ok(checked.findings.some(f=>f.id==='structure-section-0'&&f.severity==='block'));
  assert.ok(checked.findings.some(f=>f.id===`image-meta-${article.images[0].id}`&&f.severity==='block'));
});
