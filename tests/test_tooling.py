"""No-credential packaging and publisher-helper tests; API calls are mocked."""
import contextlib,hashlib,io,json,os,subprocess,sys,tempfile,unittest,zipfile
from pathlib import Path
from unittest import mock
ROOT=Path(__file__).resolve().parents[1];sys.path[:0]=[str(ROOT),str(ROOT/'scripts')]
import build
import github_release as release
import publish_chrome as chrome

class Packaging(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory();cls.out=Path(cls.tmp.name)/'build'
        subprocess.run([sys.executable,str(ROOT/'build.py'),'--out',str(cls.out)],check=True,capture_output=True)
    @classmethod
    def tearDownClass(cls):cls.tmp.cleanup()
    def package(self,name):return self.out/'release'/f'de-slopifier-{build.version()}-{name}.zip'
    def test_chromium_root_manifest(self):
        with zipfile.ZipFile(self.package('chromium')) as z:
            m=json.loads(z.read('manifest.json'));self.assertEqual(m['name'],'De-slopifier');self.assertNotIn('browser_specific_settings',m)
            self.assertEqual(set(m['permissions']),{'storage','activeTab'})
    def test_firefox_manifest_identity(self):
        with zipfile.ZipFile(self.package('firefox')) as z:
            g=json.loads(z.read('manifest.json'))['browser_specific_settings']['gecko']
            self.assertEqual(g['id'],json.loads((ROOT/'project.json').read_text())['firefox_id'])
            self.assertEqual(g['data_collection_permissions'],{'required':['none']})
    def test_runtime_source_and_icons_match(self):
        for flavor in ('chromium','firefox'):
            with zipfile.ZipFile(self.package(flavor)) as z:
                for p,name in build.files(ROOT/'src'):
                    if name!='manifest.json':self.assertEqual(z.read(name),p.read_bytes())
    def test_referenced_files_exist(self):
        with zipfile.ZipFile(self.package('chromium')) as z:
            m=json.loads(z.read('manifest.json'));names=set(z.namelist())
            needed=list(m['icons'].values())+[m['action']['default_popup'],m['options_ui']['page']]
            for s in m['content_scripts']:needed+=s['js']+s.get('css',[])
            self.assertTrue(set(needed)<=names)
    def test_source_archive_complete(self):
        with zipfile.ZipFile(self.package('source')) as z:
            self.assertTrue({'README.md','LICENSE','PRIVACY.md','TESTING.md','build.py','docs/PUBLISHING.md','tests/test_tooling.py','scripts/bootstrap_github.py'}<=set(z.namelist()))
            self.assertEqual(len([n for n in z.namelist() if n.startswith('.github/workflows/')]),4)
    def test_source_excludes_generated_files(self):
        with zipfile.ZipFile(self.package('source')) as z:
            for n in z.namelist():
                self.assertFalse(n.startswith(('dist/','.git/','.env','node_modules/')))
                self.assertNotIn('__pycache__',n);self.assertNotIn('browser-results',n)
    def test_checksums(self):
        lines=(self.out/'release/SHA256SUMS').read_text().splitlines();self.assertEqual(len(lines),3)
        for line in lines:
            digest,name=line.split('  ',1);self.assertEqual(digest,hashlib.sha256((self.out/'release'/name).read_bytes()).hexdigest())
    def test_reproducible_build(self):
        before={p.name:p.read_bytes() for p in (self.out/'release').iterdir()}
        subprocess.run([sys.executable,str(ROOT/'build.py'),'--out',str(self.out)],check=True,capture_output=True)
        self.assertEqual(before,{p.name:p.read_bytes() for p in (self.out/'release').iterdir()})
    def test_cannot_overwrite_source(self):
        for dest in (ROOT,ROOT/'src',ROOT/'docs'):
            p=subprocess.run([sys.executable,str(ROOT/'build.py'),'--out',str(dest)],capture_output=True)
            self.assertNotEqual(p.returncode,0)
    def test_bootstrap_dry_run_no_mutation(self):
        before=(ROOT/'.git').exists()
        p=subprocess.run([sys.executable,str(ROOT/'scripts/bootstrap_github.py'),'--dry-run'],text=True,capture_output=True,check=True)
        self.assertIn('PUBLIC repository',p.stdout);self.assertEqual(before,(ROOT/'.git').exists())

class ChromeHelpers(unittest.TestCase):
    def test_state_aliases(self):
        self.assertEqual(chrome.upload_state({'uploadState':'UPLOAD_SUCCEEDED'}),'SUCCEEDED')
        self.assertEqual(chrome.upload_state({'lastAsyncUploadState':'IN_PROGRESS'}),'IN_PROGRESS')
    def test_success_no_poll(self):
        status=mock.Mock();chrome.wait_upload({'uploadState':'SUCCEEDED'},status);status.assert_not_called()
    def test_poll_completion(self):
        status=mock.Mock(return_value={'lastAsyncUploadState':'SUCCEEDED'})
        chrome.wait_upload({'uploadState':'IN_PROGRESS'},status,sleep=lambda _:None,attempts=1)
        status.assert_called_once()
    def test_fail_closed(self):
        for value in ('FAILED',None,'UNKNOWN'):
            with self.assertRaises(RuntimeError):chrome.wait_upload({'uploadState':value},mock.Mock())
    def test_timeout_bounded(self):
        status=mock.Mock(return_value={'lastAsyncUploadState':'IN_PROGRESS'})
        with self.assertRaisesRegex(RuntimeError,'timed out'):chrome.wait_upload({'uploadState':'IN_PROGRESS'},status,sleep=lambda _:None,attempts=2)
        self.assertEqual(status.call_count,2)
    def test_revision_matching(self):
        self.assertTrue(chrome.matches({'distributionChannels':[{'crxVersion':'0.1.0'}]},'0.1.0'))
        self.assertFalse(chrome.matches({},'0.1.0'))
    def test_redaction(self):
        with mock.patch.object(chrome,'SECRETS',['fixture-secret']):self.assertEqual(chrome.redact('bad fixture-secret'),'bad [REDACTED]')

class ReleaseHelpers(unittest.TestCase):
    def execute(self,existing,ref=None):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);assets=root/'dist/release';assets.mkdir(parents=True)
            for name in ('chromium','firefox','source'):(assets/f'de-slopifier-0.1.0-{name}.zip').write_bytes(b'fixture')
            (assets/'SHA256SUMS').write_text('fixture')
            def fake_gh(*args,**kwargs):return json.dumps([existing]) if '--slurp' in args else ''
            def fake_api(path,*args,**kwargs):
                if path.endswith('/git/ref/tags/v0.1.0'):return ref
                return None if kwargs.get('allow_404') else {}
            with mock.patch.object(release,'ROOT',root),mock.patch.object(release,'version',return_value='0.1.0'),mock.patch.dict(os.environ,{'GITHUB_REPOSITORY':'test/De-slopifier','GITHUB_SHA':'a'*40},clear=True),mock.patch.object(release,'gh',side_effect=fake_gh) as gh,mock.patch.object(release,'api',side_effect=fake_api),contextlib.redirect_stdout(io.StringIO()) as out:
                error=None
                try:release.main()
                except ValueError as exc:error=exc
                return gh.call_args_list,out.getvalue(),error
    def test_initial_draft_upload_publish_order(self):
        calls,text,error=self.execute([]);self.assertIsNone(error)
        stable=[c.args for c in calls if len(c.args)>2 and c.args[2]=='v0.1.0']
        self.assertEqual([c[1] for c in stable],['create','upload','edit']);self.assertIn('--draft',stable[0]);self.assertIn('created=true',text)
    def test_numbered_release_not_overwritten(self):
        calls,text,error=self.execute([{'tag_name':'v0.1.0','draft':False,'prerelease':False}]);self.assertIsNone(error)
        self.assertFalse(any(len(c.args)>2 and c.args[2]=='v0.1.0' for c in calls));self.assertIn('created=false',text)
    def test_numbered_tag_not_moved(self):
        _,_,error=self.execute([],{'object':{'type':'commit','sha':'b'*40}});self.assertIn('will not be moved',str(error))
    def test_rollback_rejected(self):
        _,_,error=self.execute([{'tag_name':'v0.2.0','draft':False,'prerelease':False}]);self.assertIn('must increase',str(error))
    def test_draft_resume_commit_check(self):
        _,_,error=self.execute([{'tag_name':'v0.1.0','draft':True,'prerelease':False,'target_commitish':'b'*40}]);self.assertIn('different source commit',str(error))

if __name__=='__main__':unittest.main()
