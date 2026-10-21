# 测试报告

## 当前复赛收尾验证（2026-10-19）

- 最新完整单元/接口/渲染回归**219/219通过**，0失败，92.325秒：`tmp/quality-frozen-tests.log`。包括端口占用退出、普通序数与实质排名、图片中性描述及原始来源保留、PNG完整文字和原图、编辑与故障路径。以下208项等为历史阶段结果，不相加。
- 代码冻结后按视口分别启动干净的3101合成服务：桌面**20/20通过**（3.3分钟，`tmp/quality-closeout-browser-desktop.log`），手机**20/20通过**（2.9分钟，`tmp/quality-closeout-browser-mobile.log`）。完整覆盖原40个执行项，含英文多词标签原文不变保存、所有页面截图与横向溢出检查、0未捕获页面异常；无真实模型调用。`npm run test:e2e`现依次执行这两个完整项目，避免项目间累积测试作品污染另一个视口的测试库。
- 保留两轮未通过记录：`quality-final-browser-tests.log`为39通过/1首项超时，当时并行全量渲染测试；`quality-release-browser-tests.log`为39通过/1失败，trace明确记录最后手机导航的bootstrap收到429。后者同一合成库累积两套测试历史、批量加载封面触发240次/分钟限流，不是Vite热更新的已证实问题。最终测试采用独立测试库，未修改生产限流、删除测试或替换通过结果。
- 最终`npm run build`通过（含TypeScript），`tmp/quality-closeout-build.log`。Zod注释和demo-adapter混合导入警告仍为非阻断提示。
- 最新真实页面校园稿`RSB5mf`101.918秒、商务稿`MaOPk6`86.725秒；同型号同小红书，请求low、0修订、均passed、各4页PNG、1440/390无溢出、0页面异常。已阅读全文及逐页检查，核验不替代实际营销效果验证。
- 最新真实多平台`real-delivery-ui-Xb66TA`：134.567秒，朋友圈和公众号均passed并保留父链；朋友圈2页PNG及恢复的生态稿3页PNG已逐页检查。公众号另经实际页面恢复/导出`real-director-ui-VjuL1Q`，4页PNG已逐页检查；恢复不计为新生成。
- 普通序数“第一篇资料”、英文标签被空格拆分，以及来源图片索引的“舒适键盘细节”误作画面断言，均由真实验收发现并修复。序数例外不放行全球/行业/全网排名；标签按行保存；人工按原图SHA256复核的中性caption与原始sourceDescription并存，不放松独立核验。失败作品、版本与原始索引保留。
- 当前说明书4页、正文13磅、小标题15.5磅、大标题28磅；全部页130dpi渲染目视及文字边界、内部文字/凭据模式扫描通过，`tmp/quality-handbook-check.log`。最终SHA256：`46519C46223738A07407ED0B28BDBF4355315ABBE145EC87B880325D9F4F2561`。正式说明书不放入本节验收日志。
- 错误优惠/续航实际UI生成的V2独立核验通过，原生成服务端耗时21.565秒，无800元/99小时断言，输入风险与父链保留。原观察脚本因等待SSE finished挂起被中止，记录`real-revision-ui-kynqan`；修复观察等待后只恢复同一真实作品于`real-revision-ui-UNAmDn`，原稿未变、1440/390布局和0页面异常通过，没有再次生成挑选结果。此恢复不伪称新生成或完整UI耗时。

### 前一阶段记录（208项版本，保留历史）

