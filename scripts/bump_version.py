#!/usr/bin/env python3
import argparse,json,re,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from build import version
ap=argparse.ArgumentParser(description='Increase the manifest version before a numbered release')
ap.add_argument('part',choices=['patch','minor','major']);args=ap.parse_args()
old=version();parts=list(map(int,old.split('.')));i=('major','minor','patch').index(args.part)
parts[i]+=1;parts[i+1:]=[0]*(2-i)
if max(parts)>65535:ap.error('Browser version components cannot exceed 65535')
p=ROOT/'src/manifest.json';m=json.loads(p.read_text(encoding='utf-8'));m['version']='.'.join(map(str,parts))
p.write_text(json.dumps(m,indent=2)+'\n',encoding='utf-8');print(old,'->',m['version'])
