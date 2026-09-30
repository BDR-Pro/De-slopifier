#!/usr/bin/env python3
"""Create a new PUBLIC repository and push this project. Requires Git, authenticated gh, and Node 22+."""
import argparse,json,re,shutil,subprocess,sys,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from build import source_files,version

def run(*args,capture=False,check=True):return subprocess.run(list(args),cwd=ROOT,check=check,text=True,capture_output=capture)
def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--owner',default='BDR-Pro')
    ap.add_argument('--dry-run',action='store_true');ap.add_argument('--no-wait',action='store_true');args=ap.parse_args()
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9-]{0,38}',args.owner):ap.error('Invalid owner login')
    repo=args.owner+'/De-slopifier'
    if args.dry_run:
        print(f'Would create PUBLIC repository {repo}, push {len(list(source_files()))} source files, and build v{version()} plus rolling. Store publishing stays disabled until configured.');return
    for tool in ('git','gh','node'):
        if not shutil.which(tool):ap.error(f'Install {tool} first; see docs/GITHUB-SETUP.md')
    if (ROOT/'.git').exists() or run('git','rev-parse','--show-toplevel',capture=True,check=False).returncode==0:
        ap.error('Refusing to initialize inside an existing Git repository. See recovery instructions.')
    run('gh','auth','status','--hostname','github.com');user=json.loads(run('gh','api','user',capture=True).stdout)
    check=run('gh','api',f'repos/{repo}',capture=True,check=False)
    if check.returncode==0:ap.error('Target already exists; it will not be overwritten or made public')
    if 'HTTP 404' not in check.stderr:raise RuntimeError(check.stderr or 'Could not check target repository')
    config=json.loads((ROOT/'project.json').read_text(encoding='utf-8'));old=config['repository']
    if old!=repo:
        for p,_ in source_files():
            if p.suffix in ('.md','.json','.py','.yml','.yaml','.html'):
                p.write_text(p.read_text(encoding='utf-8').replace(old,repo),encoding='utf-8')
    run('node','--test','tests/test_core.cjs')
    run(sys.executable,'-m','unittest','discover','-s','tests','-p','test_tooling*.py','-v')
    run(sys.executable,'build.py');run('git','init','-b','main')
    for key,value in [('user.name',user.get('name') or user['login']),('user.email',f'{user["id"]}+{user["login"]}@users.noreply.github.com')]:
        if run('git','config','--get',key,capture=True,check=False).returncode:run('git','config','--local',key,value)
    run('git','add','--',*[str(p.relative_to(ROOT)) for p,_ in source_files()])
    run('git','commit','-m','Initial De-slopifier release: session counts, promoted-post hiding, and publishing workflows')
    run('gh','repo','create',repo,'--public','--source','.','--remote','origin','--push','--description',config['description'])
    print('Created repository: https://github.com/'+repo)
    if args.no_wait:return
    sha=run('git','rev-parse','HEAD',capture=True).stdout.strip();run_id=None
    for _ in range(30):
        p=run('gh','run','list','--repo',repo,'--workflow','release.yml','--commit',sha,'--json','databaseId','--limit','1',capture=True,check=False)
        if p.returncode==0 and json.loads(p.stdout):run_id=str(json.loads(p.stdout)[0]['databaseId']);break
        time.sleep(2)
    if not run_id:raise RuntimeError('Repository created, but no release run appeared. Inspect Actions.')
    run('gh','run','watch',run_id,'--repo',repo,'--exit-status')
    print(run('gh','release','view','v'+version(),'--repo',repo,'--json','url','--jq','.url',capture=True).stdout)
    print('Store publication requires separate setup; see docs/PUBLISHING.md.')
if __name__=='__main__':
    try:main()
    except (OSError,RuntimeError,ValueError,subprocess.CalledProcessError) as exc:print(f'Setup stopped: {exc}. Completed work is not rolled back. See docs/GITHUB-SETUP.md.',file=sys.stderr);sys.exit(1)
