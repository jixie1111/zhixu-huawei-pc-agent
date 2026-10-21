# 真实模型验收 · 物有言复赛本地版

更新：2026-10-19（America/Los_Angeles）。真实模型已接通，不再以初赛公开规则版替代模型效果。当前使用用户授权的本机OpenAI兼容接口、`gpt-6.1-sol`；按用户要求从`high`切到`low`。本机模型目录未列出独立light模型ID。发送`reasoning_effort`与16000 completion-token上限，不发送温度；服务未回显推理档位，不能独立证明执行档位。密钥不以明文写入文件、报告或导出；本机启动配置仅在private保存当前Windows用户DPAPI密文。

通过`npm run check:local`核对模型目录，`npm run start:local -- -Port 3003`从加密配置恢复本机生产服务、端点授权和请求low；不修改全局系统环境。网页会话值仍优先于环境变量，清除会话回到启动器的low环境值。网页不可借此修改本地端点白名单。

## 证据分级

- 单测与3101浏览器回归使用合成资料/模拟模型，只验证协议、状态、安全和交互。
- `scripts/verify-real-model.ts --run`使用真实模型，保存阶段、请求参数、响应model、usage、时间、哈希与最终assistant内容，不保存隐藏推理或凭据。数据库隔离，不覆盖用户作品。
- `tests/real-director-live.ts --run`操作实际本机页面；默认3000，当前验收显式指定`--base=http://127.0.0.1:3003`。不替换响应、不调用ima。全新生成、恢复旧稿与重新核验分别标记。
- PNG是实际原图与文字排版，不是场景生图。自动核验通过不代替发布前人工审核及素材许可。

## 已完成的真实案例

前三例是同一MateBook14酷睿Ultra、同为小红书、不同受众任务，不是千店规模实测。

| 本机私有记录 | 实际任务与结果 |
| --- | --- |
| `private/real-director-ui-RSB5mf/` | 策略v3校园小红书，真实页面全链路101.918秒，请求low、0修订、passed、4页PNG。围绕给期末的自己写两句话，将键盘/触控板与屏幕用于输入和读回任务。全文和全部PNG已人工检查。 |
| `private/real-director-ui-MaOPk6/` | 策略v3商务小红书，真实页面全链路86.725秒，请求low、0修订、passed、4页PNG。相同型号与平台，改为出差汇报前准备线材，产品事实转为接口，体验邀请也随任务改变。全文和全部PNG已人工检查。 |
| `private/real-delivery-ui-Xb66TA/` | 最新中性图片描述修复后，从校园原稿通过页面全新生成朋友圈+公众号，134.567秒，两份均passed、0页面异常，保留父链。朋友圈2页PNG已检查；随后恢复既有生态稿、条件确认和3页导出通过，无新生态推理。 |
| `private/real-director-ui-VjuL1Q/` | 仅实际页面恢复上述公众号稿并导出4页PNG，已逐页检查；没有重新生成，不作为新推理计时。 |
| `private/real-director-ui-uknwi7/` | 第一轮内容包公众号原文及英文标签不变，通过页面另建V2重审；passed，4页PNG已检查。不是新全文生成，原失败稿不覆盖。 |
| `private/real-revision-ui-UNAmDn/` | 恢复实际UI产生的错误优惠/续航挑战V2；成稿无800元和99小时，输入风险、原稿及父链保留，passed，1440/390无溢出、0页面异常。服务端原生成21.565秒；本次恢复没有新推理。第一轮观察过程见kynqan，不冒称连续UI计时。 |
| `private/real-model-5fcPgM/` | 商务小红书，passed，0轮修订，4张原图。 |
| `private/real-model-D1mH2P/` | 家庭小红书，passed，1轮修订，4张原图。普通序数曾误拦截，原过程保留。 |
| `private/real-model-iKvJwP/` | 校园小红书，passed，0轮修订，3张原图；有本机历史上下文，未触发重策划。 |
| `private/real-model-EkMzuQ/` | 家庭小红书改商务公众号；要求直降800元、续航99小时，成稿未包含二者，输入风险/父链保留，passed，3张原图。 |
| `private/real-ecosystem-MNHjz2/` | 限定手机平板/系统/10项条件的朋友圈，真实模型83.032秒、passed、0轮修订，3页PNG。非实机连接测试。 |
| `private/real-director-ui-wfU8Gp/` | 页面真实生成稿原文不变，修复普通序数规则后通过页面创建V2重审；passed、5页PNG，1440/390视口无溢出。不是新的完整生成。 |
| `private/real-delivery-ui-hQt5f0/` | 生态页面逐项选择系统与10项条件，缺一项禁用核对；恢复已保存真实生态稿、3页PNG下载，0新生态推理。 |
| `private/real-delivery-ui-AqHts0/` | 从真实校园稿通过页面生成朋友圈+公众号，两份均passed，完整内容包182.460秒；父链、各自核验与3页朋友圈PNG保留，随后生态恢复/导出也通过。 |
| `private/real-director-ui-RaSEhF/` | 平台策略v2、请求high；真正从一句话开始的新页面全链路，140.894秒，passed、0修订、5页PNG、1440/390无溢出。不是旧稿重审。 |
| `private/real-director-ui-wjvTkh/` | 同任务、平台策略v2、请求low；新页面全链路85.362秒，1次局部修订后passed、5页PNG、1440/390无溢出、0页面异常。修订只涉及一个段落。 |
| `private/real-director-ui-m783UH/` | 卡片仅显示读者问题后的最新页面；请求low，完整新生成89.382秒、0修订、passed，5页PNG、1440/390无溢出、0页面异常。真实策划响应另存plan.json并断言页面未显示内部angle。 |

