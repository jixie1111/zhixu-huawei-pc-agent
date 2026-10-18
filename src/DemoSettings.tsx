import { BookOpen, Check, ShieldCheck, Sparkles } from 'lucide-react';
import { Notice, SafeLink } from './components';
import { demoStorageStatus } from './demo-adapter';

export default function DemoSettings() {
  return <><div className="page-heading"><div><span className="section-kicker">READY TO EXPLORE</span><h1>打开就能创作，无需配置密钥。</h1><p>当前是公开官网资料驱动的规则演示，计算与记录都在你的浏览器里。</p></div><Sparkles size={31} /></div>
    <div className="settings-status-strip"><span className="connection-orb online"><Check size={23} /></span><div><h3>无需 API · 规则演示已就绪</h3><p>可以生成图文、切换平台、精简或编辑正文、查看来源、核验并导出。不会发送任何生成请求到后端。</p></div></div>
    <div className="settings-grid"><section className="card settings-card"><div className="card-heading"><BookOpen size={20} /><h2>清楚的资料边界</h2></div><p className="demo-body">演示资料是从华为公开官网核实的少量事实摘录，图片直接引用官方远程地址；这里没有私有 ZIP 原始知识库、账号资料或本机作品。</p><div className="demo-links"><SafeLink url="https://consumer.huawei.com/cn/laptops/">华为电脑官网</SafeLink><SafeLink url="https://www.vmall.com/">华为商城</SafeLink></div><Notice>图片需联网加载。导出 HTML 时若官方图片不允许跨域嵌入，会明确标记缺图，不会伪装完整。</Notice></section>
    <section className="card settings-card"><div className="card-heading"><ShieldCheck size={20} /><h2>仅属于这个浏览器</h2></div><p className="demo-body">最多保留最近 20 条示例记录，总体积不超过 1.5 MB。记录不会上传服务器，也不会读取本机完整版的私人历史；清除站点数据会删除这些记录。</p><Notice type={demoStorageStatus() ? 'info' : 'warning'}>{demoStorageStatus() ? '刷新页面后可继续查看本浏览器已保存的示例。共享设备上请不要输入私人或敏感信息。' : '当前浏览器不允许持久化存储。本次页面内仍可创作，请及时导出，刷新后可能无法恢复。'}</Notice><p className="demo-body">真实模型创作与 ima 接入由本机完整版提供。公开演示不接收 API Key，也不把规则生成标记成模型结果。</p></section></div>
    <div className="demo-links"><SafeLink url="https://github.com/jixie1111/zhixu-huawei-pc-agent">查看 GitHub 源码</SafeLink></div>
    <button className="button primary" onClick={() => { location.hash = 'studio'; window.scrollTo({ top: 0, behavior: 'smooth' }); }}>开始免 API 创作 <Sparkles size={16} /></button>
  </>;
}
