import sys, os, re, math
import xml.etree.ElementTree as ET
from svgpathtools import parse_path
import ezdxf

SVG_NS = 'http://www.w3.org/2000/svg'
XHTML_NS = 'http://www.w3.org/1999/xhtml'

NAMED_COLORS = {
    'black': (0,0,0), 'white': (255,255,255), 'red': (255,0,0),
    'green': (0,128,0), 'blue': (0,0,255), 'yellow': (255,255,0),
    'orange': (255,165,0), 'gray': (128,128,128), 'grey': (128,128,128),
    'purple': (128,0,128), 'cyan': (0,255,255), 'magenta': (255,0,255),
    'none': None, 'transparent': None,
}

def local(tag):
    return tag.split('}')[-1] if '}' in tag else tag

def parse_transform_str(s):
    if not s:
        return (1.0,0.0,0.0,1.0,0.0,0.0)
    # find all function calls
    funcs = re.findall(r'(\w+)\(([^)]*)\)', s)
    cur = (1.0,0.0,0.0,1.0,0.0,0.0)
    for name, args in funcs:
        nums = [float(x) for x in re.findall(r'[-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?', args)]
        if name == 'matrix' and len(nums) >= 6:
            m = (nums[0], nums[1], nums[2], nums[3], nums[4], nums[5])
        elif name == 'translate':
            tx = nums[0] if len(nums)>0 else 0
            ty = nums[1] if len(nums)>1 else 0
            m = (1,0,0,1,tx,ty)
        elif name == 'scale':
            sx = nums[0] if len(nums)>0 else 1
            sy = nums[1] if len(nums)>1 else sx
            m = (sx,0,0,sy,0,0)
        elif name == 'rotate':
            ang = math.radians(nums[0])
            c = math.cos(ang); s_ = math.sin(ang)
            if len(nums) >= 3:
                cx, cy = nums[1], nums[2]
                # translate(cx,cy) rotate scale? compose: T(cx,cy) R T(-cx,-cy)
                m = (c, s_, -s_, c, cx - c*cx + s_*cy, cy - s_*cx - c*cy)
            else:
                m = (c, s_, -s_, c, 0, 0)
        elif name == 'skewX':
            ang = math.radians(nums[0])
            m = (1, 0, math.tan(ang), 1, 0, 0)
        elif name == 'skewY':
            ang = math.radians(nums[0])
            m = (1, math.tan(ang), 0, 1, 0, 0)
        else:
            continue
        # compose: new transform applied first to point => m * cur
        a1,b1,c1,d1,e1,f1 = m
        a2,b2,c2,d2,e2,f2 = cur
        cur = (a1*a2 + c1*b2, b1*a2 + d1*b2,
               a1*c2 + c1*d2, b1*c2 + d1*d2,
               a1*e2 + c1*f2 + e1, b1*e2 + d1*f2 + f1)
    return cur

def apply(m, x, y):
    a,b,c,d,e,f = m
    return (a*x + c*y + e, b*x + d*y + f)

IDENTITY = (1.0,0.0,0.0,1.0,0.0,0.0)

def parse_style_attr(s):
    out = {}
    if not s: return out
    for part in s.split(';'):
        if ':' in part:
            k,v = part.split(':',1)
            out[k.strip()] = v.strip()
    return out

def parse_css(css_text):
    rules = {}
    for m in re.finditer(r'([^{]+)\{([^}]*)\}', css_text):
        selectors = m.group(1).split(',')
        props = parse_style_attr(m.group(2))
        for sel in selectors:
            sel = sel.strip()
            if not sel: continue
            norm = ' '.join(sel.split())
            # store under full normalized selector
            rules.setdefault(norm, {}).update(props)
            # take last simple token
            toks = sel.split()
            last = toks[-1] if toks else sel
            last = last.lstrip('.#')
            last = last.split(':')[0]
            if last:
                rules.setdefault(last, {}).update(props)
    return rules

def color_to_rgb(c):
    if c is None: return None
    c = str(c).strip().lower()
    if c in NAMED_COLORS:
        return NAMED_COLORS[c]
    if c.startswith('#'):
        h = c[1:]
        if len(h) == 3:
            h = ''.join(ch*2 for ch in h)
        if len(h) == 6:
            return (int(h[0:2],16), int(h[2:4],16), int(h[4:6],16))
    m = re.match(r'rgba?\(([^)]+)\)', c)
    if m:
        parts = [p.strip() for p in m.group(1).split(',')]
        return (int(float(parts[0])), int(float(parts[1])), int(float(parts[2])))
    return None

