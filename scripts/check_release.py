#!/usr/bin/env python3
"""Verify a numbered release before exposing store credentials to a publishing step."""
import json,os,re,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from build import version

def main():
    tag=os.environ.get('RELEASE_TAG','')
    if not re.fullmatch(r'v\d+\.\d+\.\d+',tag) or tag!='v'+version():raise ValueError('Numbered release tag must match manifest version')
    subprocess.run(['git','merge-base','--is-ancestor','HEAD','refs/remotes/origin/main'],cwd=ROOT,check=True)
    def git(ref):return subprocess.check_output(['git','rev-parse',ref],cwd=ROOT,text=True).strip()
    if git('HEAD')!=git(tag+'^{commit}'):raise ValueError('Checkout differs from release tag')
    data=json.loads(subprocess.check_output(['gh','release','view',tag,'--repo',os.environ['GITHUB_REPOSITORY'],'--json','isDraft,isPrerelease'],cwd=ROOT,text=True))
    if data['isDraft'] or data['isPrerelease']:raise ValueError('Drafts and previews cannot be submitted')
    print('Verified',tag)
if __name__=='__main__':main()
