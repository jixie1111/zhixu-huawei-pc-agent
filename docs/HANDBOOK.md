# 说明书 PDF 的可复现制作

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