- 完整单元/接口/渲染回归**208/208通过**、0失败、58.996秒，`tmp/semifinal-light-final-tests.log`。包括推理档位的会话覆盖/清除/非法值、low创作与独立核验请求、普通序数/实质排名、原图hash用途复核、短段合页和模型故障。先前206/206（192.752秒）见`tmp/semifinal-final-verified-tests.log`，是历史版本，不相加。
- 全站桌面/手机浏览器**40/40通过**，8.3分钟，`tmp/semifinal-release-browser-tests.log`；合成资料/模拟模型或明确规则路径，非真实模型质量证明。创意卡改为读者问题后另做桌面/手机**4/4补测通过**，1.7分钟，`tmp/semifinal-light-director-ui-tests.log`，不叠加成44项。TypeScript及最终生产构建通过，`tmp/semifinal-final-local-build.log`（33.91秒）。
- 新页面真实完整生成`RaSEhF`（high）140.894秒、0修订；`wjvTkh`（low）85.362秒、1次局部修订；均passed、5页PNG、1440/390无溢出、0页面异常。后者已人工阅读全文、逐页目视。两例上下文与创意不同，不构成稳定速度或质量排名。
- 最新卡片页面`m783UH`（low）真实完整生成89.382秒、0修订，passed、5页PNG、1440/390检查通过。保存真实策划响应，并验证卡片显示problem而非内部angle；已阅读全文与目视5页。
- 真实多平台页面`real-delivery-ui-AqHts0`：朋友圈/公众号两份通过，182.460秒（high），父链和3页朋友圈PNG保留；随后生态恢复与条件确认通过，恢复无新推理。
- 作品说明书已精简为4页正式产品介绍与使用指南；全部4页经130dpi Poppler渲染、逐页目视，无裁切/重叠/乱码。pypdf确认4页与页码；pdfplumber确认正文13磅、小标题15.5磅、大标题28磅，页眉页脚10磅及文字页边界通过。正文和元数据已移除比赛安排、视频建议及开发验收过程，内部文字与凭据模式扫描通过。SHA256：`d3cfda87bb9f88049e92a5c270e135379ac5cb74032a90339b64c6a8969ee11d`。保留初赛PDF与旧版备份，未上传。
- 先前205项中有1项失败：旧测试要求的“未执行像素识别”说明在更新时丢失；恢复等价明确边界后，最新206项全部通过。旧失败日志保留，未靠删测试放行虚构识图。
- 实际页面重审`private/real-director-ui-wfU8Gp/report.json`通过：原文不变另存V2，5页PNG，1440/390无溢出、0页面异常。不是新生成全链路计时。
- 实际生态UI`private/real-delivery-ui-hQt5f0/report.json`通过：10项条件逐一确认，缺一项不可核对；恢复真实成品与3页PNG，0页面异常。无新推理或实机测试。
- 真实API与失败矩阵见[模型验收](REAL-MODEL-RESULTS.md)。以下历史阶段结果不相加、不覆盖最新记录。

## 2026-10-19 复赛本地增量

