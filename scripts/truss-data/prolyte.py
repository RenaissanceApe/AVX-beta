# Prolyte loading tables -> rows. Standard layout (17 values per row):
# m ft | UDL kg/m lbs/ft | defl mm inch | CPL kg lbs | defl mm inch | TPL kg lbs | QPL kg lbs | FPL kg lbs | total weight
import re, subprocess, sys, json
def text(pdf): return subprocess.run(['pdftotext','-layout',pdf,'-'],capture_output=True,text=True).stdout
def num(s): return float(s.replace(',','.'))
def rows(pdf):
    out=[]
    for line in text(pdf).splitlines():
        tok=line.split()
        if len(tok)==17 and re.fullmatch(r'\d+', tok[0]) and all(re.fullmatch(r'\d+([,.]\d+)?',t) for t in tok):
            v=[num(t) for t in tok]
            out.append(v)
    return out
def check(v):
    """kg vs lbs agreement (they use 1 lb = 0.453 kg, 1 m = 3.28 ft) and mm vs inch."""
    errs=[]
    pairs=[(2,3,lambda kg: kg/0.453/3.28),(6,7,lambda kg: kg/0.453),(10,11,lambda kg: kg/0.453),(12,13,lambda kg: kg/0.453),(14,15,lambda kg: kg/0.453)]
    for a,b,f in pairs:
        if abs(f(v[a])-v[b]) > max(1.0, 0.01*v[b]): errs.append((a,v[a],v[b],round(f(v[a]),1)))
    for a,b in [(4,5),(8,9)]:
        if abs(v[a]/25.4-v[b])>0.11: errs.append((a,v[a],v[b]))
    if abs(v[0]*3.28-v[1])>0.11: errs.append(('span',v[0],v[1]))
    return errs
def metric(v):
    return dict(span_m=v[0], udl_kg_m=v[2], udl_defl_mm=v[4], cpl_kg=v[6], cpl_defl_mm=v[8], tpl_kg=v[10], qpl_kg=v[12], fpl_kg=v[14], weight_kg=v[16])
if __name__=='__main__':
    for pdf in sys.argv[1:]:
        r=rows(pdf)
        bad=[(x[0],check(x)) for x in r if check(x)]
        print(pdf, len(r), 'spans', r[0][0] if r else '-', '-', r[-1][0] if r else '-', 'unit-check problems:', bad[:4])