def resolve_style(el, css_rules, tag=None, ancestors=None):
    style = {}
    ancestors = ancestors or []
    # tag-based rule
    if tag and tag in css_rules:
        style.update(css_rules[tag])
    # ancestor descendant rules: try 'ancestorclass tag' and 'ancestorclass'
    for anc in ancestors:
        for key in (f'{anc} {tag}', f'{anc}.{tag}', anc):
            if key in css_rules:
                style.update(css_rules[key])
    for cls in (el.get('class') or '').split():
        if cls in css_rules:
            style.update(css_rules[cls])
        # descendant: ancestor cls + this cls
        for anc in ancestors:
            key = f'{anc} .{cls}' if False else f'{anc} {cls}'
            if key in css_rules:
                style.update(css_rules[key])
    eid = el.get('id')
    if eid and eid in css_rules:
        style.update(css_rules[eid])
    if eid:
        for anc in ancestors:
            key = f'{anc} #{eid}'
            if key in css_rules:
                style.update(css_rules[key])
    style.update(parse_style_attr(el.get('style')))
    for attr in ('stroke','fill','stroke-width','font-size','font-family','opacity','stroke-dasharray','stroke-linecap','stroke-linejoin'):
        if el.get(attr) is not None:
            style[attr] = el.get(attr)
    return style

def get_num(style, key, default=None):
    v = style.get(key)
    if v is None: return default
    m = re.search(r'[-+]?[0-9]*\.?[0-9]+', str(v))
    return float(m.group(0)) if m else default

def sample_path(path_obj, n_per=20):
    pts = []
    for seg in path_obj:
        cls = seg.__class__.__name__
        n = n_per if cls in ('CubicBezier','QuadraticBezier','Arc') else 2
        for i in range(n+1):
            pt = seg.point(i/n)
            pts.append((pt.real, pt.imag))
    # dedupe
    clean = []
    for p in pts:
        if not clean or abs(p[0]-clean[-1][0])>1e-6 or abs(p[1]-clean[-1][1])>1e-6:
            clean.append(p)
    return clean

def transform_points(pts, m):
    return [apply(m, x, y) for x,y in pts]

def add_polyline(msp, pts, style, layer):
    if len(pts) < 2: return
    attrs = {'layer': layer}
    rgb = color_to_rgb(style.get('stroke', 'black'))
    if rgb is not None:
        attrs['true_color'] = (rgb[0]<<16)|(rgb[1]<<8)|rgb[2]
    sw = get_num(style, 'stroke-width', 1.0)
    if sw: attrs['const_width'] = sw
    try:
        msp.add_lwpolyline(pts, dxfattribs=attrs)
    except Exception:
        msp.add_lwpolyline(pts, dxfattribs={'layer': layer})

def add_hatch(msp, pts, style, layer):
    rgb = color_to_rgb(style.get('fill'))
    if rgb is None: return
    try:
        hatch = msp.add_hatch(color=7, dxfattribs={'layer': layer})
        hatch.set_pattern_fill('SOLID')
        hatch.paths.add_polyline_path(pts, is_closed=True)
        hatch.dxf.true_color = (rgb[0]<<16)|(rgb[1]<<8)|rgb[2]
    except Exception:
        pass

def add_text(msp, text, x, y, style, m, layer):
    text = ' '.join(text.split())
    if not text: return
    fs = get_num(style, 'font-size', 12.0)
    # convert px-ish to drawing units (scale down)
    height = max(1.0, fs * 0.25)
    rgb = color_to_rgb(style.get('fill', style.get('stroke', 'black')))
    attrs = {'layer': layer, 'height': height, 'insert': apply(m, x, y)}
    if rgb is not None:
        attrs['true_color'] = (rgb[0]<<16)|(rgb[1]<<8)|rgb[2]
    try:
        t = msp.add_text(text, dxfattribs=attrs)
        t.dxf.halign = 1
        t.dxf.valign = 2
        t.dxf.align_point = apply(m, x, y)
    except Exception:
        try:
            msp.add_text(text, dxfattribs=attrs)
        except Exception:
            pass

