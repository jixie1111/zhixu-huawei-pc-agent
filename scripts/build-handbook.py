"""Build the local, evidence-labelled submission handbook. No network or upload.

Requires reportlab and a licensed CJK TrueType font supplied by the host.
Screenshots and verification states are selected by docs/handbook-status.json.
"""
import argparse
import json
import os
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph

ROOT = Path(__file__).resolve().parents[1]
W, H = 595.276, 841.89
M, CW = 44, 507.276
INK = colors.HexColor('#263c33')
GREEN = colors.HexColor('#365d49')
MUTED = colors.HexColor('#6b796b')
LINE = colors.HexColor('#dfe5d9')
PAPER = colors.HexColor('#fafbf7')
SOFT = colors.HexColor('#eaf0e3')
SAND = colors.HexColor('#f4ecdb')
RED = colors.HexColor('#9e5a4c')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--font', default=os.environ.get('HANDBOOK_FONT', 'C:/Windows/Fonts/msyh.ttc'))
    parser.add_argument('--bold-font', default=os.environ.get('HANDBOOK_BOLD_FONT', 'C:/Windows/Fonts/msyhbd.ttc'))
    parser.add_argument('--output', default=str(ROOT / 'output/pdf/知序-作品说明书-验收草稿.pdf'))
    args = parser.parse_args()
    for name, filename in [('CJK', args.font), ('CJKB', args.bold_font)]:
        if not Path(filename).is_file():
            raise SystemExit('请用 --font / --bold-font 指定本机有使用许可的中文 TrueType 字体。')
        pdfmetrics.registerFont(TTFont(name, filename, subfontIndex=0))
    pdfmetrics.registerFontFamily('CJK', normal='CJK', bold='CJKB')
    state_file = ROOT / 'docs/handbook-status.json'
    state = json.loads(state_file.read_text(encoding='utf-8'))
    out = Path(args.output).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(out), pagesize=(W, H))
    c.setTitle('知序 · 华为 PC 营销图文智能体 - 作品说明书验收草稿')
    c.setAuthor('jixie1111 / 知序')
    c.setSubject('作品预览说明；区分免 API 规则演示与模型创作，不是正式比赛提交')

    def text(value, x, top, width=CW, size=10, leading=None, color=INK, bold=False):
        p = Paragraph(value, ParagraphStyle('p', fontName='CJKB' if bold else 'CJK', fontSize=size,
                      leading=leading or size * 1.75, textColor=color, alignment=TA_LEFT,
                      wordWrap='CJK', allowWidows=0, allowOrphans=0))
        _, height = p.wrap(width, H)
        if top < 790 and top + height > H - 50:
            raise ValueError(f'页面内容越界：{value[:45]} ({top + height:.1f})')
        p.drawOn(c, x, H - top - height)
        return top + height

    def box(x, top, width, height, fill=SOFT, border=None, radius=10):
        c.setFillColor(fill)
        c.setStrokeColor(border or fill)
        c.roundRect(x, H-top-height, width, height, radius, fill=1, stroke=bool(border))

    def line(top, x=M, width=CW):
        c.setStrokeColor(LINE)
        c.setLineWidth(.65)
        c.line(x, H-top, x+width, H-top)

    def page(number, kicker, title, subtitle):
        c.setFillColor(PAPER)
        c.rect(0, 0, W, H, fill=1, stroke=0)
        text('知序 ZHIXU / 作品说明书', M, 26, size=8, color=MUTED)
        text('验收草稿 · 未正式提交', 397, 26, width=155, size=8, color=RED)
        line(49)
        text(kicker, M, 76, size=8.5, color=GREEN, bold=True)
        text(title, M, 100, size=25, leading=35)
        text(subtitle, M, 148, size=10, color=MUTED)
        line(792)
        text('来源可追溯 · 发布需审核', M, 804, size=8, color=MUTED)
        text(f'{number:02d} / 09', 500, 804, width=55, size=8, color=MUTED)

    def section(title, content, top, width=CW, x=M):
        top = text(title, x, top, width, size=12, bold=True, color=GREEN)
        return text(content, x, top+7, width, size=10, color=INK) + 20

    def table(headers, rows, top, widths, size=9.2):
        cells = [headers] + rows
        for index, row in enumerate(cells):
            heights = []
            for value, width in zip(row, widths):
                p = Paragraph(value, ParagraphStyle('table', fontName='CJKB' if index == 0 else 'CJK',
                    fontSize=size, leading=size*1.65, wordWrap='CJK'))
                heights.append(p.wrap(width-20, H)[1]+19)
            height = max(heights)
            if top + height > 773:
                raise ValueError(f'表格越界：{row[0]}')
            box(M, top, CW, height, SOFT if index == 0 else (colors.white if index % 2 else PAPER), radius=0)
            x = M
            for value, width in zip(row, widths):
                text(value, x+10, top+9, width-20, size=size, leading=size*1.65, bold=index == 0)
                x += width
            top += height
            line(top)
        return top

    def screenshot(filename, top, max_height, caption):
        file = ROOT / 'tmp' / filename
        if file.is_file():
            image = ImageReader(str(file))
            iw, ih = image.getSize()
            scale = min(CW/iw, max_height/ih)
            width, height = iw*scale, ih*scale
            x = M+(CW-width)/2
            c.drawImage(image, x, H-top-height, width=width, height=height, preserveAspectRatio=True)
            c.setStrokeColor(LINE)
            c.rect(x, H-top-height, width, height, fill=0, stroke=1)
        else:
            height = min(max_height, 100)
            box(M, top, CW, height)
            text('界面验收截图待生成', M+20, top+20, CW-40, size=12)
            text('不以设计稿或虚构运行画面代替真实界面截图。', M+20, top+50, CW-40, size=10, color=MUTED)
        return text(caption, M, top+height+9, size=8.5, color=MUTED)+20

    # 1: product, not a completion claim.
    page(1, 'PRODUCT / 产品定位', '让表达，有据可循。', '知序 · 面向华为 PC 门店营销的图文创作与核验工作台')
    box(M, 194, CW, 104, SOFT)
    text('从一份可信的简报，到一份可追溯的图文。', M+20, 212, CW-40, size=15, bold=True)
    text('理解人群与场景，按具体型号组织事实和图片；自研 Agent 负责策略、编排、核验、改写与导出。提供免 API 规则演示与可选模型创作。', M+20, 247, CW-40, size=10)
    end = screenshot(state.get('workspaceImage', 'ui-workspace-desktop.png'), 320, 307, state.get('screenshot', '界面截图：隔离 QA 环境，产品和素材为合成测试数据；不是正式模型运行结果。'))
    end = section('阅读说明', '公开预览可免 API 体验规则编排。本机完整版本保留授权知识库与模型接入；真实模型生成、三组模型案例及现场任务仍需验收，不能用规则结果替代。', end)
    text(f'证据更新：{escape(state["date"])} · 发布账号 jixie1111；访问地址见第 9 页。', M, end, size=8.5, color=MUTED)
    c.showPage()

    # 2: the actual user workflow.
    page(2, 'EXPERIENCE / 使用流程', '把复杂流程，放进一个工作台。', '五个工作页面，明确区分创作、来源、历史、核验和连接。')
    top = table(['页面', '主要操作与边界'], [
        ['创作工作台', '选具体型号、人群、场景、阶段、目标和平台；缺少必要信息先提示补充。显示检索、生成、核验进度，可取消等待。'],
        ['产品知识库', '本机查询已授权原库；公开演示仅含核对过的官网精简摘要与原站图片链接，不公开原始 ZIP、私人记录或完整资料目录。'],
        ['作品记录', '保留每次输入、引擎、版本、策略、证据和核验状态；编辑与换平台创建新版本，不覆盖原稿。'],
        ['核验中心', '对独立文字扫描营销合规风险；明确不声称完成逐项产品事实认证。完整事实核验在有来源的创作流程执行。'],
        ['连接设置', '免 API 演示无需填写密钥。本机模型配置与连接测试分开；网页配置是临时覆盖，重启持久配置用 .env 或平台 Secret。'],
    ], 196, [105, CW-105])
    top = section('推荐操作路径', '直接打开免 API 演示 → 填写简报 → 生成 → 检查图文、策略、知识依据与核验四个面板 → 修改并再次核验 → 导出。本机模型模式另需连接并测试模型服务；存在风险时只导出诊断稿。', top+25)
    section('真实状态，始终可见', '规则演示、模型创作，以及官网摘要、本地知识库、ima 来源分别标注。缺少模型配置不会伪装模型成功；规则稿始终保留待人工审核提示。', top)
    c.showPage()

    # 3: a real information-flow visualization.
    page(3, 'ARCHITECTURE / 系统架构', '业务规则与证据，先于模型表达。', 'React / TypeScript / Vite + Node.js / Express / Zod / SQLite')
    layers = [
        ('浏览器工作台', '结构化简报 · 事件流进度 · 四面板结果 · 修改与导出'),
        ('服务入口与自研编排', '同源与权限检查 · 限流 · 需求校验 · 场景和平台策略'),
        ('资料与创作节点', '官网摘要 / 本地库 / 可选 ima → 规则编排或模型创作'),
        ('独立核验与持久化', '引用 / 数值 / 图片 / 合规 → 模型语义复核（可选）→ 版本'),
    ]
    for i, (title, description) in enumerate(layers):
        y = 198+i*92
        box(M, y, CW, 72, SOFT if i % 2 == 0 else colors.white, LINE)
        text(f'0{i+1}', M+16, y+15, 36, size=16, color=GREEN)
        text(title, M+60, y+12, CW-80, size=12, bold=True)
        text(description, M+60, y+39, CW-80, size=9.3, color=MUTED)
        if i < 3:
            c.setStrokeColor(GREEN)
            c.line(W/2, H-y-75, W/2, H-y-89)
            c.line(W/2, H-y-89, W/2-3, H-y-85)
            c.line(W/2, H-y-89, W/2+3, H-y-85)
    top = section('模型边界', '模型只接收本次任务和允许引用的事实、图片 ID。资料中的操作语句不是系统指令。模型不能自建图片链接，引用不存在、型号不符、资料冲突或原图不可读取时必须阻断。', 588)
    section('版本与存储边界', '本机使用 SQLite；静态演示在当前浏览器保存有限历史，不上传到服务器。改写保留父版本并重新核验；旧稿不能作为新增事实来源，也不能继承旧版通过状态。', top)
    c.showPage()

    # 4: exact source and quota statements.
    page(4, 'EVIDENCE / 三种资料来源', '来源说清楚，演示才能被复核。', '按用户补充指示支持本地调用；原始赛题 PDF 保留不改。')
    top = table(['资料方式', '实现行为与使用范围'], [
        ['公开免 API 演示', '采用独立核对的华为官网型号规格摘要和原站图片链接；在浏览器按场景与平台编排，不包含原始资料库，不调用模型。'],
        ['本机完整知识库', '用户转述主办方已允许本地部署调用。保留原文、原图和型号索引；可用规则演示，也可接真实模型创作与核验，不依赖 ima 额度。'],
        ['ima 可选接入', '通过官方 CLI 检索指定共享库，保留原文、图片与型号绑定。账号、权限、原文件额度仍由供应商管理，不暗中改变来源。'],
        ['商城补充参考', '用户另行允许华为商城参考。核对具体型号、年份及配置，保留来源与读取日期后再采用；不以首页证明参数、价格或库存。'],
    ], 196, [110, CW-110])
    box(M, top+22, CW, 134, SAND)
    text('已取得的真实资料证据', M+18, top+36, CW-36, size=12, bold=True)
    text('原始两份 ZIP 的 1,522 个文件逐一 SHA-256 相同。本机已索引 1,343 份资料、53 张图片、10 个型号；四个型号的疑似尺寸冲突保留并阻断，不擅改原文。', M+18, top+63, CW-36, size=10)
    text('公开演示另行读取官网规格页及三张同型号原站图片，均 HTTP 200；与私有 ZIP 分开管理。', M+18, top+111, CW-36, size=9, color=GREEN)
    top += 177
    top = section('图片与额度边界', 'ima 曾成功取回单型号 12 个事实维度和 4 张图片，复查仍遇原文件额度限制。免 API 演示不受该额度影响；官网原站图片需要网络，导出会如实标注未能内嵌的图片。', top)
    text('依据：原手册与用户后续补充指示，见 docs/SOURCE-POLICY.md；原始知识库不随公开源码分发。', M, top, size=8.5, color=MUTED)
    c.showPage()

    # 5: eight prompt modules and platform requirements.
    page(5, 'STRATEGY / 策略与提示词', '不是把同一篇文章，缩短四次。', '八业务场景 × 四平台；购买阶段与内容目标参与策略选择。')
    top = table(['平台', '图文结构', '图片'], [
        ['小红书', '口语标题、短段落、场景清单、互动标签；不伪造亲测体验。', '3-6 张'],
        ['公众号', '场景导语、问题拆解、事实价值、适用边界、预约体验。', '2-4 张'],
        ['朋友圈', '短文案、一个核心卖点、私信或到店理由。', '1-3 张'],
        ['海报', '主副标题、不超过三个卖点、简短行动说明。', '1 张'],
    ], 195, [80, CW-147, 67], size=9.3)
    top = section('业务场景', '开学季、职场办公、内容创作、家庭换新、企业采购、门店到访、新品首发、节日营销分别定义问题与事实优先级。了解产品强调需求，准备购买强调版本与条件，到店阶段转为可现场验证的步骤。', top+22)
    text('系统提示词的八个模块', M, top, size=12, color=GREEN, bold=True)
    items = [('角色与任务', '有依据的原创图文'), ('场景理解', '人群、阶段、问题与目标'), ('平台规则', '结构、语气、图数与引导'), ('知识库约束', '限定型号与版本条件'), ('图片规则', '已给定 ID、位置与理由'), ('生成要求', '结构化输出与原稿改写'), ('核验规则', '无依据删除、冲突停止'), ('合规规则', '不虚构权益、体验与排名')]
    for i, (a, b) in enumerate(items):
        x = M+(i % 2)*260
        y = top+35+(i//2)*48
        text(f'{i+1:02d}  {a}', x, y, 240, size=10, bold=True)
        text(b, x+22, y+20, 218, size=9, color=MUTED)
    text('完整、可审查的提示词保存在 prompts/system.md，说明书摘要不代替源码文件。', M, top+244, size=8.5, color=MUTED)
    c.showPage()

    # 6: artifact and safety review semantics.
    page(6, 'OUTPUT / 结果与核验', '每一次改写，都保留来路。', '图文预览、创作策略、知识依据、核验结果统一保存。')
    top = screenshot(state.get('resultImage', 'ui-result-desktop.png'), 196, 273, state.get('resultScreenshot', '结果截图：合成 QA 工作流，展示实际 UI 与交互结构，不作为真实模型营销案例。'))
    top = table(['状态', '用户可见行为'], [
        ['存在阻断', '指出无依据断言、图片问题或违规表达；仅可导出带标记草稿。'],
        ['待人工核验', '规则编排、独立核验未完成或待确认问题持续显示。本地来源本身不是自动驳回原因。'],
        ['自动核验通过', '已满足程序检查；仍须人工确认动态信息、素材授权与正式发布条件。'],
    ], top, [105, CW-105])
    section('可携带的作品', '复制正文与 Markdown、JSON、HTML 导出均保留审核状态。HTML 按封面、段后与文末位置内嵌原图；缺图不能声称完整。版本记录保存原稿和修改稿，方便复盘与评审。', top+22)
    c.showPage()

    # 7: test truth, sourced from a small auditable state file.
    page(7, 'VALIDATION / 当前验收证据', '通过多少项，就写多少项。', '自动化、真实资料和线上服务证据分开记录。')
    top = table(['检查', '当前结果', '不能据此推断'], [
        ['单元 / 接口', escape(state['unit']), '不等于真实 ima 或真实模型成稿。'],
        ['浏览器回归', escape(state['browser']), '不等于比赛要求的连续真实录屏。'],
        ['生产构建', escape(state['build']), '不等于目标平台已实际部署。'],
        ['本地快照矩阵', '320 组合：192 联调稿、128 预期冲突阻断、0 意外失败。', '10 型号 × 8 场景 × 4 平台；非线上验收。'],
        ['真实 ima', '指定库、单型号事实和首轮 4 原图已成功；复查原文件仍报额度限制。', '不等于多个型号及完整生成通过。'],
        ['真实模型', escape(state['model']), '不能据此填入三组正式案例。'],
        ['依赖审计', escape(state['audit']), '不保证不存在所有安全风险。'],
    ], 196, [88, 234, CW-322], size=9)
    top = section('重点回归范围', '需求追问、32 种场景平台组合、精确数值引用、错型号/错图、原图可用性、恶意内容、编辑重审、跨重启记录、导出转义、密钥脱敏、公开模式隔离、同源与 iframe 安全，以及桌面/移动键盘交互。', top+22)
    text('权威记录：docs/TEST-REPORT.md 与测试命令原始输出。合成数据不得当作产品事实或参赛成绩。', M, top, size=8.5, color=MUTED)
    c.showPage()

    # 8: honest requirements coverage, with no fake cases.
    page(8, 'LIVE CASES / 演示与模型案例', '演示能操作，模型能力另行验收。', '免 API 规则输出不能作为真实模型创作成绩。')
    top = table(['任务', '必须证明', '状态'], [
        ['A 开学季 / 小红书', '学习与携带需求、3-6 张同型号图、互动标签、事实和图源。', escape(state.get('cases', '模型待验收'))],
        ['B 职场办公 / 公众号', '差旅与会议逻辑、2-4 张图、版本条件、场景差异。', escape(state.get('cases', '模型待验收'))],
        ['C 门店到访 / 朋友圈', '一个核心卖点、1-3 张图、到店理由与简洁表达。', escape(state.get('cases', '模型待验收'))],
        ['补充：改写与海报', '原稿主题保留、1 张主视觉、最多三个卖点、新版本重审。', escape(state.get('cases', '模型待验收'))],
    ], 196, [125, CW-220, 95], size=9.3)
    top = section('需要留存的证据', '记录运行 ID、时间、输入、引擎、来源、导出、版本与核验状态。至少三组结果覆盖两场景、两平台；规则演示和真实模型结果分别记录，不能相互冒充。', top+24)
    top = section('连续录屏顺序', '展示实际模式 → 填写任务 → 检索与编排 → 图文与来源 → 核验 → 切换场景和平台 → 修改与导出。允许浏览器自动化记录真实服务，不使用 mock 替换响应，不用静态剪辑冒充运行。', top)
    box(M, top, CW, 88, SAND)
    text('当前前置条件', M+18, top+13, CW-36, size=11, bold=True)
    text('规则演示无需模型密钥。真实模型验收须事先完成服务端配置；用本地知识库时不用等待 ima 恢复。密钥不能出现在录屏、说明书或代码中。', M+18, top+39, CW-36, size=9.5)
    c.showPage()

    # 9: deployment and next gates.
    page(9, 'DEPLOYMENT / 展示与提交边界', '先完成验证，再开放预览。', '本稿、源码预览包和本机应用都不是正式比赛提交。')
    top = section('本地复现', 'Node.js 22.13+；执行 npm ci。免 API 演示：npm run build:demo、npm run preview:demo。完整服务：npm run dev；生产使用 npm run build、npm start。配置详见 README 和 docs/DEPLOYMENT.md。', 196)
    top = section('公开静态预览', '免 API 演示编译为静态网页，浏览器执行规则编排、编辑、检查与导出。只发布官网精简摘要和原站图链；不上传私有库、服务凭据或数据库。完整服务端源码保留，未向匿名访客开放付费调用。', top)
    top = section('无需登录的评审展示', escape(state.get('deployment', 'GitHub 与魔搭上传准备中。完成上传后必须检查魔搭运行状态，并实际打开访问链接验证生成、场景切换、图片和导出；上传成功本身不证明可用。')), top)
    top = table(['提交项', '当前状态与后续验收'], [
        ['GitHub', escape(state.get('github', '源码公开预览待上传；原库、原图文件和凭据排除。'))],
        ['魔搭', escape(state.get('modelscope', '静态交互演示待部署并验证 Running 与实际访问。'))],
        ['说明书与案例', '本说明书含真实规则演示截图和测试证据；三组真实模型案例仍待验收。'],
        ['Demo 与现场材料', escape(state.get('video', '连续运行录屏与现场干扰任务仍需验收。'))],
    ], top, [109, CW-109], size=9.3)
    top = text('<link href="https://github.com/jixie1111/zhixu-huawei-pc-agent" color="#365d49">GitHub：jixie1111 / zhixu-huawei-pc-agent</link><br/><link href="https://modelscope.cn/studios/jixie1111/zhixu-huawei-pc-demo" color="#365d49">魔搭创空间：jixie1111 / zhixu-huawei-pc-demo</link>', M, top+16, size=9)
    text('本次授权范围：上传预览并验证运行；不代替参赛平台正式提交。真实模型验收仍需完成。', M, top+14, size=9, color=RED)
    c.showPage()
    c.save()
    print(f'已生成 9 页验收草稿：{out}')


if __name__ == '__main__':
    main()
