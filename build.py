#!/usr/bin/env python3
"""Deterministic Chromium/Firefox packages. Python 3.10+, no build dependencies."""
import argparse
import hashlib
import json
import re
import shutil
import zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent
ROOT_FILES=('README.md','LICENSE','PRIVACY.md','SECURITY.md','CONTRIBUTING.md','CHANGELOG.md',
            'TESTING.md','build.py','project.json','example-graph.json','requirements-test.txt',
            '.gitignore','.gitattributes','.editorconfig')
DIRS=('src','scripts','docs','tests','store','.github')
SUFFIXES={'.js','.cjs','.py','.json','.html','.css','.md','.txt','.png','.svg','.yml','.yaml'}
def version():
    v=json.loads((ROOT/'src/manifest.json').read_text(encoding='utf-8'))['version']
    if not re.fullmatch(r'(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)',v) or v=='0.0.0' or any(int(x)>65535 for x in v.split('.')):
        raise ValueError('Version must be nonzero MAJOR.MINOR.PATCH, each component 0..65535')
    return v

def files(folder):
    for p in sorted(folder.rglob('*')):
        rel=p.relative_to(folder)
        if p.is_symlink(): raise ValueError(f'Refusing package symlink: {p}')
        if any(x.startswith('.') or x=='__pycache__' for x in rel.parts): continue
        if p.is_file() and p.suffix in SUFFIXES: yield p,rel.as_posix()

def source_files():
    for name in ROOT_FILES:
        p=ROOT/name
        if p.is_symlink(): raise ValueError(f'Refusing symlink: {p}')
        if p.is_file(): yield p,name
    for directory in DIRS:
        for p,rel in files(ROOT/directory):
            if directory=='tests' and ('results' in p.name or p.name.endswith('preview.png')): continue
            if re.search(r'(?:^|[-_.])(secrets?|credentials?|tokens?)(?:[-_.]|$)',p.name,re.I):
                raise ValueError(f'Refusing possibly sensitive file: {p}')
            yield p,f'{directory}/{rel}'

def archive(destination, entries):
    with zipfile.ZipFile(destination,'w',compression=zipfile.ZIP_STORED) as z:
        for p,name in sorted(entries,key=lambda x:x[1]):
            info=zipfile.ZipInfo(name,(2020,1,1,0,0,0));info.create_system=3
            info.external_attr=0o100644<<16
            z.writestr(info,p.read_bytes())

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--out',type=Path,default=ROOT/'dist');ap.add_argument('--version-only',action='store_true')
    args=ap.parse_args();v=version()
    if args.version_only: print(v);return
    out=args.out.resolve()
    if out==ROOT or out in ROOT.parents or (ROOT in out.parents and not (out==ROOT/'dist' or ROOT/'dist' in out.parents)):
        raise ValueError('Output inside this project must be dist/ or below it, never the source directories')
    out.mkdir(parents=True,exist_ok=True)
    package=out/'release'
    if package.is_symlink(): raise ValueError('Refusing symlink output')
    package.mkdir(exist_ok=True)
    for p in package.glob('*'):
        if p.is_file(): p.unlink()
    base=json.loads((ROOT/'src/manifest.json').read_text(encoding='utf-8'))
    config=json.loads((ROOT/'project.json').read_text(encoding='utf-8'))
    for browser in ('chromium','firefox'):
        target=out/browser
        if target.is_symlink(): raise ValueError('Refusing symlink output')
        if target.exists(): shutil.rmtree(target)
        target.mkdir()
        for p,rel in files(ROOT/'src'):
            dest=target/rel;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,dest)
        manifest=dict(base);manifest.pop('browser_specific_settings',None)
        if browser=='firefox':
            manifest['browser_specific_settings']={'gecko':{'id':config['firefox_id'],'strict_min_version':'140.0',
                'data_collection_permissions':{'required':['none']}}}
        (target/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
        archive(package/f'de-slopifier-{v}-{browser}.zip',files(target))
        print('Built',target)
    archive(package/f'de-slopifier-{v}-source.zip',source_files())
    (package/'SHA256SUMS').write_text(''.join(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}\n' for p in sorted(package.glob('*.zip'))),encoding='utf-8')
    print('Release packages:',package)
if __name__=='__main__': main()