- PNG增量后完整回归**184/184通过**，0失败，165.700秒；`tmp/semifinal-visual-full-tests.log`。新增9项文档/实际无头浏览器渲染测试与1项HTTP导出，覆盖四版式、完整字序与原图hash、取消、HTML注入、分页上限、缺图和海报溢出。构建通过，`tmp/semifinal-visual-build.log`。
- 已目视检查真实Pura80原图规则稿封面/正文/条件页（`tmp/visual-review-zt1KuV/`）及双设备单页海报（`tmp/visual-poster-review-JAjr0z/01-poster.png`）。后者人工编排且带待审标记，均不属于真实模型创作证据。
- 分阶段采样与平台表达全量回归**188/188通过**，0失败，171.611秒（`tmp/semifinal-model-policy-full-tests.log`）；构建通过（`tmp/semifinal-model-policy-build.log`）。模拟HTTP证明发出的请求参数，不证明真实服务接受或创作质量。
- 随后用户授权本机模型接口：实际模型目录包含gpt-6.1-sol，Chat Completions带`reasoning_effort=high`连接测试返回`{"ok":true}`及同名model。响应没有回显推理档位，不能独立证明服务实际采用high。本机适配13/13专项通过，最终完整回归**190/190通过**，0失败，115.999秒（`tmp/semifinal-local-llm-full-tests.log`）；TypeScript检查通过。
- 第一条真实产品链路记录在`private/real-model-HRvIh4/`：MateBook14酷睿Ultra、大学新生、小红书；8次真实请求（意图、策划、写作、3次核验、2次局部修订），服务返回模型均为gpt-6.1-sol。四张真实原图内嵌HTML。最终`audit=review`、`releaseReady=false`，**不是正式通过案例**。独立语义审核认可正文，规则层仍对一段纯到店清单保留无引用警告；局部修订误将该警告用于改标题，未解决待复核状态。须改进场景建议判别与修订路由，不直接删除警告制造通过。人工阅读认为仍偏指导清单，营销语言尚需优化。
- 实际工作台已启动，bootstrap返回llmConfigured=true及gpt-6.1-sol；密钥仅在当前进程环境，不写入配置文件。验收脚本为隔离数据库，不覆盖用户作品；该链路未经过前端点击，不得称连续UI录屏已验收。
- 生态内容包增量后完整回归：**174/174通过**，0失败，68.717秒；日志 `tmp/semifinal-ecosystem-campaign-tests.log`。新增10项覆盖四平台独立执行、原创意和编辑文本传入模型、部分失败、审核状态独立、联动修改版本继承、跨平台/作品拒绝、取消、证据过期、重启恢复及HTTP接口。公开边界测试扩展到全部新增端点。合成响应只证明调用/数据/约束，不证明模型创意质量。
- 内容包增量 `npm run build` 成功（Vite30.69秒），日志 `tmp/semifinal-ecosystem-campaign-build.log`。本地服务已启动，真实HTTP读取bootstrap显示12型号、llmConfigured=false，新生态内容包列表接口200。无真实LLM效果结果，已提醒用户在本地设置配置模型，密钥不需发到聊天。
- 最新完整回归：`npx tsx --test --test-concurrency=2 --test-reporter=spec tests/*.test.ts` **164/164通过**，0失败，61.708秒；日志 `tmp/semifinal-ecosystem-tests.log`。新增生态阶段编排、串型号/假引用、缺图/伪图、独立核验不完整、越权修订/两轮上限、版本不覆盖、来源过期/变更、取消、导出转义与HTTP边界。全部模型返回为合成数据。
- 真实本地补充快照检查：Pura80共13组规格4张图，MatePad11.5 2026共15组规格4张图；HTML及图片SHA-256、图片签名/尺寸和读取检查通过。关系解析检查不等于实际手机/平板连接测试。
- 最新 `npm run build` 已通过；日志 `tmp/semifinal-ecosystem-build.log`。无远程上传。构建存在既有Zod注释、demo-adapter静态/动态混合导入提示，不影响成功退出。
- 当前待验收：真实模型创意和多设备语义准确率、实机适用条件、生态多平台实际成品质量及新后端匹配前端。本轮不进行前端改造或远程上传。

此前阶段记录：

- `npx tsx --test --test-concurrency=2 --test-reporter=spec tests/*.test.ts`：147/147通过，0失败，54.525秒。日志 `tmp/semifinal-unit-verified.log`。包含合成/模拟模型测试，无真实模型效果结论。
- `npm run build`：TypeScript和Vite构建通过；未上传。
- 新导演浏览器专项：桌面2/2、手机2/2，覆盖一句话规则体验→型号确认→方案选择→生成、简报变更失效、经典表单入口与关键字号，无外部模型调用。此后后端增量尚未执行完整全站浏览器回归。
- 首轮回归中的旧静态说明文字断言已按相同含义更新；新增重启测试的Windows SQLite清理顺序已修正。最终完整重跑无失败。
- 该阶段曾待验收：真实模型三案例、手机/平板官方资料、生态成稿、PNG导出、多平台前端完整交互；当前状态以上方最新增量为准。

以下是初赛历史记录，保留原日期与范围。

记录日期：2026-10-18（America/Los_Angeles）。开发验收证据，不是正式交付。未把mock、本地规则或自动化截图当成真实ima/模型运行。

## 当前实测

