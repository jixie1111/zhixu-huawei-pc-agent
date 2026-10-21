import test from 'node:test';
import assert from 'node:assert/strict';
import { clearSession, configure, safeError, secrets, settings, validateLlmUrl } from '../server/config';
import { PLATFORMS, SCENES } from '../shared/rules';

test('模型连接仅允许已列出的官方 HTTPS 域名', () => {
  assert.equal(validateLlmUrl('https://api.siliconflow.cn/v1/'), 'https://api.siliconflow.cn/v1');
  for (const url of ['http://api.siliconflow.cn/v1', 'https://127.0.0.1/v1', 'https://api.siliconflow.cn.evil.test/v1', 'https://user:secret@api.siliconflow.cn/v1', 'https://api.siliconflow.cn:8443/v1', 'file:///etc/passwd', 'https://169.254.169.254/latest/meta-data']) {
    assert.throws(() => validateLlmUrl(url), url);
  }
});

test('状态接口不返回凭证；错误脱敏；退出清除会话凭证', () => {
  clearSession();
  const state = configure({ clientId: 'qa-client-identity-only', imaKey: 'qa-ima-secret-only', llmKey: 'qa-llm-secret-only', llmModel: 'qa-model', llmBaseUrl: 'https://api.siliconflow.cn/v1' });
  assert.equal(state.imaConfigured, true); assert.equal(state.llmConfigured, true);
  const publicJson = JSON.stringify(settings());
  for (const secret of ['qa-client-identity-only', 'qa-ima-secret-only', 'qa-llm-secret-only']) assert.ok(!publicJson.includes(secret));
  const message = safeError(new Error('qa-client-identity-only qa-ima-secret-only qa-llm-secret-only Bearer temporary-token sk-test-secret'));
  assert.ok(!message.includes('temporary-token')); assert.ok(!message.includes('sk-test-secret'));
  assert.ok(!message.includes('qa-ima-secret-only')); assert.ok(message.includes('已脱敏'));
  clearSession();
  assert.equal(settings().connected, false);
});

test('配置拒绝未知字段，阻止修改未公开的服务器选项', () => {
  assert.throws(() => configure({ adminToken: 'test' }));
  assert.throws(() => configure({ llmBaseUrl: 'https://attacker.example/v1' }));
  assert.throws(() => configure({ localEndpoint:'http://localhost:55460/v1' }));
});

test('推理强度可在本机会话覆盖环境；无效档位拒绝且清除后恢复环境', t => {
  const previous=process.env.LLM_REASONING_EFFORT;
  process.env.LLM_REASONING_EFFORT='high';clearSession();
  t.after(()=>{clearSession();if(previous===undefined)delete process.env.LLM_REASONING_EFFORT;else process.env.LLM_REASONING_EFFORT=previous;});
  assert.equal(settings().llmReasoningEffort,'high');
  assert.equal(configure({llmReasoningEffort:'low'}).llmReasoningEffort,'low');
  assert.equal(configure({llmReasoningEffort:undefined}).llmReasoningEffort,'low');
  assert.equal(secrets().llmReasoningEffort,'low');
  for(const value of ['light','none','minimal','unlimited'])assert.throws(()=>configure({llmReasoningEffort:value}));
  assert.equal(secrets().llmReasoningEffort,'low','a rejected setting must not mutate the current profile');
  assert.equal(configure({llmReasoningEffort:''}).llmReasoningEffort,'');
  clearSession();assert.equal(secrets().llmReasoningEffort,'high');
});

test('本地模型只允许环境授权的精确回环端点，公开部署及地址变体拒绝',()=>{
  const approved='http://localhost:55460/v1';
  assert.equal(validateLlmUrl(approved,approved,false),'http://127.0.0.1:55460/v1');
  assert.equal(validateLlmUrl(approved+'/',approved,false),'http://127.0.0.1:55460/v1');
  for(const url of [approved,approved+'/../admin',approved+'?x=1',approved+'#x','http://localhost:55461/v1','http://127.1:55460/v1','http://2130706433:55460/v1','http://localhost.evil.test:55460/v1','http://user:secret@localhost:55460/v1','http://192.168.1.1:55460/v1']) {
    assert.throws(()=>validateLlmUrl(url,approved,true));
    if(url!==approved)assert.throws(()=>validateLlmUrl(url,approved,false));
  }
  assert.throws(()=>validateLlmUrl(approved,'',false));
  assert.throws(()=>validateLlmUrl('http://192.168.1.1:55460/v1','http://192.168.1.1:55460/v1',false));
});

test('提供八场景四平台，各平台图片数与要求一致', () => {
  assert.equal(Object.keys(SCENES).length, 8); assert.equal(Object.keys(PLATFORMS).length, 4);
  assert.deepEqual(PLATFORMS.xiaohongshu.range, [3, 6]);
  assert.deepEqual(PLATFORMS.wechat.range, [2, 4]);
  assert.deepEqual(PLATFORMS.moments.range, [1, 3]);
  assert.deepEqual(PLATFORMS.poster.range, [1, 1]);
  for (const scene of Object.values(SCENES)) assert.ok(scene.audience && scene.problem && scene.priorities.length);
});
