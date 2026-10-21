"""WUYAN semifinal handbook (6 pages), laid out in the app's own light Apple-style look.

Every picture is a real screenshot or a real exported PNG of the local app (see --assets, default
private/handbook-2026-10-21, produced from the 2026-10-20 real-model runs). Text only states what the
product does; no timings, test counts, model names or competition notes. Requires ReportLab and
licensed host-installed CJK fonts; never uploads anything. Previous version is kept in output/pdf/旧版/.
"""
import argparse
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph

ROOT = Path(__file__).resolve().parents[1]
W, H, M = 595.276, 841.89, 44
CW = W - M * 2
PAGES = 6
INK = colors.HexColor('#1d1d1f')
INK2 = colors.HexColor('#424245')
MUTED = colors.HexColor('#6e6e73')
BLUE = colors.HexColor('#0071e3')
PANEL = colors.HexColor('#f5f5f7')
EDGE = colors.HexColor('#d2d2d7')
LINE = colors.HexColor('#e5e5ea')
BODY, SUB, CAP = 12.5, 15, 10


NO_START = set('，。、；：！？）》」』】〕〉”’…%,.;:!?)]}')
NO_END = set('（《「『【〔〈“‘([{')
TOKEN = re.compile(r'<[^>]+>|“[^”]{1,10}”|[A-Za-z0-9][A-Za-z0-9.\-%+·/]*|\s|.')


def _lines(value, width, size, bold):
    tokens = TOKEN.findall(value)
    widths, b = [], bold
    for t in tokens:
        if t.startswith('<'):
            widths.append(0.0)
            b = True if t == '<b>' else (bold if t == '</b>' else b)
        else:
            widths.append(stringWidth(t, 'CJKB' if b else 'CJK', size))

    def legal_break(at):
        before = next((t for t in reversed(tokens[:at])
                       if not t.startswith('<') and not t.isspace()), '')
        after = next((t for t in tokens[at:]
                      if not t.startswith('<') and not t.isspace()), '')
        return (not before or before[-1] not in NO_END) and (not after or after[0] not in NO_START)

    lines, start = [], 0
    while start < len(tokens):
        end, used, last_break = start, 0.0, None
        while end < len(tokens):
            if used + widths[end] > width and used > 0:
                break
            used += widths[end]
            end += 1
            if legal_break(end):
                last_break = end
        stop = len(tokens) if end == len(tokens) else (last_break or end)
        if stop <= start:
            stop = start + 1
        line = tokens[start:stop]
        while line and line[-1].isspace():
            line.pop()
        lines.append(line)
        start = stop
        while start < len(tokens) and tokens[start].isspace():
            start += 1
    return lines