| 检查 | 已取得的证据 | 结论边界 |
| --- | --- | --- |
| `npm test` | 最新完整运行 **125/125通过**，0失败，耗时32.098秒 | 完整运行总数，不叠加历史专项；全部合成/mock，无真实付费调用，不代表线上交互验收 |
| ima图片并发 | 新增7项，联合既有ima专项20/20通过；同图7个调用者仅一次取链接/下载，失败后可重试，切换凭据/库拒绝旧响应，60秒缓存边界正确 | 全部mock；不解除供应商限额，不增加持久图片保存 |
| `npm run build` | 最近TypeScript与Vite生产构建退出码0；JS约322KB；后续结构/来源修复后TypeScript复查退出码0 | 不等于静态演示已验证或已部署 |
| `npm run build:demo` | 最终构建通过，含TypeScript；CSS68.82KB、JS432.26KB，`assets/index-DTt634o5.js`；云端与本地SHA-256一致 | 真实线上交互已另行检查，不能用构建结果替代；完整哈希见下文 |
| `npm audit --json` | 0 vulnerabilities | 当前安装依赖的已知漏洞审计，不保证绝对安全 |
| 8场景×4平台 | 自动用例内覆盖32组合通过 | 不是32次真实模型运行 |
| 实际本地快照矩阵 | 10型号×8场景×4平台，共320组合；192份安全联调稿、128个预期阻断、0意外失败 | 四个型号存在疑似尺寸错位，未修改来源；不是在线验收 |
| 浏览器工作流 | 最近一轮36个执行项：首轮32项通过，修正后其余4项复验通过 | 单独3101合成服务；不声称首轮36项全部通过，不将重复执行算作新增覆盖；与下述静态版独立记录 |
| 公开静态 e2e | `npx playwright test -c tests/e2e/demo.config.ts` 桌面/手机 **2/2通过**，验证生成、精简、海报切换、编辑风险提示、三格式导出、刷新历史、知识检索、无密钥与0 API | 3102本地静态服务；故意阻断官网图验证占位和不完整HTML，不把故障注入当作取图成功；不是最终线上QA或模型证据 |
| 本地模型与访问权限补测 | 桌面 **3/3通过**：默认规则/缺配置模型防误调、合成本地模型改写导出、受保护图片header读取与撤销清理 | `local-model.spec.ts` 与 `public-access.spec.ts`；合成模型，非真实LLM；与125项完整测试分开记录，不相加冒称新的完整总数 |
| 公开规则实际三案例 | 开学季/小红书、职场办公/公众号、门店到访/朋友圈，3场景×Markdown/HTML/JSON共9导出；HTML官网图片内嵌3/3、2/2、1/1，0 API调用；四张桌面/手机真实截图 | 本地实际规则运行；JSON均demo=true、engine=local-composer、releaseReady=false，不是三组正式模型案例；与下述线上实测分开记录 |
| 最终魔搭实际线上验收 | `passed=true`，三场景×桌面/手机6项＋平台转换/编辑版本1项共7结果；三格式导出、HTML内嵌3张官网图、刷新历史、无密码设置通过；0应用API请求、0页面异常、无横向溢出；连续视频已保存 | 实际站点与官方图片，未拦截接口替换结果；这是公开规则演示验收和规则录屏，不是模型生成或正式AI验收 |
| 离线包真实本地资料 | 3案例×桌面/手机=6/6通过；内嵌图片3/2/1全部成功解码、0HTTP外联、0页面异常，无横向溢出；8文件hash一致 | Edge offline=true且拦截HTTP；不提供实时生成，不代表ima或模型 |
| 本机3000真实快照UI | 已实际生成V1并编辑V2；恢复已保存V2后三图加载、Markdown 7,149B/HTML 1,584,406B/JSON 23,456B下载通过；0页面重载、0JS异常、0ima/外部请求 | 初次浏览器验证被开发文件监听刷新打断；修复后按已保存run恢复，未重新生成或删除记录。仅本地规则稿 |
| 真实ima | 2026-10-18T06:29:34Z连接成功；06:30:05.871Z取得MateBook14鸿蒙版12事实维度/4图；首次4图HTTP200；重启前2图200后2图额度阻断 | 06:50:51Z单图复核仍额度错误，已停止进一步调用；完整复验未通过 |
| 真实LLM | 未配置可用模型服务/模型/Key；选择模型且缺配置时预检查返回LLM_MISSING | 本机保留可选模型路径，无需ima额度；默认规则不要求模型，真实生成与独立核验未完成 |
| 结构与导出来源 | 空标题/导语/CTA/正文被结构拦截，即使语义mock返回通过也不放行；合法短海报通过；Markdown/HTML保留本次全部事实 | 此轮32项专项中包含上述回归；未调用真实模型 |
| 作品说明书 | 最终9页全部视觉检查通过，末次修改的8/9页重新渲染核验；pypdf确认9页、文本秘密扫描通过。本次发布附 `docs/作品说明书.pdf` | 自研说明书，记录公开规则演示、完成项与真实模型待办；不包含原始赛题PDF或私有原库，不是正式比赛提交 |
| 源码预览打包与推送 | 首批108文件清单核验通过，已推送GitHub；首批提交02af3ebd516751ab412256d401f4c4b27c4aff27，本次发布附文档与作品PDF | 原库、原图、凭据、数据库及vendor排除；自研作品说明书与原始赛题PDF严格区分 |
| 静态公开预览 | `build:demo` 类型检查后以 `base=./` 输出独立 `dist-demo/`；`preview:demo` 端口4174；`package:demo` 只扫描暂存到 `output/static-demo-<时间>/`，当前4个构建文件＋专用README | 无私有目录与自动上传；最终构建已发布，线上规则交互另取得通过证据 |
| Docker / GitHub / 魔搭 | [GitHub 仓库](https://github.com/jixie1111/zhixu-huawei-pc-agent)源码已push；[魔搭创空间](https://modelscope.cn/studios/jixie1111/zhixu-huawei-pc-demo)最终提交d8fb1fff3b836f81e9c7caebb48c917df27dbf61已Running；Visibility=5、NeedLogin=false，游客详情200，实站交互通过；Docker未实跑 | 本次为已完成线上验收的静态规则预览，不依赖Docker，不表示正式AI验收通过 |

## 证据位置与复现

- `tests/*.test.ts`：单元/接口、安全、来源、持久化、打包及离线包测试。
- `tests/e2e/`：桌面/移动合成服务回归；`tmp/ui-*.png`为带QA标记的真实浏览器截图。
- `private/demo-2026-10-18T07-10-38-149Z/`：含本机使用的资料片段和原图，不随源码公开。MANIFEST明确formalOnlineAcceptance=false。
- `tmp/offline-demo-qa/report.json`及截图：断网检查结果。复现命令为 `npm run demo:verify -- private/demo-<时间>`；不联网取证。
- `private/qa-local/export-resume-2026-10-18T07-27-57-438Z/report.json`：实际本地UI生成/编辑后恢复三导出的证据，关联父稿与V2；不是一次无中断全流程录像。`tests/local-export-resume.ts`只恢复本地QA稿，不再生成，禁止外部/ima请求。
- `docs/作品说明书.pdf`：本次发布附自研说明书；自动源码打包器仍排除原始PDF，作品PDF单独审核后加入发布。
- `dist-demo/` 与 `output/static-demo-<时间>/`：独立静态构建和扫描后的上传暂存。复现为 `npm run build:demo`；本地预览 `npm run preview:demo`，已有构建重新暂存 `npm run package:demo`。这些命令不调用真实模型或上传。
- `output/source-preview-2026-10-18T08-26-15-249Z/`：源码发布工作目录，首批108文件清单核验通过；本次文档/PDF以正常更新提交附入，不覆盖远端历史。
- `tests/e2e/demo.config.ts`、`tests/e2e/static-demo.spec.ts`：独立静态桌面/手机回归，使用本机3102，包含明确的官网图失败注入。
- 本地模型/权限补测复现：`npx playwright test tests/e2e/local-model.spec.ts tests/e2e/public-access.spec.ts --project=desktop --output=tmp/e2e-local-final`；使用合成服务与模型，不调用真实模型。
- `output/public-demo/`：三个实际规则场景的九份导出；`tmp/ui-public-demo-{workspace,result}-{desktop,mobile}.png`：四张真实浏览器截图。其内容为公开官网摘要和规则结果，不属于正式模型运行证据。
- `private/public-live-2026-10-18T08-38-03-345Z/report.json`：最终真实线上报告，2026-10-18T08:38:04.012Z，`passed=true`、7结果、空errors与apiRequests；同目录保存实际三格式导出、桌面/手机截图与连续WebM视频。复现：`npx tsx tests/public-demo-live.ts private/modelscope-info-result.json`，也可向脚本传入实际HTTPS应用地址；支持平台iframe，无响应mock。
- 最终云端与本地 `assets/index-DTt634o5.js` SHA-256一致：`08cb19c8900385e42e859be0a95585cec1493f9bb70d99c1f7e0ef91b82b0add`。Studio最终提交 `d8fb1fff3b836f81e9c7caebb48c917df27dbf61` 为Running；[实际应用地址](https://jixie1111-zhixu-huawei-pc-demo.ms.show/)已按游客访问验证。

## 检查范围与已修复问题

需求缺失追问、八场景四平台、同型号事实图片、冲突停机、数字/单位完整引用、营销合规、提示注入、模型官方端点/SSRF、配置脱敏、生成取消、版本关系、SQLite重启、HTML/Markdown/JSON导出、来源路径约束、公开权限及跨站写入、ima分页回退、媒体签名/重定向/大小/持久索引、源码秘密误填阻断、离线自包含与覆盖保护均有测试。

通过测试修复：相近型号图片混入；普通“第一堂课”误报；图片名篡改；来源链接不安全；16GB错误支持6GB、70Wh错误支持70W；版本关系丢失；清除凭证缺JSON标记；伪图混入；改写未带原稿；导出遗漏正文之外图片；重复标点；历史ima图片跨重启索引；公开模式误读本地快照/旧私有历史；嵌入策略冲突；forwarded/内部Host导致公开来源判断不明确；无模型先耗ima额度；逐字输入标签空格吞掉。安全检查不是广告法律意见或全面漏洞保证。

实际快照UI验收发现并修复：Vite默认监听私有输出中的HTML，保存图文草稿会触发编辑页重载。已排除private/tmp/output/vendor及测试报告目录，并禁止静态读取这些目录。修复后对同一V2稿逐份下载并观察文件监听窗口，0文档重载；HTML图片全部内嵌。

实际源码打包还发现：空白密钥字段后的换行被扫描正则当作空白吞掉，误把下一行配置名判断为密钥值。改为只匹配同行空格/制表符，加入CRLF空字段正例；真实非空密钥、Client ID与正文秘密误填仍被阻断。该修复后打包专项3/3通过；应用逻辑未改，不重复整套浏览器测试。

实际部署发现：Node访问静态首页HTTP200、平台Running时，真实游客浏览器仍跳到平台404。已从平台前端核对可见性枚举并修正为Visibility=5、NeedLogin=false，游客详情随后200；未改应用代码或放开私有API。修正后独立线上浏览器验证通过，避免用单个HTTP状态代替实际可用性判断。

## 未完成

真实本地知识库＋模型生成和语义审核、至少三组正式模型结果、真实模型连续录屏、现场统一任务仍未完成。GitHub源码已推送，本次发布附作品说明书PDF；魔搭最终规则演示已公开且完成真实线上交互和连续录屏验收。现有规则结果及视频不替代正式AI证据。原始知识库/图片的公开许可不因允许本地调用而扩大。ima完整复验独立保留待办，不阻塞规则预览；应用429是内部映射，不可冒称供应商原始HTTP状态，本地24小时冷却也不是供应商额度重置保证。
