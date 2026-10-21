# 物有言 · 复赛后端契约

当前仅本地开放，公开部署统一拦截。沿用同源写入检查、管理员保护、错误脱敏和重任务并发预算。模型调用来自配置的授权服务；模拟测试不证明真实生成效果。

当前质量收尾快照见[QUALITY-CLOSEOUT.md](QUALITY-CLOSEOUT.md)：219项回归、桌面/手机各20项完整浏览器测试和生产构建通过；真实页面及成品另行审读。历史阶段的待验收描述不覆盖此快照。

## 创意导演

- `POST /api/director/interpret`：`{message, engine: model|rules}`；返回需求字段及 user / inferred / needs-confirmation 来源。具体型号唯一确认前不自动选型。
- `POST /api/director/plan`：`{message, engine, brief}`；从精确型号资料策划三个方向，返回方案ID和方向ID。绑定完整简报与引擎，30分钟到期，内存最多100份；改简报或服务重启后需重策划。
- `POST /api/generate`：既有SSE。新增可选 `directorPlanId`、`conceptId`、`autoRepair`。两ID须成对；选中方案真实影响结构、事实优先级、CTA与视觉方向。
- 修订最多2轮，仅允许核验片段唯一定位的字段补丁，逐轮完整重验。服务失败、图片/来源问题不通过重试掩盖。`Run.repairHistory`保留前后稿、变更字段与核验。

## 多平台内容包

- `POST /api/campaigns`：`{sourceRunId, platforms:[xiaohongshu|wechat|moments|poster], audience?, scene?, instructions?}`。1–4个唯一平台，同一工作流依次生成，保留原稿。
- `GET /api/campaigns`、`GET /api/campaigns/:id`：持久化查询。
- 模型稿按每个平台重新策划；规则稿仅支持结构重排，附加自由改写明确失败。
- 总状态 running / complete / partial / failed / cancelled；单项 pending / running / generated / failed / cancelled。
- complete 仅表示各平台产出齐全；是否通过发布检查另看 releaseReady 与每项 auditStatus。
- 客户端断开停止上游工作，已完成作品保留，未完成平台标为cancelled。当前POST为长请求；将来前端应显示等待及历史查询，不能把断线直接当作全部失败。
- 服务重新启动会将遗留running内容包记为cancelled；已经产出的版本引用保留，其余项附PROCESS_RESTARTED原因。

## 产品类型与生态证据

- 单品解析支持 computer / phone / tablet / other，新增充电、前后摄像头、网络制式、防尘防水、手写笔、配件兼容等字段。只提取已录入事实，不自动从品类推断功能。
- `GET /api/ecosystem` 返回已录入的协同能力与所需条件。
- `POST /api/ecosystem/resolve`：`{devices:[{productId,system}], relationIds, conditions:{key:value}}`。
- 关系记录来自本地 `private/ecosystem-relations.json`，不随公开包分发。字段：id/capability/statement/participants[{productId,role,systems}]/conditions[{key,label,value}]/sourceTitle/sourceUrl/excerpt/reviewedAt/expiresAt。
- 系统版本目前为精确白名单，不猜测“更高版本都支持”。设备组合、系统、条件、复核日期均满足才返回 supported；缺条件是needs-confirmation，过期/错组合/缺证据是unavailable。
- 已补入 HUAWEI Pura 80（13组参数、4张官方配色图）与 HUAWEI MatePad 11.5 2026（15组参数、4张原图）。原始HTML、图片、来源URL、获取时间及SHA-256保存在独立补充目录，原PC归档不变。当前库1345文档、61图片、12型号。仅本地，不代表素材再分发授权。
- 首条关系为 Pura 80 全网通12GB+512GB → MatePad 11.5 2026 标准Wi-Fi8GB+128GB，双方HarmonyOS5.1下的移动网络共享；具体账号、无线开关、SIM、首次认证等条件逐项确认。不会默认替用户确认实际设备状态。来源：华为支持说明及双方兼容清单。复核有效期至2026-10-24T00:00:00Z，过期需再次核实。
- `npx tsx scripts/verify-ecosystem-snapshot.ts` 只读检查快照hash、原图与解析器；其中显式条件输入只验证逻辑，并非实机兼容性实测。

## 生态成稿（独立设备域，后端已接线）

