# 部署与运行

## 固定发布地址

- [GitHub 源码](https://github.com/jixie1111/zhixu-huawei-pc-agent)
- [魔搭创空间](https://modelscope.cn/studios/jixie1111/zhixu-huawei-pc-demo)
- [独立网页](https://jixie1111-zhixu-huawei-pc-demo.ms.show/)
- [作品说明书](https://github.com/jixie1111/zhixu-huawei-pc-agent/blob/main/docs/作品说明书.pdf)

GitHub 发布完整自研源码和已检查的产品说明书；魔搭当前发布静态规则体验。它们不是同一种运行环境。本机模型、资料和数据库不上传。

## 公开网页

```powershell
npm ci
npm run build:demo
npm run preview:demo
```

在 `http://127.0.0.1:4174` 检查实际构建。脚本只向 Vite 子进程传入 `VITE_PUBLIC_DEMO=true`，以相对资源路径构建到 `dist-demo/`，不会覆盖本机服务使用的 `dist/`。

`output/static-demo-<时间>/` 是扫描后的独立发布目录，包含 HTML、当前带哈希的 JS / CSS、favicon 和魔搭 README。需要重新暂存时运行 `npm run package:demo`。只上传该目录内容，以根目录 `index.html` 为入口，SDK 类型保持 static。

默认首页为创意导演。规则需求整理、三个预设方向、生成、编辑、平台转换、核验与导出均在浏览器运行。模型服务、人设、生态、PNG 包属于本机完整版；公开页没有服务密钥输入，也不连接用户 localhost。

官网图片需要网络；HTML 导出若内嵌失败，会明确提示缺图。历史只存当前浏览器最近 20 条，无云端账户同步。

## 更新现有发布

1. 运行构建、回归与包内敏感内容扫描。
2. 使用原有仓库和创空间，普通提交，不改名、不 force push。
3. 对照新构建清单，只删除旧版已追踪、当前入口不再引用的哈希资源。保留平台元数据如 .gitattributes；不递归清理工作区。
4. GitHub 同步当前源码清单与作品说明书，移除已确认废弃的文档或脚本；私有目录不在同步范围内。
5. 魔搭构建运行后，比较线上资源哈希并实际测试新版首页与完整交互。只看到 HTTP 200 或 Running 不足以确认新版生效。

公开可见性和访客访问需单独核对。当前空间沿用 Visibility=5、NeedLogin=false；不要覆盖成部署工具的默认值。平台可能通过带访问参数的地址承载应用，必要时用平台当前返回的访问地址验收；对外保留原创空间入口。

检查方法见 [验收说明](ACCEPTANCE.md)，本次结果见 [测试记录](TEST-REPORT.md)。

## 本机完整版

需要 Node.js 22.13+（22.x）、npm 和获授权的产品资料。

```powershell
npm ci
Copy-Item .env.example .env
npm run knowledge:inspect
npm run dev
```

默认监听 `127.0.0.1:3000`。生产运行使用 `npm run build` 后 `npm start`。

| 配置 | 用途 |
| --- | --- |
| HOST / PORT | 本机默认回环地址及 3000 端口 |
| KNOWLEDGE_DIR | 授权资料目录，默认 private/knowledge |
| DATA_DIR | SQLite 和私有资源映射目录，默认 private |
| LLM_BASE_URL / LLM_MODEL / LLM_API_KEY | 允许端点、模型名称、服务端密钥 |
| LOCAL_LLM_BASE_URL | 仅本机，显式授权一个准确的回环模型端点 |
| LLM_REASONING_EFFORT | 可选请求推理档位；不代表供应商必然按该档执行 |
| IMA_OPENAPI_CLIENTID / IMA_OPENAPI_APIKEY | 可选 ima 账号凭据 |
| IMA_KB_NAME / IMA_SKILL_PATH | 可选共享库名与官方 CLI 路径 |

本机导演默认使用模型，规则体验需明确选择。没有模型配置或请求失败时不会自动切换为规则。网页连接设置只覆盖当前进程；环境配置重启后重新加载。

已有私有加密启动配置的 Windows 机器可运行 `npm run check:local` 和 `npm run start:local -- -Port 3003`。该配置绑定当前 Windows 用户，不随源码发布。新的机器应自行配置，不复制他人的凭据。

## 可选 ima 安装

本地库创作不需要 ima。需要 ima 时，使用固定版本与 SHA-256 验证安装器：

```powershell
New-Item -ItemType Directory -Path vendor -Force | Out-Null
npx tsx scripts/install-ima.ts --download --target vendor/ima-runtime
npx tsx scripts/install-ima.ts --check --target vendor/ima-runtime
```

随后将 IMA_SKILL_PATH 设为 vendor/ima-runtime/ima_api.cjs。也可用 --archive 指定已有官方包，--verify-only 只校验不安装。安装器不会覆盖内容不同的已有目录，也不提供账号权限或额外额度。

## 可选服务端公网模式

这是独立的受控运行方式，不是当前魔搭静态体验：

- 使用 PUBLIC_DEPLOYMENT=true；构造知识库时不扫描本地资料，禁止本地原文、原图及本地来源历史。
- 设置 ADMIN_TOKEN，以 X-Admin-Token 访问受保护接口。不能把令牌写入公开前端。
- PUBLIC_ORIGIN 为应用实际 HTTPS 来源；写入请求只允许精确同源，不信任任意 forwarded 头。
- FRAME_ANCESTORS 仅填写已经核实的 HTTPS 父来源；默认禁止嵌入，不允许通配符。
- 模型与 ima 密钥存平台 Secret。保持网页修改凭据的禁用状态。
- Dockerfile 监听 0.0.0.0:7860，数据目录 /mnt/workspace/zhixu，使用非 root 用户。持久数据需由宿主挂载，不能依赖容器可写层。

服务端公网模式不是多租户 SaaS；另行开放之前应审查账户隔离、配额、持久化、日志、素材权利和代理流式响应。本地模型回环端点不能用于云端服务。

## 本机离线备用

```powershell
npm run demo:offline
npm run demo:verify -- "private/demo-<时间>"
```

生成单独私有目录，包含带内嵌原图的规则稿、简报与哈希清单，不覆盖旧包。它是固定规则备用材料，不执行现场模型创作；不能上传原图或将其称为在线模型成果。

## 故障与数据

模型失败先检查端点、名称、权限、额度和出口网络。ima 失败再检查共享库成员资格、CLI 与媒体额度。明确限额时停止重复请求，不通过轮换账号绕过限制。

修改环境配置后重启服务。备份应使用 SQLite 安全备份或停止写入后复制完整数据，不只拷贝仍有 WAL 的主数据库。日志和错误反馈不得包含密钥、完整配置、数据库或私有资料。

更多边界见 [安全说明](SECURITY.md) 与 [资料政策](SOURCE-POLICY.md)。
