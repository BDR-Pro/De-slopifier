#!/usr/bin/env python3
"""Create immutable numbered GitHub releases and replace the rolling preview. Requires gh."""
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from build import version

def gh(*args,allow_404=False):
    p=subprocess.run(['gh',*args],cwd=ROOT,text=True,capture_output=True)
    if p.returncode:
        if allow_404 and 'HTTP 404' in p.stderr: return None
        raise RuntimeError(p.stderr.strip() or p.stdout.strip() or 'GitHub CLI failed')
    return p.stdout

def api(path,method='GET',fields=None,allow_404=False):
    args=['api','--method',method,path]
    for k,v in (fields or {}).items(): args+=['-F' if isinstance(v,bool) else '-f',f'{k}={str(v).lower() if isinstance(v,bool) else v}']
    result=gh(*args,allow_404=allow_404)
    return None if result is None else json.loads(result or '{}')

def write_outputs(**values):
    text=''.join(f'{k}={v}\n' for k,v in values.items());print(text,end='')
    if os.getenv('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'],'a',encoding='utf-8') as f:f.write(text)

def main():
    repo=os.environ['GITHUB_REPOSITORY'];sha=os.environ['GITHUB_SHA'];v=version();tag='v'+v
    if not re.fullmatch(r'[\w.-]+/[\w.-]+',repo) or not re.fullmatch(r'[0-9a-f]{40}',sha):raise ValueError('Invalid repository or commit')
    assets=sorted((ROOT/'dist/release').glob('*'))
    if len(assets)!=4:raise ValueError('Run python build.py first')
    pages=json.loads(gh('api',f'repos/{repo}/releases?per_page=100','--paginate','--slurp'))
    all_releases=[r for page in pages for r in page]
    current=next((r for r in all_releases if r['tag_name']==tag),None)
    created=False
    notes=f'''# De-slopifier {v}

Source: `{sha}`. Includes two-hop author filtering, optional promoted-post hiding,
and a cumulative per-tab session counter with an ads breakdown and Reset.
Following lists must be supplied/reviewed; no automatic graph download.

## Install
**Chromium:** extract the Chromium ZIP; in `chrome://extensions` enable Developer
mode, choose Load unpacked, and select the folder containing manifest.json.
**Firefox:** extract the unsigned Firefox ZIP; in `about:debugging#/runtime/this-firefox`
choose Load Temporary Add-on and select manifest.json. This is not a signed XPI.
**Source:** extract the source ZIP, run `python build.py`, then load dist/chromium
or dist/firefox. README and docs/PUBLISHING.md contain full setup instructions.

Local prototype: live authenticated X, current ad selectors, and Firefox runtime
have not been verified. A GitHub release is not store approval. MIT licensed.
SHA256SUMS covers the three ZIP assets.
'''
    note_file=ROOT/'dist/release-notes.md';note_file.write_text(notes,encoding='utf-8')
    if current is None or current['draft']:
        prior=[tuple(map(int,r['tag_name'][1:].split('.'))) for r in all_releases if not r['draft'] and not r['prerelease'] and re.fullmatch(r'v\d+\.\d+\.\d+',r['tag_name'])]
        if prior and tuple(map(int,v.split('.')))<=max(prior):raise ValueError('Release version must increase')
        ref=api(f'repos/{repo}/git/ref/tags/{tag}',allow_404=True)
        if ref:
            obj=ref['object']
            while obj['type']=='tag':obj=api(f'repos/{repo}/git/tags/{obj["sha"]}')['object']
            if obj['sha']!=sha:raise ValueError('Numbered tag points elsewhere; it will not be moved')
        if current is None:
            gh('release','create',tag,'--repo',repo,'--target',sha,'--draft','--title',f'De-slopifier {v}','--notes-file',str(note_file))
        elif current.get('target_commitish')!=sha:raise ValueError('Existing draft has a different source commit')
        gh('release','upload',tag,*map(str,assets),'--repo',repo,'--clobber')
        gh('release','edit',tag,'--repo',repo,'--draft=false','--latest');created=True
    else:
        print(tag,'already exists; its assets and tag will not be changed')
    rolling=ROOT/'dist/rolling'
    if rolling.exists():shutil.rmtree(rolling)
    rolling.mkdir()
    for flavor in ('chromium','firefox','source'):
        shutil.copyfile(ROOT/'dist/release'/f'de-slopifier-{v}-{flavor}.zip',rolling/f'de-slopifier-{flavor}.zip')
    (rolling/'SHA256SUMS').write_text(''.join(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}\n' for p in sorted(rolling.glob('*.zip'))),encoding='utf-8')
    ref=api(f'repos/{repo}/git/ref/tags/rolling',allow_404=True)
    if ref:api(f'repos/{repo}/git/refs/tags/rolling','PATCH',{'sha':sha,'force':True})
    else:api(f'repos/{repo}/git/refs','POST',{'ref':'refs/tags/rolling','sha':sha})
    note_file.write_text('Development preview — replaced after successful main builds. Never submitted to stores.\n\n'+notes,encoding='utf-8')
    if api(f'repos/{repo}/releases/tags/rolling',allow_404=True) is None:
        gh('release','create','rolling','--repo',repo,'--verify-tag','--prerelease','--latest=false','--title','Latest development build','--notes-file',str(note_file))
    gh('release','upload','rolling',*map(str,sorted(rolling.glob('*'))),'--repo',repo,'--clobber')
    gh('release','edit','rolling','--repo',repo,'--prerelease','--latest=false','--notes-file',str(note_file))
    write_outputs(created=str(created).lower(),tag=tag)
if __name__=='__main__':
    try:main()
    except (ValueError,RuntimeError,OSError,KeyError) as exc:print(f'Release failed: {exc}',file=sys.stderr);sys.exit(1)
