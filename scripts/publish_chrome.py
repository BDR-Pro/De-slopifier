#!/usr/bin/env python3
"""Upload/submit an existing Chrome Web Store item with API v2. Credentials from environment only."""
import argparse,json,os,re,sys,time,urllib.error,urllib.parse,urllib.request,zipfile
from pathlib import Path
SECRETS=[]
def redact(text):
    for value in SECRETS:
        if value:text=text.replace(value,'[REDACTED]')
    return text

def request(url,method='GET',data=None,token=None,content_type='application/json'):
    headers={'Accept':'application/json'}
    if data is not None:headers['Content-Type']=content_type
    if token:headers['Authorization']='Bearer '+token
    req=urllib.request.Request(url,data=data,headers=headers,method=method)
    try:
        with urllib.request.urlopen(req,timeout=90) as result:return json.load(result)
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f'HTTP {exc.code}: '+redact(exc.read(8000).decode('utf-8','replace'))[:1800]) from None
    except urllib.error.URLError:
        raise RuntimeError('Connection failed. Inspect the dashboard before retrying an upload.') from None

def upload_state(result):
    value=result.get('uploadState') or result.get('lastAsyncUploadState')
    return {'UPLOAD_SUCCEEDED':'SUCCEEDED','UPLOAD_FAILED':'FAILED','UPLOAD_IN_PROGRESS':'IN_PROGRESS'}.get(value,value)

def wait_upload(first,status,sleep=time.sleep,attempts=60):
    current=first
    for attempt in range(attempts+1):
        state=upload_state(current)
        if state=='SUCCEEDED':return
        if state!='IN_PROGRESS':raise RuntimeError(f'Upload failed or unknown state: {state}')
        if attempt==attempts:break
        sleep(5);current=status()
    raise RuntimeError('Upload timed out. Inspect the dashboard before retrying.')

def matches(revision,version):
    return any(c.get('crxVersion')==version for c in revision.get('distributionChannels',[]))

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--zip',required=True,type=Path)
    ap.add_argument('--mode',choices=['upload','publish'],default='publish');args=ap.parse_args()
    names=('CWS_PUBLISHER_ID','CWS_EXTENSION_ID','CWS_CLIENT_ID','CWS_CLIENT_SECRET','CWS_REFRESH_TOKEN')
    missing=[n for n in names if not os.getenv(n)]
    if missing:ap.error('Missing configuration: '+', '.join(missing))
    publisher,item,client,secret,refresh=(os.environ[n] for n in names);SECRETS.extend((client,secret,refresh))
    if not re.fullmatch('[a-p]{32}',item) or not re.fullmatch(r'[\w-]+',publisher):ap.error('Invalid publisher/item ID')
    with zipfile.ZipFile(args.zip) as z:version=json.loads(z.read('manifest.json'))['version']
    auth=request('https://oauth2.googleapis.com/token','POST',urllib.parse.urlencode({'client_id':client,'client_secret':secret,'refresh_token':refresh,'grant_type':'refresh_token'}).encode(),content_type='application/x-www-form-urlencoded')
    token=auth['access_token'];SECRETS.append(token)
    if os.getenv('GITHUB_ACTIONS')=='true':print('::add-mask::'+token)
    name=f'publishers/{publisher}/items/{item}';base='https://chromewebstore.googleapis.com/v2/'+name
    status=lambda:request(base+':fetchStatus',token=token)
    state=status()
    if state.get('takenDown'):raise RuntimeError('Item is taken down; resolve the dashboard issue first')
    if matches(state.get('publishedItemRevisionStatus',{}),version):print('Version already published; no upload');return
    pending=state.get('submittedItemRevisionStatus',{})
    if pending.get('state') in ('PENDING_REVIEW','STAGED'):
        if matches(pending,version):print('Version already submitted/staged; inspect the dashboard');return
        raise RuntimeError('Another version is pending. It will not be cancelled automatically.')
    result=request('https://chromewebstore.googleapis.com/upload/v2/'+name+':upload','POST',args.zip.read_bytes(),token,'application/zip')
    if result.get('crxVersion') and result['crxVersion']!=version:raise RuntimeError('Uploaded version mismatch; not publishing')
    wait_upload(result,status)
    if args.mode=='upload':print('Uploaded only. Submit the existing draft through the dashboard.');return
    result=request(base+':publish','POST',json.dumps({'publishType':'DEFAULT_PUBLISH','skipReview':False,'blockOnWarnings':True}).encode(),token)
    if result.get('state') not in ('PENDING_REVIEW','STAGED','PUBLISHED','PUBLISHED_TO_TESTERS'):raise RuntimeError('Unexpected publication state; inspect the dashboard')
    print('Submission state:',result['state'],'— submission is not a guarantee of public approval.')
    print('Listing URL (may not be public yet): https://chromewebstore.google.com/detail/de-slopifier/'+item)
if __name__=='__main__':
    try:main()
    except (OSError,ValueError,RuntimeError,KeyError,zipfile.BadZipFile) as exc:print(redact(f'Chrome submission failed: {exc}'),file=sys.stderr);sys.exit(1)