- `POST /api/ecosystem/runs`：`{selection:{devices,relationIds,conditions},audience,platform,goal,requirements?,generation:"model",autoRepair?,parentId?}`。必须模型模式；缺条件先阻断，不调用模型。
- 阶段：设备角色及事实策划 → 结构化成稿 → 每字段引用/设备归属/原图/合规检查 → 独立模型核验 → 最多两轮局部修订与重验 → SQLite保存。
- `GET /api/ecosystem/runs`、`GET /api/ecosystem/runs/:id`；历史通过状态在读取时重新检查当前证据有效性，不改写存档审计。生成与编辑结束前再次检查来源，过期或资料变化停止保存。
- `POST /api/ecosystem/runs/:id/edit`：完整文本结构 `{title,lead,sections:[{heading,body}],cta,tags}`。各字段为 `{text,facts:[{productId,factId}],relationIds}`，包括标题/CTA/标签。图片、自动适用条件不可通过编辑请求替换。重新独立核验，创建子版本，保留原稿。
- `GET /api/ecosystem/runs/:id/export?format=json|md|html&draft=true`：未通过只能导出标记草稿；HTML带原图与显式适用条件，文本转义及禁脚本CSP。正式HTML导出重新读取原图，缺失时拒绝完整导出。
- 每设备至少一图，最多六图。生态海报现可将各设备原图与完整文案排成一张PNG；文字与条件放不下时明确拒绝，不缩成不可读小字、不丢字。多平台变化通过新建parentId版本独立重策划，批量接口见下节。
- 多设备使用独立的EcosystemRun/表，不把辅设备事实混入主设备Evidence，也不复用单设备核验的唯一型号假设。
- 全部接口沿用本地限制、共享并发预算与请求取消。模型失败不降级规则；核验漏字段、错字段或失败保存待审稿；任意一个不支持字段均阻断。
- 合成模型合同测试之外，已有真实生态朋友圈生成与独立核验案例；前端逐项确认系统/10项条件、恢复真实成品和3页PNG导出已验证。本轮恢复旧稿不冒充新生成，**实际手机/平板连接仍未实机验收**。

## 生态多平台内容包与联动修改

- `POST /api/ecosystem/campaigns`：`{sourceRunId,platforms:[xiaohongshu|wechat|moments|poster],audience?,goal?,instructions?}`。1–4个唯一平台；仅模型，不切换规则。阶段化生成仍由真实生态Agent执行，各平台独立策划、生成、核验和必要修订。
- 原稿的创意方案、有效手工编辑及文字结构同时传入策划和写作阶段。保持受众时延续核心创意、按平台重构；改变受众或目标时重新调整。原稿始终不是事实来源，不继承无依据断言。这是已实现的上下文传递约束，最终创意保持程度仍需真实模型效果验收。
- `GET /api/ecosystem/campaigns`、`GET /api/ecosystem/campaigns/:id`：读取持久化内容包及当前审核状态。已生成项目在读取时重新检查作品来源有效期，历史通过不代表当前仍可发布。
- `POST /api/ecosystem/campaigns/:id/revise`：`{instructions,audience?,goal?,editedRunIds?:{wechat?:runId,...}}`。生成新内容包，保存`parentCampaignId`，各平台从前一包对应作品创建子版本，旧包/旧稿不覆盖。失败或取消的平台从该项原稿重新执行。
- 选择手工编辑稿须显式传`editedRunIds`，服务检查其祖先链确实来自对应平台，且设备、系统与条件不变；不能混入无关作品或其他平台。不会悄悄选全局最近版本。
- 每项保存`sourceRunId`/`runId`/`auditStatus`/`releaseReady`。任务状态running/complete/partial/failed/cancelled；complete只表示产出齐全，全部重新核验通过才releaseReady。
- 所有原稿有效性及合并要求长度在模型调用前校验。共享同一重任务预算，逐平台执行；中途断开保留已完成版本，剩余取消；进程重启自动中止遗留running状态。当前为长POST，可通过列表恢复查看；尚未做前端进度交互。
- SQLite独立`ecosystem_campaigns`表，不与单品内容包混用；公开模式即使管理员授权仍403。

## PNG成品导出

- 单品与生态已有export端点新增`format=png-pack`，返回ZIP，含全部PNG、预览HTML、来源/哈希/文字范围清单。未通过稿件要求显式`draft=true`，每页保留草稿标记；规则稿不冒充模型创作。
- 小红书1080×1440、公众号1200×1600、朋友圈1080×1080；按实际渲染高度分页，原图与指定段落对应。门店海报1080×1528单页；放不下全部正文及限定条件则422。
- 只内嵌已核对同型号原图，签名、尺寸、解码与SHA-256检查。Windows用本机Edge，其他部署须准备Playwright Chromium。独立无用户资料浏览器上下文、禁脚本、禁外联，不访问登录态。
- 上限32页、原图总计24MB、单图8MB、PNG总计48MB、90秒；复用重任务预算，断开取消。下载前重新确认来源状态。没有图片生成模型或虚构场景照片。
- 正文30px、适用说明25px，按实际高度分页，不缩字、截正文或裁产品来塞版面。短段和CTA/标签/条件连续合页；文末图片可承接收尾，多图每行至多两张；保留完整文字顺序及每张图片，不重复凑页。
- `ProductImage.description`对精确型号+SHA256人工复核图采用中性`editorial.caption`，原始索引描述另存`sourceDescription`。未复核图保持来源名，不按文件名推断画面；这些注释不是舒适度、性能或配件能力证据，旧稿和原始索引不改写。

