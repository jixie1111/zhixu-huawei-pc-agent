---
domain: nlp
tags:
  - knowledge-grounded-marketing
  - demo
language: zh
deployspec:
  entry_file: index.html
---

# 知序 · 华为 PC 营销图文智能体

一个以产品证据为起点、面向营销创作与审核的工作台：需求澄清 → 精确型号检索 → 写作策略 → 图文生成 → 事实与合规核验 → 修改、版本与导出。

> 当前优先上架可交互的免 API 规则演示，不是正式参赛交付或真实大模型成果。本机完整版保留授权知识库与可选模型。实际完成情况以 [当前状态](docs/PROGRESS.md) 和 [测试报告](docs/TEST-REPORT.md) 为准。

## 两种运行方式

| 方式 | 资料与生成 | 使用条件 |
| --- | --- | --- |
| 公开交互演示 | 少量已核对官网摘要、官网远程图片 URL；在浏览器按场景/平台规则编排 | 无 API Key、无后台模型调用；始终标为规则演示，非真实 LLM |
| 本机完整工作台 | 用户授权的完整本地知识库与原图；默认规则预览，可显式切换真实模型；ima 为可选来源 | 规则无需密钥；选择模型才需要可用模型配置，选择 ima 才需要其权限与 CLI |

本次上传已获用户授权。[GitHub 仓库](https://github.com/jixie1111/zhixu-huawei-pc-agent)已创建，源码尚未推送；[魔搭创空间](https://modelscope.cn/studios/jixie1111/zhixu-huawei-pc-demo)首次部署已达 `Running`，首页 HTTP200。图片读取修正版已完成本地构建，第二次部署进行中，最终线上交互验收仍待完成。以上是预览上架进度，不是正式比赛提交。

## 能做什么

- 八类场景：开学季、职场办公、内容创作、家庭换新、企业采购、门店到访、新品首发、节日营销。
- 四类平台：小红书、微信公众号、门店朋友圈、门店海报；对应内容结构与图片数量规则。
- 按具体型号绑定事实、来源与图片；不同型号不得混用，明显冲突不继续生成。
- 可解释创作策略、事实引用、图片编排、风险提示、版本记录与草稿导出。
- 明确标识公开规则演示 / 本地规则编排 / 模型生成，以及实际资料来源。
- 本地设置页安全配置、官方 HTTPS 模型端点限制、凭证脱敏、公开部署私有读取与写入保护。
- 本机离线备用演示：三份带内嵌原图的本地规则草稿，永久标为非 ima 在线、非模型、非正式参赛案例。

本项目不承诺自动审查覆盖全部广告风险；价格、补贴、活动、库存、上市时间、兼容性和服务政策仍需人工确认。规则检查通过不等于取得发布许可。

## 公开免 API 演示构建

公开版使用同一套界面，创作、换场景/平台和规则检查在浏览器中执行。只打包经核对的少量官网摘要与远程图片链接，不包含用户 ZIP、原始图片字节、数据库或任何密钥。远程图片需要网络，可能受来源站点可用性影响。

```powershell
npm ci
npm run build:demo
npm run preview:demo
```

`build:demo` 跨平台执行 TypeScript 检查，再以 `VITE_PUBLIC_DEMO=true` 和相对资源路径 `base=./` 构建到独立的 `dist-demo/`，不会覆盖普通服务端前端构建。`preview:demo` 在 `http://127.0.0.1:4174` 预览。构建会同时准备 `output/static-demo-<时间>/`；需要重新暂存已有构建时运行 `npm run package:demo`。当前暂存目录只含4个构建文件及专用 README，将其中内容作为静态托管根目录，入口为 `index.html`；打包本身不上传。

此构建不启动 Express、SQLite、ima 或模型服务，不需要 `PUBLIC_DEPLOYMENT`、`ADMIN_TOKEN` 或服务端 Secrets。公开规则稿不是大模型生成结果，不能代替比赛要求的三组真实模型案例。上架操作与真实地址验收见 [部署指南](docs/DEPLOYMENT.md)。

当前本地静态验收：桌面/手机 e2e 2/2通过，额外补测3/3通过；实际生成三场景、九份 Markdown/HTML/JSON 导出，HTML 原站图片内嵌分别3/3、2/2、1/1，0 API调用。最终本地静态构建 CSS 68.82KB、JS 432.26KB；这些记录不替代最终版本的线上验收，详见 [测试报告](docs/TEST-REPORT.md)。

## 本地启动

需要 Node.js **22.13 或更新的 22.x 版本**、npm；当前本地验证版本为 22.23.1。服务端使用 Node 内置 SQLite（可能显示实验性 API 提示）；22.13 是该模块不再要求额外启用标志的最低 22.x 版本，见 [Node 官方说明](https://nodejs.org/api/sqlite.html)。

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

在浏览器打开终端提示的本地地址，默认 `http://127.0.0.1:3000`。生产构建与运行：

```powershell
npm run build
npm start
```

### 本地知识库

用户已转述主办方允许本地部署知识库，并允许资料不足时参考华为商城。本机支持本地资料＋规则预览或真实模型，不需要 ima 资料额度；具体边界见 [资料使用方案](docs/SOURCE-POLICY.md)。ZIP、原文、原图、SQLite 记录和实际输出保存在 `private/`，不随源码或静态演示公开。服务端公网模式仍拒绝误挂载的本地库；用户的本地使用许可不等于公开传播授权。

1. 在 `private/knowledge/` 下解压已获得使用许可的知识库，保留文件夹、`产品事实.md` 和 `图片索引.csv` 的原始层级。
2. 运行 `npm run knowledge:inspect`，核对型号、事实、图片和冲突状态。
3. 默认使用“本地知识库”和“规则预览”，无需 API 即可体验规则流程。需要真实模型创作与自由改写时，显式选择“AI模型创作”并配置模型；不需要 ima 凭据。规则结果不能代替正式模型验收。

也可设置 `KNOWLEDGE_DIR` 指向已有授权目录。索引器不纳入 P4、90、99 受控目录。不会自动纠正来源中的冲突参数；存在问题时需要对照原始资料人工核实。

### 可选 ima 与模型连接

只有使用 ima 来源时，才需要同一 ima 账号加入指定共享库，按 ima 官方流程取得 Client ID/API Key，在本机 `.env` 或本地设置页配置。模型也是可选运行方式；公开规则演示和本地规则预览不需要这些凭证。不要把凭证发到聊天、截图、仓库或前端代码中。

ima 适配器使用官方 `ima_api.cjs`。该第三方文件不随预览源码包发布；项目提供固定版本下载与 SHA-256 核验脚本，安装方式见 [部署指南](docs/DEPLOYMENT.md)。示例默认路径为 `vendor/ima-skills/ima-skill/ima_api.cjs`。服务器需能够访问 ima 服务。还需要可用的兼容 OpenAI Chat Completions 的模型服务与模型名称。

| 配置 | 作用 |
| --- | --- |
| `HOST` / `PORT` | 默认监听 `127.0.0.1:3000` |
| `IMA_OPENAPI_CLIENTID` / `IMA_OPENAPI_APIKEY` | 服务端 ima 凭证 |
| `IMA_KB_NAME` | 指定共享知识库名称 |
| `IMA_SKILL_PATH` | 官方 ima CLI 脚本路径 |
| `LLM_BASE_URL` / `LLM_MODEL` / `LLM_API_KEY` | 官方允许列表中的模型端点、模型和密钥 |
| `KNOWLEDGE_DIR` | 本地授权知识库位置，默认 `private/knowledge` |
| `DATA_DIR` | 本地记录目录，默认 `private` |
| `PUBLIC_DEPLOYMENT` | 仅服务端公网部署使用，禁用本地库和网页修改服务凭证；纯静态演示不使用 |
| `PUBLIC_ORIGIN` | 公开应用的实际 HTTPS 来源，不含路径；用于精确校验浏览器写入，本地留空 |
| `FRAME_ANCESTORS` | 可选的公开嵌入父页面 HTTPS 来源列表，逗号分隔；默认禁止嵌入，不允许通配符，本地留空 |
| `ADMIN_TOKEN` | 公开服务的受控操作令牌；不能放入公开页面/仓库 |

网页填写的凭证只存在服务器进程内，重启后需重新填写；`.env` 属于本机持久配置。模型是否可用以实际调用为准，“已配置”不表示已连接或已生成成功。

上述管理员、来源校验和历史隔离仅属于可选服务端公网模式，不是本次纯静态演示的访问要求。服务端不信任任意 forwarded 请求头；未配置 `PUBLIC_ORIGIN` 时浏览器写入被拒绝。历史仅允许管理员访问，旧本地稿、混合来源或不完整版本链被隐藏并禁止导出/编辑/改写，原数据不删除。完整配置见 [部署指南](docs/DEPLOYMENT.md)。

生成方式与来源独立：本地知识库的模型创作支持自定义语气、结构及内容改写，并独立核验本地原图；规则预览限于确定性的精简和平台重排。选择模型但缺少配置时明确报错；默认规则演示无需模型，缺密钥不再阻塞预览上架。手册没有要求购买某家服务或提交 API Key。

### 本机断网备用演示

准备已有使用许可的本地知识快照后，可显式运行：

```powershell
npm run demo:offline
```

脚本在私有数据目录（默认 `private/`）创建全新的 `demo-<时间>/`，不覆盖旧包。打开其中的 `index.html`，可查看开学季小红书、职场办公公众号、门店到访朋友圈三份规则草稿；图片全部内嵌，并附输入/审核简报和 SHA-256 清单。它不联网、不访问 ima 或模型、不开放原库，也不自动上传。

将占位目录替换为本次生成的私有目录，再运行验证：

```powershell
npm run demo:verify -- "private/demo-<时间>"
```

验证器核对清单哈希，并在断网浏览器中检查桌面/手机尺寸的导航、原图解码和页面溢出。Windows 默认使用已安装的 Edge，可用 `PLAYWRIGHT_CHANNEL` 选择其他已安装的 Chromium 通道；检查截图和报告存入私有的 `tmp/offline-demo-qa/`。这些结果仅证明离线包可用，不是在线验收证据。

这是与公开静态演示分开的本机断网备用材料，永久标记“本地规则草稿 / 非 ima 在线取证 / 非大模型生成 / 非正式参赛案例”。包内仍含选定的私有事实片段与图片，不随源码发布，不能代替三组真实模型案例、现场模型生成测试或素材公开授权。详见 [部署指南](docs/DEPLOYMENT.md)。

## 检查与预览包

```powershell
npm run check
npm run test:e2e
npm run package:preview
```

`check` 包含 TypeScript、前端构建和自动化单元/接口测试；浏览器测试单独执行。Playwright 需要可用 Chromium 或本机 Edge，具体见 [验收操作](docs/ACCEPTANCE.md)。`package:preview` 仅在本地 `output/` 生成源码目录和 SHA-256 清单，不会上传、推送或提交比赛。它不包括原始知识库、图片、凭证、运行数据库、测试录像或第三方供应商脚本。

## 目录

```text
src/             React 工作台
shared/          类型、八场景与四平台规则
server/          检索、策略、生成、核验、API 与 SQLite
prompts/         可审查的系统提示词
tests/           合成资料单元/接口测试与浏览器验收
scripts/         知识索引检查、固定 ima 安装、私有离线演示与源码预览打包
docs/            设计、部署、作品说明和验收说明
private/         仅本地资料与记录（不入库）
```

## 比赛材料与待人工环节

[作品说明书草稿](docs/WORK-SUBMISSION-DRAFT.md) · [系统设计](docs/ARCHITECTURE.md) · [部署指南](docs/DEPLOYMENT.md) · [安全边界](docs/SECURITY.md) · [演示脚本](docs/DEMO-SCRIPT.md) · [验收矩阵](docs/REQUIREMENTS.md)

用户已授权上传 GitHub 与魔搭预览，不再以模型配置作为本次规则演示上架前提。GitHub 仓库已创建待推送，魔搭首版已 Running/首页HTTP200，第二次修正版部署与最终线上交互检查尚在进行，正式比赛提交尚未进行。真实 AI 验收仍需可用模型、至少三组本地知识库＋模型结果及真实模型运行录屏；规则演示录屏只能证明规则版实际可用。浏览器自动化可记录真实流程，合成 mock 回归不能替代。ima 成员资格仅在选择 ima 来源时需要。

项目中的 Huawei/华为/ima 等名称仅用于说明目标产品或接入对象，不表示官方授权或背书。官网摘要和远程图片保留具体出处，权利仍归原权利人；不重分发用户原库。当前未替用户选择开源代码许可证。
