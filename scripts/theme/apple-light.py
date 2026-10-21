"""Rewrite legacy sage/cream CSS colours to an Apple-like light gray system.
Neutral cream/sage surfaces -> neutral grays (#f5f5f7 family), sage/green accents
-> Apple blue, ink greens -> near-black grays. Status hues (red/orange/amber) keep
their hue. Usage: python -I apple-light.py <css...> (rewrites in place)"""
import colorsys, re, sys
BLUE = (0, 113, 227)
def parse(t):
    t = t.strip().lower()
    if t == 'white': return (255, 255, 255, 1.0)
    if t.startswith('#'):
        h = t[1:]
        if len(h) in (3, 4): h = ''.join(c * 2 for c in h)
        return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), int(h[6:8], 16) / 255 if len(h) == 8 else 1.0)
    m = re.match(r'rgba?\(([^)]*)\)', t)
    if m:
        p = [x for x in re.split(r'[,\s/]+', m.group(1)) if x]
        return (int(float(p[0])), int(float(p[1])), int(float(p[2])), float(p[3]) if len(p) > 3 else 1.0)
def fmt(r, g, b, a):
    r, g, b = (max(0, min(255, round(v))) for v in (r, g, b))
    return f'#{r:02x}{g:02x}{b:02x}' if a >= .999 else f'rgba({r},{g},{b},{round(a, 3)})'
def gray(l):  # Apple-ish neutral gray, very slight cool tint
    v = l * 255
    return (v, v, min(255, v + 2))
def convert(token, prop):
    c = parse(token)
    if not c: return token
    r, g, b, a = c
    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    green = 55 / 360 <= h <= 190 / 360 and s > .06
    warm_status = (h < 50 / 360 or h > 300 / 360) and s > .35
    is_text = prop in ('color', 'fill', 'caret-color', 'accent-color', 'text-decoration-color')
    if prop in ('box-shadow', 'text-shadow', 'filter'):
        return fmt(0, 0, 0, min(.16, a * 1.2 + .02))
    if warm_status:
        return token  # red/orange/brown status colours stay recognisable
    if is_text:
        if green and s > .22 and l < .62: return fmt(*BLUE, a)       # sage link/accent ink -> blue
        if l >= .9: return token                                     # white on fills
        # map ink lightness onto Apple text grays: #1d1d1f .. #86868b
        return fmt(*gray(.11 + min(1, max(0, (l - .15) / .5)) * .42), a)
    # fills / borders
    if l >= .9: return fmt(*gray(.955 + (l - .9) * .45), a) if s > .08 else fmt(*gray(min(1, l)), a)
    if l >= .78: return fmt(*gray(.86 + (l - .78) * .7), a)
    if green and s > .15: return fmt(*BLUE, a)                       # sage fills -> blue
    return fmt(*gray(max(.12, l * .9)), a)
COLOR = re.compile(r'#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|\bwhite\b')
SERIF = re.compile(r'font-family:\s*(?:Georgia,\s*)?serif')
def block(body):
    out = []
    for d in body.split(';'):
        if ':' not in d: out.append(d); continue
        p, v = d.split(':', 1); key = p.strip().lower()
        out.append(d if key.startswith('--') or key in ('content', 'src', 'font-family') else p + ':' + COLOR.sub(lambda m: convert(m.group(0), key), v))
    return ';'.join(out)
for path in sys.argv[1:]:
    s = open(path, encoding='utf-8').read()
    s = SERIF.sub('font-family:var(--font)', re.sub(r'\{([^{}]*)\}', lambda m: '{' + block(m.group(1)) + '}', s))
    open(path, 'w', encoding='utf-8', newline='').write(s); print(path, 'ok')
