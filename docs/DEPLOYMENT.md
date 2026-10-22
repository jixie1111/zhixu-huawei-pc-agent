# 部署与运行

## 原有地址

- [GitHub](https://github.com/jixie1111/zhixu-huawei-pc-agent)
- [魔搭创空间](https://modelscope.cn/studios/jixie1111/zhixu-huawei-pc-demo)
- [独立网页](https://jixie1111-zhixu-huawei-pc-demo.ms.show/)
- [作品说明书](https://github.com/jixie1111/zhixu-huawei-pc-agent/blob/main/docs/作品说明书.pdf)

## 完整发布模式

发布包使用新版首页与 Express 后端，读取 `published-data/manifest.json`，逐文件验证长度、SHA-256、相对路径和符号链接。只有明确配置 `PUBLISHED_DATA_DIR` 的有效授权包能够开放产品原文、原图和发布作品；不会自动扫描误挂载的 private 目录。

知识库全部 1538 个文件保留；索引逻辑与本机一致，识别 12 款机型、1345 份资料与61张绑定原图。原有资料冲突标记继续有效，不因上线解除事实拦截。

作品通过 SQLite 只读事务导出为 JSON，不复制运行中的数据库或 WAL。快照包括55份单品稿、4个多平台内容包与2份生态稿。原始快照不能被访客覆盖；新稿及版本按当前访问者隔离。

## 模型由使用者填写

发布时模型 API 地址、名称和密钥留空。在“连接设置”填写官方 HTTPS 兼容服务，保存并测试后创作。

- 模型密钥仅存服务端内存，不写入前端持久存储、数据库、作品或仓库。
- 每位访客使用独立访问凭据；不会共用他人或运营方的模型配置。
- 空闲两小时或服务重启后，重新填写模型连接。
- 前端访问凭据丢失会失去对应新作品空间的访问，不等同于账户登录与跨设备同步。
- 云端不连接 localhost、本地局域网或任意代理地址。
- 已发布历史模型作品保留原始状态；新规则稿保持规则标记。

本次在线来源为已授权资料库；ima 的账号接入仍属于本机可选功能。

## 本地运行已发布版本

```powershell
npm ci
npm run build
npm run start:published
```

默认 `127.0.0.1:3000`。资料取自 published-data，新数据写入 private/published-workspace，不影响原本的 private/zhixu.sqlite。

原本的本机开发方式：`npm run dev`，默认读取 private/knowledge；可通过 KNOWLEDGE_DIR 指定其他获授权资料目录。已有本机加密模型配置的机器仍可使用 start:local / check:local，配置文件不上传。

## 魔搭 Docker

保留原空间与原 URL，将运行方式更新为 Docker。沿用原免费 CPU 实例，不创建新空间。

[魔搭 Docker 文档](https://www.modelscope.cn/docs/studios/docker)要求服务监听 0.0.0.0:7860。镜像包含 Node 22、锁定依赖、完整生产前端、已发布资料、Chromium 与中文字体。

| 环境变量 | 用途 |
| --- | --- |
| PUBLIC_DEPLOYMENT=true | 公网来源校验及隔离 |
| PUBLISHED_DATA_DIR=/app/published-data | 显式授权资料包 |
| DATA_DIR=/mnt/workspace/zhixu | 线上新作品数据库 |
| PUBLIC_ORIGIN | 实际 ms.show HTTPS 来源 |
| FRAME_ANCESTORS | 已核对的魔搭父页面来源 |
| PLAYWRIGHT_BROWSERS_PATH | 图文渲染浏览器路径 |

密钥默认不设平台环境变量。容器重建可能清除运行层数据库；正式使用应挂载持久卷并做好备份，发布快照可以从仓库恢复。

## 更新流程

1. 检查源码、构建、接口测试与授权范围。
2. 运行源码打包和授权资料导出，两者均扫描凭据。
3. 同步经清单校验的文件，普通提交至原仓库，不 force push。
4. 在原空间启动服务。
5. 核对线上12机型、资料与原图数量、作品详情、历史版本、PNG/HTML导出及空白可编辑模型表单。

静态 build:demo 只作备用，不能用于替代完整后端发布。验收以真实页面和接口为准，不以 Running 或 HTTP 200 单独判断。