def kinsoku(value, width, size, bold):
    """Chinese line breaking: closing marks never start a line, opening marks never end one, Latin words
    and short quoted labels stay whole; the measure is narrowed a little until the last line holds at
    least six characters, so paragraphs end on an even line instead of a widow."""
    vis = lambda L: ''.join(x for x in L if not x.startswith('<'))
    base = _lines(value, width, size, bold)
    best = base
    if len(base) > 1 and len(vis(base[-1])) < 6:
        for shrink in range(1, 4):
            cand = _lines(value, width - shrink * size * .5, size, bold)
            if len(vis(cand[-1])) >= 6 and len(cand) == len(base):
                best = cand; break
    return '<br/>'.join(''.join(L) for L in best)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--assets', default=str(ROOT / 'private/handbook-2026-10-21'))
    parser.add_argument('--output', default=str(ROOT / 'output/pdf/物有言-复赛作品说明书.pdf'))
    parser.add_argument('--font', default='C:/Windows/Fonts/msyh.ttc')
    parser.add_argument('--bold-font', default='C:/Windows/Fonts/msyhbd.ttc')
    args = parser.parse_args()
    A = Path(args.assets)
    pdfmetrics.registerFont(TTFont('CJK', args.font, subfontIndex=0))
    pdfmetrics.registerFont(TTFont('CJKB', args.bold_font, subfontIndex=0))
    pdfmetrics.registerFontFamily('CJK', normal='CJK', bold='CJKB')
    out = Path(args.output).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(out), pagesize=(W, H))
    c.setTitle('物有言 WUYAN - 作品说明书')
    c.setAuthor('物有言项目组')
    c.setSubject('华为门店营销图文智能体：一句话需求，交付卖点有出处、因店而异、可直接发布的图文。')

    def para(value, width, size, bold, color, leading, align=0):
        if '<br/>' not in value:
            value = kinsoku(value, width - 1.5, size, bold)
        p = Paragraph(value, ParagraphStyle('p', fontName='CJKB' if bold else 'CJK', fontSize=size,
                      leading=leading or size * 1.62, textColor=color, wordWrap='CJK', alignment=align,
                      allowWidows=0, allowOrphans=0))
        _, h = p.wrap(width, H)
        return p, h

    def text(value, x, top, width=CW, size=BODY, bold=False, color=INK2, leading=None, footer=False, align=0):
        p, h = para(value, width, size, bold, color, leading, align)
        if top + h > H - (12 if footer else 52):
            raise ValueError(f'Page overflow at {top:.0f}: {value[:40]}')
        p.drawOn(c, x, H - top - h)
        return top + h

    def measure(value, width, size=BODY, bold=False, leading=None):
        return para(value, width, size, bold, INK, leading)[1]

    def panel(x, top, width, height, r=14, fill=PANEL):
        c.setFillColor(fill)
        c.roundRect(x, H - top - height, width, height, r, stroke=0, fill=1)

    def image(name, x, top, width=None, height=None, r=9, border=True):
        f = A / name
        if not f.is_file():
            raise FileNotFoundError(f'Real screenshot required: {f}')
        rd = ImageReader(str(f))
        iw, ih = rd.getSize()
        s = min((width or 1e9) / iw, (height or 1e9) / ih)
        dw, dh = iw * s, ih * s
        if top + dh > H - 52:
            raise ValueError(f'Image overflow at {top:.0f}: {name}')
        y = H - top - dh
        c.saveState()
        p = c.beginPath()
        p.roundRect(x, y, dw, dh, r)
        c.clipPath(p, stroke=0, fill=0)
        c.drawImage(rd, x, y, width=dw, height=dh, mask='auto')
        c.restoreState()
        if border:
            c.setStrokeColor(EDGE)
            c.setLineWidth(.6)
            c.roundRect(x, y, dw, dh, r, stroke=1, fill=0)
        return dw, top + dh

    def size_of(name, width=None, height=None):
        iw, ih = ImageReader(str(A / name)).getSize()
        s = min((width or 1e9) / iw, (height or 1e9) / ih)
        return iw * s, ih * s

    def rule(top):
        c.setStrokeColor(LINE)
        c.setLineWidth(.6)
        c.line(M, H - top, W - M, H - top)

    def page(n, kicker, title, subtitle):
        c.setFillColor(colors.white)
        c.rect(0, 0, W, H, stroke=0, fill=1)
        mark = A / 'brand-mark.png'
        c.drawImage(ImageReader(str(mark)), M, H - 33, width=13.6, height=15, mask='auto')
        text('<b>物有言</b>　作品说明书', M + 20, 19, width=200, size=10, color=INK, leading=14)
        text('华为门店营销图文智能体', W - M - 160, 19, width=160, size=10, color=MUTED, leading=14, align=2)
        rule(44)
        top = text(kicker, M, 68, size=10.5, bold=True, color=BLUE, leading=16)
        top = text(title, M, top + 6, size=26, bold=True, color=INK, leading=36)
        top = text(subtitle, M, top + 6, size=12.5, color=MUTED, leading=20)
        rule(H - 44)
        text('让真实产品，一句话变成能发的图文。', M, H - 34, size=9.5, color=MUTED, leading=14, footer=True)
        text(f'{n:02d} / {PAGES:02d}', W - M - 60, H - 34, width=60, size=9.5, color=MUTED, leading=14, footer=True, align=2)
        return top + 22

    def block(title, body, x, top, width, tsize=SUB):
        top = text(title, x, top, width, size=tsize, bold=True, color=INK, leading=tsize * 1.55)
        return text(body, x, top + 5, width)

    def step(no, title, body, img, top, img_w, img_left):
        iw, ih = size_of(img, img_w)
        tw = CW - iw - 22
        tx = M + iw + 22 if img_left else M
        ix = M if img_left else M + tw + 22
        th = measure(f'{no}　{title}', tw, SUB, True, SUB * 1.55) + 5 + measure(body, tw)
        image(img, ix, top, img_w)
        t0 = top + max(0, (ih - th) / 2) if th < ih else top
        text(f'<font color="#0071e3">{no}</font>　{title}', tx, t0, tw, size=SUB, bold=True, color=INK, leading=SUB * 1.55)
        text(body, tx, t0 + measure(f'{no}　{title}', tw, SUB, True, SUB * 1.55) + 5, tw)
        return top + max(ih, th)

    # 1 ── positioning
    top = page(1, 'PRODUCT · 产品定位', '让真实产品，一句话变成能发的图文。',
               '店员说一句需求，物有言交出卖点有出处、每家门店各不相同、可以直接发布的图文。')
    _, top = image('h-home.jpg', M, top, CW)
    top = text('首页即创作台：选机型、写一句需求即可开始。真实界面截图。', M, top + 7, size=CAP, color=MUTED, leading=15)
    top += 22
    cw3 = (CW - 24) / 3
    cards = [
        ('一句话就能用', '打开就是输入框。点选机型、写一句需求；人群、场景与平台由智能体整理，店员只做确认和挑选。'),
        ('每家店都不一样', '选择发帖人设、填写门店名称。同一款产品，语气、结构和到店引导随人设与门店而变。'),
        ('卖点都有出处', '卖点绑定知识库原文，配图只用同型号原图；成稿后独立核验，拦下过度承诺。'),
    ]
    hh = max(measure(b, cw3 - 32, 12) for _, b in cards) + 70
    for i, (t, b) in enumerate(cards):
        x = M + i * (cw3 + 12)
        panel(x, top, cw3, hh)
        text(f'0{i + 1}', x + 16, top + 16, cw3 - 32, size=10.5, bold=True, color=BLUE, leading=15)
        text(t, x + 16, top + 34, cw3 - 32, size=14.5, bold=True, color=INK, leading=21)
        text(b, x + 16, top + 60, cw3 - 32, size=12, leading=19.5)
    top += hh + 22
    text('本地知识库收录 <b>12</b> 款机型、<b>1345</b> 份资料、<b>61</b> 张产品原图，覆盖电脑、手机与平板；'
         '支持小红书、微信公众号、门店朋友圈与门店海报四类发布渠道。', M, top, size=BODY)
    c.showPage()

    # 2 ── foolproof operation
    top = page(2, 'WORKFLOW · 傻瓜式操作', '说一句需求，剩下的交给智能体。',
               '店员要做的只有四件事：选机型、写一句话、确认方向、挑一种写法。')
    top = step('01', '写下一句需求', '首页直接是输入框。点选一款机型，写下例如“开学季，给大学新生写一篇小红书，邀请他们到店体验。”也可以直接点选示例需求。',
               'h-idea.jpg', top, 290, True) + 30
    half = (CW - 20) / 2
    cols = [('02', '确认方向，选人设', '点击“整理创作方向”，智能体把需求整理成型号、人群、场景、平台与目标，信息不全时只追问必要的一项。在这里选择发帖人设、填写门店名称。', 'h-brief.jpg'),
            ('03', '三种写法，挑一个', '确认方向后，智能体给出三种切入点不同的写法，并标出推荐项。选定一种，点击“生成图文作品”即可开始创作。', 'h-plans.jpg')]
    ars = [ImageReader(str(A / img)).getSize() for *_, img in cols]
    ars = [w / h for w, h in ars]
    ih = (CW - 20) / sum(ars)
    x = M
    for (no, t, body, img), ar in zip(cols, ars):
        cw_ = ih * ar
        image(img, x, top, height=ih)
        y = text(f'<font color="#0071e3">{no}</font>　{t}', x, top + ih + 14, cw_, size=SUB, bold=True, color=INK, leading=SUB * 1.55)
        bottom2 = text(body, x, y + 5, cw_)
        x += cw_ + 20
        top2 = max(locals().get('top2', 0), bottom2)
    top = top2 + 26
    note = '等待生成时，页面逐步显示智能体的七个步骤；完成后直接进入成稿页，复制正文或下载配图即可发布。'
    nh = measure(note, CW - 40) + 30
    panel(M, top, CW, nh)
    text(note, M + 20, top + 15, CW - 40)
    c.showPage()

    # 3 ── agent run and delivery
    top = page(3, 'DELIVERY · 过程可见，成稿即发', '七个步骤一气呵成，成稿拿去就能发。',
               '生成过程逐步显示在页面上；完成后复制正文、下载整组配图即可发布。')
    top = text('理解创作需求 → 制定场景与平台策略 → 检索本地知识库与原图 → 组织事实与配图方案 → 生成场景化图文 → 事实、图片与合规核验 → 保存证据链。',
               M, top, size=BODY) + 10
    _, top = image('h-pipe.jpg', M, top, CW)
    top = text('生成过程中的真实页面：当前步骤为事实、图片与合规核验。', M, top + 7, size=CAP, color=MUTED, leading=15)
    top += 18
    _, top = image('h-result.jpg', M, top, CW)
    top = text('成稿页：一键复制标题或正文，下载 PNG 配图包；“导出作品”另提供 Markdown、HTML 图文与 JSON 数据。',
               M, top + 7, size=CAP, color=MUTED, leading=15) + 18
    ew = (CW - 2 * 16) / 3
    labels = ['封面', '正文', '行动引导']
    for i, k in enumerate(('01-cover', '02-content', '03-content')):
        _, b = image(f'h-export-{k}.jpg', M + i * (ew + 16), top, ew, r=8)
        text(labels[i], M + i * (ew + 16), b + 6, ew, size=CAP, color=MUTED, leading=15, align=1)
    c.showPage()

    # 4 ── every store sounds different
    top = page(4, 'PERSONA · 千店千面', '同一款产品，每家门店说得不一样。',
               '选择发帖人设、填写门店名称，语气、结构与到店引导随之改变。')
    pw = (CW - 3 * 12) / 4
    phones = [('advisor', '门店顾问', '每天带电脑换教室的新生，值得看看这台 MateBook 14'),
              ('friend', '数码朋友', '第一句 Hello World 之前，把 Ultra 问具体'),
              ('editor', '测评编辑', '常看电子乐谱的新生，值得把这块屏幕列入体验重点'),
              ('minimal', '极简种草', '课余，留给一页漫画')]
    bottom = top
    for i, (k, name, _) in enumerate(phones):
        x = M + i * (pw + 12)
        _, b = image(f'h-pc-{k}.jpg', x, top, pw, r=12)
        b = text(name, x, b + 8, pw, size=12.5, bold=True, color=INK, leading=18, align=1)
        bottom = max(bottom, b)
    top = text('同一任务：MateBook 14 酷睿 Ultra · 大学新生 · 小红书 · 华为体验店·西湖银泰。<br/>'
               '以上为四种人设在本机真实生成的成稿节选。',
               M, bottom + 8, size=CAP, color=MUTED, leading=15) + 18
    rows = [('门店顾问', '开门见山给结论，每段一个事实加一句建议。'),
            ('数码朋友', '口语短句、适量表情，像懂数码的朋友聊天。'),
            ('测评编辑', '按观点、依据、适合谁、取舍组织全文。'),
            ('场景故事', '从一个具体画面写起，事实出现在动作里。'),
            ('极简种草', '标题不超过 14 个字，只讲一个事实。')]
    rh = [max(measure(b, CW - 120, 12), 19.5) + 14 for _, b in rows]
    panel(M, top, CW, sum(rh) + 12)
    y = top + 6
    for (name, body), h in zip(rows, rh):
        text(name, M + 18, y + 7, 80, size=12.5, bold=True, color=INK, leading=19.5)
        text(body, M + 104, y + 7, CW - 120, size=12, leading=19.5)
        y += h
    top += sum(rh) + 12 + 16
    text('门店名称会写进行动引导，例如“开学前，来华为体验店·西湖银泰，带着准备上的课程，试着输入一小段示例代码吧”。'
         '同一份需求换一种人设、换一家门店，得到的是另一篇图文。', M, top, size=BODY)
    c.showPage()

    # 5 ── every claim has a source
    top = page(5, 'TRUST · 卖点有出处', '每一个卖点，都能找到原文。',
               '卖点绑定知识库原文；成稿后独立核验；过度承诺直接拦下。')
    top = step('出处', '点开就能看到依据', '正文旁的“1 项事实依据”可以点开，查看这一段引用的知识库原文。版本限定也随卖点一起保留，例如 Ultra 7 155H 仅限 Windows 版本产品搭载。',
               'h-fact.jpg', top, 262, True) + 18
    top = step('核验', '成稿后再独立核验一遍', '型号、数值、配图与合规逐项检查，每条事实标明“有依据”或“待核实”，结果在“核验结果”中可查。自动核验仅作辅助，发布前仍需人工审阅。',
               'h-audit-cut.jpg', top, 262, False) + 18
    r1 = ImageReader(str(A / 'h-risk-input.jpg')).getSize(); r2 = ImageReader(str(A / 'h-risk.jpg')).getSize()
    gap = 20
    hh = (CW - gap) / (r1[0] / r1[1] + r2[0] / r2[1])
    w1 = hh * r1[0] / r1[1]
    image('h-risk-input.jpg', M, top, height=hh)
    image('h-risk.jpg', M + w1 + gap, top, height=hh)
    top += hh
    text('风险样例共触发 7 项检查提示，右图展示其中 3 项“必须处理”的问题：全网第一、永不卡顿、永久免费。',
         M, top + 7, size=CAP, color=MUTED, leading=15)
    c.showPage()

    # 6 ── sources, versions and publishing
    top = page(6, 'GUIDE · 资料与发布', '资料可查，发布前再确认一次。',
               '知识库、版本记录与发布渠道说明，以及发布前需要人工确认的事项。')
    half = (CW - 20) / 2
    l = block('同型号资料与原图', '资料与原图来自本地知识库，按具体型号检索；配图只使用同型号原图，整机图与屏幕演示画面分别标识。', M, top, half)
    r = block('资料冲突先停下', '同一型号资料存在冲突或待核实时，该机型暂不能用于策划，避免带着错误参数创作。', M + half + 20, top, half)
    top = max(l, r) + 20
    l = block('每次修改都留版本', '编辑正文、按指令改写或转换平台，都会另存为新版本并重新核验，原稿不会被覆盖。', M, top, half)
    r = block('同一份创意，多个渠道', '可从同一篇成稿转换为其他平台版本，按目标渠道重新组织语气、结构与配图数量。', M + half + 20, top, half)
    top = max(l, r) + 24
    plat = [('小红书', '自然口语、短段落、具体问题', '3-6 张'),
            ('微信公众号', '专业克制、逻辑清晰，解释适用条件', '2-4 张'),
            ('门店朋友圈', '简短亲切，一个核心卖点加到店理由', '1-3 张'),
            ('门店海报', '主副标题，不多于三个卖点', '1 张')]
    rowh = 30
    panel(M, top, CW, rowh * (len(plat) + 1) + 8)
    y = top + 4
    for i, (a, b, d) in enumerate([('发布渠道', '写法', '配图')] + plat):
        bold, col = (True, MUTED) if i == 0 else (False, INK2)
        text(a, M + 18, y + 8, 110, size=12 if i else 10.5, bold=i > 0, color=INK if i else MUTED, leading=16)
        text(b, M + 136, y + 8, CW - 136 - 80, size=12 if i else 10.5, color=col, leading=16)
        text(d, W - M - 76, y + 8, 60, size=12 if i else 10.5, color=col, leading=16, align=2)
        y += rowh
        if i < len(plat):
            c.setStrokeColor(EDGE)
            c.setLineWidth(.4)
            c.line(M + 18, H - y - 2, W - M - 18, H - y - 2)
    top += rowh * (len(plat) + 1) + 8 + 24
    bh = measure('发布前，请再确认：', CW - 40, SUB, True) + measure('核对型号与配置、活动权益及有效期；确认图片与资料的使用权限；阅读最终正文与适用条件后，再复制正文或下载配图，发布到目标平台。', CW - 40) + 44
    panel(M, top, CW, bh, fill=colors.HexColor('#eef5fd'))
    t = text('发布前，请再确认', M + 20, top + 18, CW - 40, size=SUB, bold=True, color=BLUE, leading=SUB * 1.55)
    text('核对型号与配置、活动权益及有效期；确认图片与资料的使用权限；阅读最终正文与适用条件后，再复制正文或下载配图，发布到目标平台。',
         M + 20, t + 6, CW - 40)
    c.showPage()
    c.save()
    print(f'Generated {PAGES} pages: {out}')


if __name__ == '__main__':
    main()