## 模型阶段与平台表达

`server/model-policy.ts`的`wuyan-stage-voice-v3`为当前服务端策略，用户文本不能覆盖采样配置。意图0.15、策划0.7、独立核验0.1、局部修订0.2、连接测试0；写作按小红书0.8、公众号0.65、朋友圈/海报0.7。平台表达指南仅注入策划与写作，核验/修订保持独立。v3进一步要求“具体场景动作—选购关注点—一至三个相关产品事实—体验邀请”，缩短小红书分节，配图优先整机和相关细节；不从存储推导整理能力或从尺寸推导效率。仍沿用v2的体裁多样性及成品不混入写作解释要求。旧v1/v2案例不重标为v3效果。

温度仅是采样偏好，不保证事实正确或可复现。真实运行与人工审稿见`REAL-MODEL-RESULTS.md`；供应商不接受参数时明确失败，不静默去掉参数或切规则。当前未实现全部运行的模型采样审计记录，不能把代码默认值当作历史作品的真实调用证据。

本机模型桥接：操作员在进程环境明确设置`LOCAL_LLM_BASE_URL`后，仅允许完全匹配的`http://localhost:<port>/v1`或`http://127.0.0.1:<port>/v1`；请求固定发往数值回环地址，拒绝任意内网、重定向、地址变体及公开部署使用。网页无法设置此授权变量。密钥从会话或环境获取，不新增源码中的密钥配置。

`LLM_REASONING_EFFORT`选择显式推理配置，支持low/medium/high/xhigh/max，请求发送`reasoning_effort`与`max_completion_tokens=16000`，不发送温度或旧max_tokens。当前按用户要求将本机会话从high改为low；本机模型目录只有gpt-6.1-sol，没有独立light模型ID。四平台写作指引仍生效，截断结果不能作为完整成稿。

本地`POST /api/settings`可设`{"llmReasoningEffort":"low"}`覆盖环境值；空字符串显式选回温度模式，未知档位拒绝。重启/清除会话恢复环境值；`start:local`从仅含DPAPI密文的private配置恢复服务端`LLM_REASONING_EFFORT=low`。没有明文密钥文件，不修改全局系统环境，公开部署仍禁止网页配置。`/api/bootstrap`仅回显请求档位，不表示桥接服务证明了执行档位。创作、独立核验和有界修订均保持。

`scripts/local-recording.ps1`提供Inspect/Check/Start，检查只显示脱敏状态，Start只授权数值回环模型端点并恢复当前进程环境。现有服务保留，指定端口占用时启动退出1，不输出成功提示；默认运行地址显式选择3003，不替换先前3000服务。加密配置只能由当前Windows用户解密，不纳入源码包或导出。

`scripts/verify-real-model.ts --run`需显式执行，将真实调用元数据、最终文本（不含隐藏推理）、输入确认及作品保存到独立private目录，不覆盖历史、不上传。请求档位与服务端执行证明是两件事。

## 当前已补齐与后续边界

1. 已接通本机真实模型，完成三受众同型号小红书、商务公众号挑战和生态案例，见`REAL-MODEL-RESULTS.md`。阶段超时120秒，504/LLM_TIMEOUT；网络故障502/LLM_NETWORK，不暴露底层细节、不自动降级。
2. 最少澄清和最多两个证据覆盖候选已接入，原事实可展开；不是性能排名。本机历史只比较同型号同平台的角度/结构二元组，重复推荐最多重策划一次，不是全网查重。
3. 导演简报、创意、复制、PNG和单品内容包进度/取消/重试已接前端。生态UI有系统/条件确认、生成、历史、依据和PNG。生态整包联动API已有，暂未另做整包前端编辑器。
4. 最新219项回归通过；桌面/手机独立测试库各20项通过。真实UI、构建和说明书见质量收尾及最新日志。更多设备关系、门店档案、语义查重和规模业务效果不属于本轮已验收能力。