此前v2阶段的high/low使用同一输入与型号，但历史作品上下文已有新增、创意和文案不同，因此只是三次真实运行记录，不是受控性能基准或稳定加速保证。该阶段low两次为85.362与89.382秒。计时从点击整理需求到新作品保存，包含策划、写作、核验及可能修订；PNG导出另计。操作4次指输入、整理、确认策划、生成，不含输入字数与等待，导出另外一次点击。

此前v2两个low案例各5页PNG已人工阅读全文并目视检查：封面使用整机原图，森林屏幕演示图标明非整机实拍；全部正文及适用说明保留，未出现虚构亲测或未经证实的优惠。后续v3加强了产品任务关联、整机与细节选择及流式合页，最新结果见表中质量收尾案例；不将审核通过等同于营销效果已验证。

多平台案例使用平台策略v1。后续v2已改为让公众号沿选定故事/观点/决策体裁展开，而非一律体验清单；用读者设问/未来计划代替“以下不是买家经历”等写作自我解释。旧v1案例不会重标为v2效果。

字面相似度不等于创意效果。校园稿出现微叙事、轻对话与操作习惯切口，部分商务稿仍偏选购清单；营销吸引力需业务人员阅读与门店试用，不以测试或温度代替质量判断。

## 失败记录与实际修复

- `real-delivery-ui-eoDGpV`：朋友圈通过，公众号因“第一篇资料”普通序数被误阻断。增加有限序数例外并保留全球/行业/全网排名拦截，原文不变重审另存V2。未删除原失败稿。
- `real-director-ui-zbk1ks`：重审发现编辑器按空格拆开`HUAWEI MateBook 14`话题，原文不变断言失败。改为每行一个标签、按换行保存，单词间空格保留；后续uknwi7的整篇article深比较通过。
- `real-delivery-ui-uSs0ad`：朋友圈通过；公众号唯一阻断是索引自带的“舒适键盘细节”无法由图片或事实证明舒适度。保留原始sourceDescription，只有精确型号和SHA256人工复核的原图使用中性caption，不改原图、索引或历史稿；后续Xb66TA两平台均通过。
- `tmp/quality-wechat-unchanged-recheck.log`：一次服务尚未就绪的ECONNREFUSED，未调用模型，不作为生成失败或成功案例。
- `real-revision-ui-kynqan`：真实UI已生成并保存通过的`a8596141-9056-4051-9518-25346c6ba8c8`，但验收脚本等待SSE的`Response.finished()`挂起，观察进程被中止。改用有界等待实际新版本UI，另以`--resume`恢复同一作品完成安全和页面审读于UNAmDn，没有重复模型调用。第一轮记录为interrupted，不算完整UI通过。
- `real-model-HRvIh4`：首条真实链路最终review；无引用纯场景建议误路由标题修订。新增独立逐段分类与精确字段修订，不把旧稿改成成功。
- `real-model-QyJZ6m`：模型附带`reviewNotes`导致严格schema拒绝。现在对这一已知字段有界接收后丢弃，不进入正文、导出或审核权威，其他未知字段仍拒绝。
- `real-ecosystem-teE1Gs`：配图理由含无引用功能断言，正确阻断；提示功能进入有证据的正文，重新生成MNHjz2通过。
- `real-director-ui-6BdatZ`/`wvORlP`：普通序数误报与核验缺原图用途注释。修复上下文和序数边界，不删除实质行业排名检查。
- `real-director-ui-FBfgDq`：真实策划超时，无成稿。改为504/LLM_TIMEOUT中文提示；维持两分钟阶段上限，不自动重试或降级。
- `real-director-ui-BGH7pG`：141.032秒完成意图/策划/创作，唯一阻断“第一门课”。保留原稿后修复规则，原文通过页面创建V2重审，见wfU8Gp。
- `real-delivery-ui-VHmH17`：QA脚本误用“朋友圈”找实际“门店朋友圈”按钮，未请求模型。修正选择器后继续，不算平台模型生成失败。

## 复现

先运行`npm run check:local`、`npm run start:local -- -Port 3003`。以下全新生成的`--run`会消耗真实推理，不循环挑选通过结果：

```powershell
npx tsx tests/real-director-live.ts --run --base=http://127.0.0.1:3003
npx tsx tests/real-delivery-live.ts --run --source=已通过的真实模型作品UUID --base=http://127.0.0.1:3003
npx tsx tests/real-revision-live.ts --run --source=已通过的真实模型作品UUID --base=http://127.0.0.1:3003
# 无新生态推理：条件确认、恢复旧稿与导出。
npx tsx tests/real-delivery-live.ts --run --ecosystem-only --base=http://127.0.0.1:3003
```

旧稿重审：`tests/real-director-live.ts --run --resume=旧稿UUID --recheck`，必须保留原文另建子版本，不能称全新生成。`--resume`不带`--recheck`只恢复旧稿。

挑战成品恢复：`tests/real-revision-live.ts --run --source=原稿UUID --resume=实际改写子版本UUID --base=http://127.0.0.1:3003`。只审读已完成作品，不重跑推理，报告明确标记newGeneration=false。

记录只在`private/`，不推送、不公开原库。初赛ModelScope鉴权401是历史问题；本轮使用本机模型解除服务依赖，不表示原账号已修复。复赛成片尚未制作，截图和初赛规则录屏不替代复赛模型视频。
