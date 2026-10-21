# 真实模型验收入口

2026-10-19最新结果见[真实模型案例与页面验收](REAL-MODEL-RESULTS.md)。本机gpt-6.1-sol已真实生成多组案例，不能沿用下文旧状态断言当前未接通。新导演页面使用`tests/real-director-live.ts`，多平台/生态用`tests/real-delivery-live.ts`。旧脚本按初赛经典表单设计，不是新版导演的验收入口。

## 初赛阶段的ModelScope服务与旧流程（历史记录）

初赛时曾遇到ModelScope模型HTTP401。当时的账号问题没有在本轮复验；现在使用用户授权的本机服务。以下保留旧配置说明和流程，不作为当前模型验收结果。

绑定步骤见[官方阿里云绑定与授权说明](https://modelscope.cn/docs/accounts/aliyun-binding-and-authorization)。候选模型为 `Qwen/Qwen3.5-35B-A3B`，API base 为 `https://api-inference.modelscope.cn/v1`；候选模型出现在官方列表不代表当前账号已能调用。免费资源以[魔粒官方说明](https://modelscope.cn/docs/magicube/intro)及账号实际额度为准。

先保持本机完整版运行在 `http://127.0.0.1:3000`，导入已获使用许可的本地知识库，并由账号持有人通过应用设置配置模型。脚本不读取或设置密钥、不访问 ima、不设置请求拦截、不伪造响应、不发布资料。

默认只读预检查，不消耗模型调用：

```powershell
npx tsx tests/real-model-live.ts
```

它仅 GET 本机 bootstrap，检查私有运行模式、资料与同型号图片数量、模型配置是否存在；即使成功，也不会验证提供方鉴权。缺配置或资料不全会早停。可选 `--url=http://127.0.0.1:3000`、`--product=具体产品ID`；只允许 loopback 地址。

账号问题解除、确认可以消耗模型额度后，显式执行：

```powershell
npx tsx tests/real-model-live.ts --run
```

连续同一浏览器录屏覆盖：必填任务拦截（原生 required 阻止提交）、冲突型号禁用（存在时）、开学季/小红书、职场办公/公众号、门店到访/朋友圈、海报转换、自由语气改写、最后加入“全网第一/999元/吊打竞品”的手动编辑。最多 6 次 UI 动作：3 次创作、1 次平台转换、1 次自由改写、1 次风险编辑。创作与编辑可能各包含服务端独立语义核验，因此不等于最多 6 次提供方 HTTP 调用。脚本不重试生成，不通过反复生成挑选通过结果。

每份成功保存的作品检查真实 `llm` 引擎、本地来源、原图实际解码与 SHA256、Markdown/HTML/JSON 导出、HTML 全图嵌入和版本父链。正常作品必须 `audit.status=passed` 且 `releaseReady=true`；风险编辑必须新版本 `blocked` 且 `releaseReady=false`，原版本保持不变。自动通过仍不替代发布前人工审核。

所有录屏、截图、原始运行 JSON、导出、报告和哈希清单都保存在独立 `private/real-model-acceptance/<时间>/`，包含私人作品与知识库摘录，不得提交到公开仓库或公开演示。遇到 401、生成错误、事实核验不通过或图片失败立即停止，保留已产生证据和录屏，不自动退回规则生成。只有报告状态 `passed-real-model-acceptance` 才表示本次真实流程通过；预检查结果不能当作端到端证据。
