# 物有言 · 华为门店营销创作工作台

一句话整理需求，选择创作方向，生成带产品依据的图文，再编辑、核验和导出。支持小红书、微信公众号、朋友圈和门店海报。

[在线体验](https://modelscope.cn/studios/jixie1111/zhixu-huawei-pc-demo) · [GitHub 源码](https://github.com/jixie1111/zhixu-huawei-pc-agent) · [作品说明书](docs/作品说明书.pdf)

## 两种运行方式

| | 公开在线体验 | 本机完整版 |
| --- | --- | --- |
| 首页 | 新版创意导演，一句话输入、型号卡片、三种写法 | 同一新版首页 |
| 创作 | 浏览器内的预设规则，不调用大模型 | 真实模型理解、策划、创作，另可选规则体验 |
| 产品资料 | 经核对的少量官网摘要、同型号官网图片链接 | 用户有权使用的本地知识库；可选 ima |
| 修改与交付 | 编辑、核验、版本、精简、平台转换，Markdown / HTML / JSON | 另有模型改写、多平台内容包、PNG 图文包与限定手机平板生态 |
| 保存 | 当前浏览器最近 20 条作品 | 本机 SQLite |
| 配置 | 打开即用，无需密钥 | 服务端配置模型与授权资料 |

公开版默认进入创意导演，经典表单保留为次级入口。公开页面按实际发布资料显示数量；本机专属的人设、生态和模型功能不展示为可用按钮。静态体验中的“规则”标记、来源和人工复核提醒会随作品保留。

作品说明书介绍本机完整版。上传源码不等于开放本机知识库；本机模型地址也不是云端推理服务。

## 本地启动

需要 Node.js 22.13+（22.x）及 npm。

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

默认地址为 `http://127.0.0.1:3000`。生产运行：

```powershell
npm run build
npm start
```

将获授权的资料放入 `private/knowledge/`，保留产品事实与图片索引原有目录结构，再运行 `npm run knowledge:inspect`。也可通过 `KNOWLEDGE_DIR` 指定私有目录。

创意导演在本机默认选择模型创作。配置 `LLM_BASE_URL`、`LLM_MODEL`、`LLM_API_KEY` 后使用；只体验规则时选择“规则体验”。ima 是独立可选来源，按 [部署指南](docs/DEPLOYMENT.md) 配置。

## 构建公开网页

```powershell
npm run build:demo
npm run preview:demo
```

在 `http://127.0.0.1:4174` 查看实际静态构建。构建使用 `VITE_PUBLIC_DEMO=true`，输出到 `dist-demo/`，并生成经过凭据扫描的 `output/static-demo-<时间>/`。将后者作为静态站点根目录发布，入口为 `index.html`。脚本只打包，不自动上传。

官网图片需要网络。HTML 导出尝试内嵌图片，失败时标记缺图；不以其他型号图片替代。

## 检查与打包

```powershell
npm run check
npm run build:demo
npx playwright test --config tests/e2e/demo.config.ts
npm run test:e2e
npm run package:preview
```

静态浏览器测试运行实际 `dist-demo`，覆盖新版导演首页及经典入口。完整本机浏览器测试使用合成资料，不调用真实付费模型。真实模型验收另行显式执行，见 [验收说明](docs/ACCEPTANCE.md) 和 [测试记录](docs/TEST-REPORT.md)。

`package:preview` 仅收集自研源码、测试、提示词与当前文档，附 SHA-256 清单；不包括私有资料、原图、数据库、密钥和开发输出。已检查的作品说明书 PDF 单独附入发布仓库。

## 目录

```text
src/       React 工作台与公开体验适配
shared/    数据类型、场景/平台规则、共享导演规则
server/    本机需求理解、检索、模型创作、核验与持久化
prompts/   模型系统提示词
tests/     单元、接口与浏览器验证
scripts/   构建、资料检查、安装、导出与打包工具
docs/      产品说明、设计、部署、安全与验收
private/   本机私有资料和记录，不公开
```

[系统设计](docs/ARCHITECTURE.md) · [部署指南](docs/DEPLOYMENT.md) · [安全边界](docs/SECURITY.md) · [资料政策](docs/SOURCE-POLICY.md)

历史初赛草稿、重复进度文档及一次性改版脚本已移出当前源码；历史提交仍可恢复。经典表单、生态创作、离线工具和回归测试仍有用途，继续保留。

核验辅助发现风险，不保证覆盖所有事实或营销问题，也不授予素材使用许可。价格、活动、配置与兼容条件应在发布前人工确认。Huawei、华为、ima 等名称仅用于说明产品或接入对象，不代表官方背书；素材权利归原权利人。本仓库尚未选择开源许可证。