def parse_points(s):
    pts = []
    for pair in re.findall(r'([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)\s*,\s*([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)', s or ''):
        pts.append((float(pair[0]), float(pair[1])))
    return pts

def process_element(el, parent_m, css_rules, msp, ancestors=None):
    ancestors = ancestors or []
    tag = local(el.tag)
    if tag in ('defs','marker','style','script','title','desc','metadata'):
        if tag == 'style':
            pass
        return
    # style
    style = resolve_style(el, css_rules, tag=tag, ancestors=ancestors)
    # transform
    et = parse_transform_str(el.get('transform'))
    if et == IDENTITY:
        m = parent_m
    else:
        m = (et[0]*parent_m[0]+et[2]*parent_m[1], et[1]*parent_m[0]+et[3]*parent_m[1],
             et[0]*parent_m[2]+et[2]*parent_m[3], et[1]*parent_m[2]+et[3]*parent_m[3],
             et[0]*parent_m[4]+et[2]*parent_m[5]+et[4], et[1]*parent_m[4]+et[3]*parent_m[5]+et[5])
    # classify layer
    cls = el.get('class') or ''
    if 'text' in cls or tag in ('text','tspan'):
        layer = 'TEXT'
    elif 'node' in cls or 'cluster' in cls:
        layer = 'NODES'
    else:
        layer = 'GEOMETRY'

    # shapes
    if tag == 'path':
        d = el.get('d')
        if d:
            try:
                po = parse_path(d)
                pts = sample_path(po)
                tpts = transform_points(pts, m)
                fill = style.get('fill')
                stroke = style.get('stroke', 'none')
                if stroke and stroke != 'none':
                    add_polyline(msp, tpts, style, layer)
                if fill and fill not in ('none','transparent'):
                    # close
                    if tpts and tpts[0] != tpts[-1]:
                        tpts = tpts + [tpts[0]]
                    add_hatch(msp, tpts, style, layer)
            except Exception:
                pass
    elif tag == 'rect':
        x = float(el.get('x', 0)); y = float(el.get('y', 0))
        w = float(el.get('width', 0)); h = float(el.get('height', 0))
        rx = float(el.get('rx', 0)); ry = float(el.get('ry', rx))
        if rx>0 or ry>0:
            # rounded rect polyline
            r = rx or ry
            pts = []
            # 4 corners with arcs approximated by segments
            # top edge
            pts.append((x+r, y))
            pts.append((x+w-r, y))
            # top-right arc
            for i in range(1,6):
                ang = math.radians(-90 + i*90/5.0)
                pts.append((x+w-r + r*math.cos(ang), y + r + r*math.sin(ang)))
            pts.append((x+w, y+r))
            pts.append((x+w, y+h-r))
            for i in range(1,6):
                ang = math.radians(i*90/5.0)
                pts.append((x+w-r + r*math.cos(ang), y+h-r + r*math.sin(ang)))
            pts.append((x+w-r, y+h))
            pts.append((x+r, y+h))
            for i in range(1,6):
                ang = math.radians(90 + i*90/5.0)
                pts.append((x+r + r*math.cos(ang), y+h-r + r*math.sin(ang)))
            pts.append((x, y+h-r))
            pts.append((x, y+r))
            for i in range(1,6):
                ang = math.radians(180 + i*90/5.0)
                pts.append((x+r + r*math.cos(ang), y+r + r*math.sin(ang)))
            pts.append((x+r, y))
        else:
            pts = [(x,y),(x+w,y),(x+w,y+h),(x,y+h),(x,y)]
        tpts = transform_points(pts, m)
        stroke = style.get('stroke','none')
        fill = style.get('fill')
        if stroke and stroke != 'none':
            add_polyline(msp, tpts, style, layer)
        if fill and fill not in ('none','transparent'):
            if tpts and tpts[0]!=tpts[-1]:
                tpts = tpts + [tpts[0]]
            add_hatch(msp, tpts, style, layer)
    elif tag in ('circle',):
        cx = float(el.get('cx',0)); cy=float(el.get('cy',0)); r=float(el.get('r',0))
        pts=[]
        for i in range(49):
            ang = 2*math.pi*i/48.0
            pts.append((cx + r*math.cos(ang), cy + r*math.sin(ang)))
        tpts = transform_points(pts, m)
        stroke = style.get('stroke','none'); fill=style.get('fill')
        if stroke and stroke != 'none':
            add_polyline(msp, tpts, style, layer)
        if fill and fill not in ('none','transparent'):
            if tpts and tpts[0]!=tpts[-1]: tpts=tpts+[tpts[0]]
            add_hatch(msp, tpts, style, layer)
    elif tag == 'ellipse':
        cx = float(el.get('cx',0)); cy=float(el.get('cy',0))
        rx = float(el.get('rx',0)); ry=float(el.get('ry',0))
        pts=[]
        for i in range(49):
            ang = 2*math.pi*i/48.0
            pts.append((cx + rx*math.cos(ang), cy + ry*math.sin(ang)))
        tpts = transform_points(pts, m)
        stroke = style.get('stroke','none'); fill=style.get('fill')
        if stroke and stroke != 'none':
            add_polyline(msp, tpts, style, layer)
        if fill and fill not in ('none','transparent'):
            if tpts and tpts[0]!=tpts[-1]: tpts=tpts+[tpts[0]]
            add_hatch(msp, tpts, style, layer)
    elif tag == 'line':
        x1=float(el.get('x1',0)); y1=float(el.get('y1',0))
        x2=float(el.get('x2',0)); y2=float(el.get('y2',0))
        p1=apply(m,x1,y1); p2=apply(m,x2,y2)
        rgb=color_to_rgb(style.get('stroke','black'))
        attrs={'layer':layer}
        if rgb is not None: attrs['true_color']=(rgb[0]<<16)|(rgb[1]<<8)|rgb[2]
        sw=get_num(style,'stroke-width',1.0)
        if sw: attrs['const_width']=sw
        try: msp.add_line(p1,p2,dxfattribs=attrs)
        except Exception: pass
    elif tag in ('polyline','polygon'):
        pts = parse_points(el.get('points'))
        tpts = transform_points(pts, m)
        stroke = style.get('stroke','none'); fill=style.get('fill')
        if stroke and stroke != 'none':
            add_polyline(msp, tpts, style, layer)
        if (tag=='polygon' or (fill and fill not in ('none','transparent'))):
            if tpts and tpts[0]!=tpts[-1]: tpts=tpts+[tpts[0]]
            if fill and fill not in ('none','transparent'):
                add_hatch(msp, tpts, style, layer)
    elif tag == 'text':
        content = ''.join(el.itertext()).strip()
        x = float(el.get('x',0)); y=float(el.get('y',0))
        add_text(msp, content, x, y, style, m, 'TEXT')
    elif tag == 'foreignObject':
        content = ''.join(el.itertext()).strip()
        x = float(el.get('x',0)); y=float(el.get('y',0))
        w = float(el.get('width',0)); h = float(el.get('height',0))
        cx = x + w/2.0 if w else x
        cy = y + h/2.0 if h else y
        add_text(msp, content, cx, cy, style, m, 'TEXT')
    # recurse
    child_ancestors = list(ancestors)
    if el.get('class'):
        child_ancestors = child_ancestors + el.get('class').split()
    for child in el:
        process_element(child, m, css_rules, msp, ancestors=child_ancestors)

def convert(svg_path, dxf_path):
    tree = ET.parse(svg_path)
    root = tree.getroot()
    # collect css
    css_rules = {}
    for st in root.iter():
        if local(st.tag) == 'style' and st.text:
            css_rules.update(parse_css(st.text))
    doc = ezdxf.new('R2010')
    msp = doc.modelspace()
    # layers
    for lname, color in (('GEOMETRY',7),('NODES',5),('TEXT',3),('ANNOTATIONS',2)):
        try:
            doc.layers.add(lname, color=color)
        except Exception:
            pass
    # viewbox not needed; process root's children
    root_m = IDENTITY
    # apply root transform if any
    root_m = parse_transform_str(root.get('transform'))
    for child in root:
        process_element(child, root_m, css_rules, msp)
    doc.saveas(dxf_path)
    print('saved', dxf_path, 'entities:', len(list(msp)))

if __name__=='__main__':
    inp=sys.argv[1]; out=sys.argv[2]
    convert(inp,out)