# 验收说明

本文件描述检查方法，实际结果单独写入 [测试记录](TEST-REPORT.md)。

## 自动化回归

```powershell
npm run check
npm run build:demo
npx playwright test --config tests/e2e/demo.config.ts
npm run test:e2e
```

- 单元与接口测试使用合成资料，验证输入校验、检索、模型契约、核验、修订、权限和导出。
- 静态浏览器测试针对实际 dist-demo 构建，覆盖默认导演首页、三种写法、生成、精简、平台转换、人工编辑、重新核验、三种导出、刷新历史、知识浏览和经典入口。
- 静态故障测试主动阻断远程图片，检查占位与缺图提示；不作为实际图片可达性证据。
- 本机浏览器回归分桌面和手机，运行独立合成服务，不使用真实账号或模型。
- Windows 浏览器默认使用本机 Edge，可由 PLAYWRIGHT_CHANNEL 指定已有 Chromium 通道。

## 原地址上线检查

```powershell
npx tsx tests/public-demo-live.ts https://jixie1111-zhixu-huawei-pc-demo.ms.show/
```

需要带平台访问参数时，可向脚本传入本地私有部署结果 JSON 路径；不会把参数写进公开报告。

线上检查不拦截或替换响应：确认新版首页、实际官网图片、三场景与平台、三种导出、编辑与版本、刷新历史、无密钥设置及桌面/手机布局。同时记录页面异常与应用 API 请求，比较线上 HTML / JS / CSS 与本地构建哈希。

只收到 HTTP 200 或平台 Running，不算首页与交互验收完成。

## 真实模型验收

以下脚本需有权使用的资料与明确的运行授权，实际调用可能消耗模型额度：

- `scripts/verify-real-model.ts --run`：实际模型生成与核验记录。
- `tests/real-director-live.ts --run`：本机新版导演的真实浏览器链路。
- `tests/real-delivery-live.ts --run`：多平台和生态交付。
- `scripts/verify-real-ecosystem.ts`：限定设备与条件的生态验证。

运行前查阅各脚本的参数；模型、输入、原始结果、失败、修订和导出保存在私有目录。恢复旧稿、重新核验和全新模型生成分开统计，不相加冒充新生成。单次时长不作为稳定速度承诺。

本次公开版本更新不需要调用真实模型，也不会将规则体验当作真实模型验收。
