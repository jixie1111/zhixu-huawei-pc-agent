# 物有言 · 华为门店营销创作工作台

一句话整理需求，选择创作方向，生成带产品依据的图文，再编辑、核验和导出。支持小红书、微信公众号、朋友圈与门店海报。

[在线体验](https://modelscope.cn/studios/jixie1111/zhixu-huawei-pc-demo) · [GitHub 源码](https://github.com/jixie1111/zhixu-huawei-pc-agent) · [作品说明书](docs/作品说明书.pdf)

## 最新展示案例

当前展示四款产品的案例：[MateBook 14 鸿蒙版 · 小红书576字](docs/examples/matebook-harmony-school.md)、[MatePad 11.5 2026 · 小红书578字](docs/examples/matepad-weekend.md)、[MateBook Pro · 公众号985字](docs/examples/matebook-pro-work.md)、[Pura 80 · 朋友圈181字](docs/examples/pura80-photo.md)。实际模型初稿经逐篇文字编辑与独立复核；完整图文与依据可在工作台“作品记录”查看。[案例合集](docs/SHOWCASE.md)同时展示一条正文与产品依据的对应关系。

默认正文篇幅：小红书 500–900 字，公众号 800–1200 字，朋友圈 120–260 字，海报 80–180 字。只统计导语、各段正文与行动引导的非空白字符，含标点。生成后实际计数，必要时整理一次篇幅；出现明显套话、反复防御转折或逐段试机邀请时，再尝试一次有界语言整理，随后执行独立事实核验。仍未达标的稿件提示复核。明确要求“精简正文”时按原稿缩短。

写作规则按主题选择参数、减少文章推进旁白，并让结尾承接咨询或到店等目标。参数密度与分散的通用说明仅作为编辑提醒，不能用来删除配置、版本和功能条件；数值检查支持精确的质量、长度单位等值换算，不从参数推导体验效果。

## 完整资料与作品

本次发布依据项目持有人确认的主办方授权，包含完整知识库、原图及本地作品记录。线上与本机共用同一套 React / Express 后端流程，不再使用单机型静态版作为主入口。

- 完整资料包：1538 个文件，保留原目录与内容；与本机相同的索引提供 12 款机型、1345 份文档、61 张绑定型号的产品原图。
- 展示作品：仅保留上述四篇新案例，原文、版本编号、来源和核验信息保持不变。旧草稿与旧案例已归档至本机私有备份，不再随当前发布包展示。
- 创作：需求理解、创意策划、发帖人设、单品与生态创作、编辑及多平台内容包。
- 交付：查看依据，复制文案，导出 Markdown、HTML、JSON 或 PNG 配图包。

模型配置发布时为空。工作人员在“连接设置”填写自己的 API 地址、模型名称与 API Key，保存并测试后使用模型创作；未配置时可明确选择规则体验。规则稿不会标记为真实模型结果。历史模型作品是此前真实运行的记录，不代表线上已配置模型。

已发布案例保持不变；新作品和修改版本按访问者隔离。访问凭据保存在当前浏览器，模型密钥仅暂存服务端内存，空闲两小时或服务重启后需重新填写。模型 API 仅支持页面提示的官方 HTTPS 服务，云端不连接个人电脑的 localhost。

## 运行发布版本

需要 Node.js 22.13+（22.x）和 npm。发布仓库包含 `published-data/`：

```powershell
npm ci
npm run build
npm run start:published
```

打开 `http://127.0.0.1:3000`。该命令读取已发布资料，使用独立的 `private/published-workspace/` 保存新记录，不覆盖原本的本机数据库。Windows PNG 导出使用 Edge；Linux 需要安装 Playwright Chromium 及中文字体。

个人开发库仍可使用 `private/knowledge/` 和 `npm run dev`。本机完整配置方法见 [部署指南](docs/DEPLOYMENT.md)。

## 发布与检查

```powershell
npm run check
npm run package:preview
npm run package:authorized
```

源码预览打包和完整资料导出为独立步骤。完整导出需要资料持有人授权，读取 SQLite 一致性事务中的有效作品，扫描凭据并生成逐文件 SHA-256 清单，不复制数据库、WAL、日志或整个 private 目录。

Docker 发布使用同一套完整服务，监听 7860 端口；`PUBLISHED_DATA_DIR` 指向经过清单校验的资料包。没有这个明确的发布包时，公网模式仍保留原有受控访问限制。

旧的 `build:demo` 静态规则体验仅作独立备用，不是当前魔搭完整版。其单机型摘要和浏览器存储不代表完整资料集。

## 目录

```text
src/             新版 React 工作台
shared/          类型、场景、平台与导演规则
server/          检索、模型、核验、导出与持久化
published-data/  获授权的完整资料、原图、作品快照与清单
prompts/         模型提示词
tests/           单元、接口与浏览器测试
scripts/         运行、构建、导出与打包工具
docs/            设计、部署、安全、验收与作品说明书
private/         本机凭据、数据库、日志等，不上传
```

[系统设计](docs/ARCHITECTURE.md) · [资料政策](docs/SOURCE-POLICY.md) · [安全说明](docs/SECURITY.md)

授权公开展示不等于素材权利转让或任意商用许可。品牌与第三方素材权利归原权利人；本仓库尚未选择开源许可证。核验辅助发现风险，不保证覆盖全部错误，配置、价格、活动及兼容条件应在发布前人工确认。
