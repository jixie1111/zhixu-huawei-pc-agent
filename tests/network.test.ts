import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublicAddress, publicSourceUrl, safeDownload, validateMediaUrl } from '../server/network';

test('媒体下载域名/协议边界与公开来源去签名', () => {
  for (const url of ['https://ima.qq.com/a.md', 'https://bucket.cos.ap-guangzhou.myqcloud.com/a.png', 'https://res.vmallres.com/a.webp', 'https://consumer.huawei.com/cn/laptops/a/']) assert.equal(validateMediaUrl(url).protocol, 'https:');
  for (const url of ['http://ima.qq.com/a', 'https://ima.qq.com.evil.example/a', 'https://127.0.0.1/a', 'https://user:pass@ima.qq.com/a', 'https://ima.qq.com:444/a', 'file:///C:/secrets', 'javascript:alert(1)', 'https://169.254.169.254/latest']) assert.throws(() => validateMediaUrl(url), url);
  assert.equal(publicSourceUrl('https://consumer.huawei.com/cn/laptops/a/?secret=123#private'), 'https://consumer.huawei.com/cn/laptops/a/');
  assert.equal(publicSourceUrl('https://bucket.cos.ap-guangzhou.myqcloud.com/a?signature=secret'), '');
  assert.equal(publicSourceUrl('javascript:alert(1)'), '');
});

test('拒绝内网、链路本地、保留和过渡地址，只接受公开网络', () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '192.168.0.1', '172.16.1.1', '169.254.169.254', '100.64.1.1', '0.0.0.0', '224.1.2.3', '198.18.0.1', '203.0.113.2', '::1', '::ffff:127.0.0.1', 'fe80::1', 'fc00::1', '2001:db8::1', '2002:7f00:1::']) assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress('8.8.8.8'), true);
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
});

test('下载拒绝重定向、压缩、过大内容、HTML登录页与伪图片', async () => {
  const url = 'https://fixture.cos.ap-guangzhou.myqcloud.com/file.md';
  const cases: [Response, string][] = [
    [new Response('', { status: 302, headers: { location: 'http://127.0.0.1' } }), 'IMA_REDIRECT'],
    [new Response('text', { headers: { 'content-encoding': 'gzip', 'content-type': 'text/plain' } }), 'IMA_ENCODING'],
    [new Response('x', { headers: { 'content-length': '99999999', 'content-type': 'text/plain' } }), 'IMA_DOWNLOAD_LIMIT'],
    [new Response('<html>Sign in</html>', { headers: { 'content-type': 'text/plain' } }), 'IMA_TEXT_ENCODING'],
    [new Response('<script>alert(1)</script>', { headers: { 'content-type': 'text/html' } }), 'IMA_TEXT_TYPE'],
  ];
  for (const [response, code] of cases) await assert.rejects(() => safeDownload(url, { kind: 'text', fetch: async () => response }), { code });
  await assert.rejects(() => safeDownload(url, { kind: 'text', maxBytes: 2, fetch: async () => new Response('large', { headers: { 'content-type': 'text/plain' } }) }), { code: 'IMA_DOWNLOAD_LIMIT' });
  await assert.rejects(() => safeDownload(url.replace('.md', '.png'), { kind: 'image', fetch: async () => new Response('not an image', { headers: { 'content-type': 'image/png' } }) }), { code: 'IMA_IMAGE_TYPE' });
});

test('下载仅转发安全访问头，且强制不跟随重定向', async () => {
  const url = 'https://fixture.cos.ap-guangzhou.myqcloud.com/file.md';
  const invalidHeaders: Record<string, string>[] = [{ Host: 'attacker.example' }, { Cookie: 'secret=1' }, { Authorization: 'Bearer a\r\nX-Hack: yes' }, { 'ima-openapi-apikey': 'secret' }];
  for (const headers of invalidHeaders) {
    await assert.rejects(() => safeDownload(url, { kind: 'text', headers, fetch: async () => new Response('test') }), { code: 'IMA_HEADERS' });
  }
  const result = await safeDownload(url, { kind: 'text', headers: { Authorization: 'Bearer scoped-only' }, fetch: async (_, init) => {
    assert.equal(init?.redirect, 'manual'); assert.ok(init?.signal);
    assert.equal((init?.headers as Record<string, string>).authorization, 'Bearer scoped-only');
    return new Response('# fixture', { headers: { 'content-type': 'text/markdown' } });
  } });
  assert.equal(result.body.toString(), '# fixture');
});
