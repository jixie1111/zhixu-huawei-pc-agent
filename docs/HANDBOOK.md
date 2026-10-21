# 说明书 PDF 的可复现制作

## 复赛本地版

`scripts/build-semifinal-handbook.py`生成独立6页《物有言-复赛作品说明书.pdf》，输出到`output/pdf/`。新版介绍产品定位、一句话创作流程、七步生成与图文交付、发帖人设、事实出处与独立核验、资料与发布。截图和真实导出图来自`private/handbook-2026-10-21/`，与当前浅灰白、蓝色按钮的前端一致；不读取密钥、运行环境或完整知识库。初赛PDF和`output/pdf/旧版/`中的历史版本保留。

使用本机有许可的中文字体和ReportLab生成。正文12.5磅、行距20.25磅，小标题15磅，大标题26磅，副标题12.5磅、图注10磅，页眉10磅、页脚9.5磅。生成后必须将全部6页渲染为PNG，逐页检查换行、留白、图文对齐与阅读清晰度。中文换行保留短按钮名称，并避免闭引号或逗号单独落在行首。比赛安排、视频建议、调试记录、模型档位和测试数量不写入正文；截图保留真实界面状态。

2026-10-21新版：沿用真实页面截图与真实PNG导出图，修正第2页按钮引号换行、第4页人设截图图注的短末行，以及第5页风险示例图注。风险图注只描述截图中实际展示的三项问题。最终6页均经Poppler渲染并逐页目视检查。

```text
python scripts/build-semifinal-handbook.py
pdftoppm -r 130 -png output/pdf/物有言-复赛作品说明书.pdf tmp/pdfs/wuyan-guide-clean
```

可通过`--assets`指定截图目录、`--output`指定PDF输出路径，通过`--font`和`--bold-font`指定中文字体。正文与截图必须一起核对；重新生成后重新检查全部页面。

以下为保留的初赛说明书制作流程，不用旧截图和“模型未配置”状态覆盖复赛实测。

## 初赛版（历史）

`scripts/build-handbook.py` 生成 9 页中文作品说明书，默认写入 `output/pdf/知序-作品说明书-验收草稿.pdf`。它不联网、不上传，也不读取运行密钥、原始知识库或数据库。

## 输入

- `docs/handbook-status.json`：已验证的测试、构建与线上状态。只能根据实际命令结果更新，不能填预计成绩。
- `tmp/ui-public-demo-workspace-desktop.png`、`tmp/ui-public-demo-result-desktop.png`：真实免 API 规则演示截图，由状态文件指定。缺少文件时显示明确的待采集占位，不伪造界面。
- 本机有许可的中文 TrueType 字体：默认使用 Windows 微软雅黑；其他系统需通过 `--font`、`--bold-font` 指定路径。字体不随项目打包。

## 生成和核验

需要 Python、ReportLab 和 Poppler（PDF 栅格化检查）。这些只用于材料制作，不影响 Node 应用启动。在提供这些依赖的环境执行：

```text
python scripts/build-handbook.py --font PATH_TO_CJK_FONT --bold-font PATH_TO_CJK_BOLD_FONT
pdftoppm -r 90 -png output/pdf/知序-作品说明书-验收草稿.pdf tmp/pdfs/handbook
```

重新生成后必须逐页检查：页面数量、文字溢出、图表、截图真实性、中文字体与页脚。PDF 生成成功不等于完成视觉验收。当前脚本写明的正式案例为待完成；以后需要补入真实案例及运行证据，再更新页数与版式。

经逐页视觉检查后的说明书可单独加入 GitHub 预览包的 `docs/作品说明书.pdf`；原始资料库仍不公开。该说明书是预览验收材料，不作为正式提交。
