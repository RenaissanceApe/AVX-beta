# Fantek manuals: rows L | UDL defl | UDL+PA defl | L/2..L/9 | defl | total weight  (14 values)
import re, subprocess, sys
def text(pdf): return subprocess.run(['pdftotext','-layout',pdf,'-'],capture_output=True,text=True).stdout
def rows(pdf, n=15):
    out=[]
    for line in text(pdf).splitlines():
        tok=line.split()
        if len(tok)==n and all(re.fullmatch(r'\d+([.,]\d+)?',t) for t in tok):
            out.append([float(t.replace(',','.')) for t in tok])
    return out
if __name__=='__main__':
    for pdf in sys.argv[1:]:
        r=rows(pdf)
        # split into copies: a new copy starts when span decreases
        copies=[[]]
        for x in r:
            if copies[-1] and x[0] <= copies[-1][-1][0]: copies.append([])
            copies[-1].append(x)
        same = all(c==copies[0] for c in copies[1:])
        print(pdf.split('/')[-1], 'copies', [ (len(c), c[0][0], c[-1][0]) for c in copies if c], 'identical' if same else 'DIFFER')
