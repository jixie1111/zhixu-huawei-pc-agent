import test from 'node:test';
import assert from 'node:assert/strict';
import { ImaAdapter } from '../server/ima';

test('明确当日额度错误返回429并阻止重复请求，改密钥不能绕过同账号冷却',async t=>{
  let now=Date.now(),calls=0;
  t.mock.method(Date,'now',()=>now);
  let credentials={clientId:'quota-client',imaKey:'quota-key',kbName:'合成库'};
  const adapter=new ImaAdapter({credentials:()=>credentials,call:async()=>{calls++;return {code:20010,msg:'资料获取次数已达上限，请明天再尝试',data:{}};}});
  await assert.rejects(()=>adapter.connect(),{code:'IMA_QUOTA',status:429});
  await assert.rejects(()=>adapter.connect(),{code:'IMA_QUOTA',status:429});
  credentials={...credentials,imaKey:'rotated-test-key'};
  await assert.rejects(()=>adapter.connect(),{code:'IMA_QUOTA'});
  assert.equal(calls,1);
  now+=24*60*60*1000+1;
  await assert.rejects(()=>adapter.connect(),{code:'IMA_QUOTA'});
  assert.equal(calls,2,'保守24小时冷却后才允许一次由用户触发的新请求，不承诺供应商已恢复');
});
