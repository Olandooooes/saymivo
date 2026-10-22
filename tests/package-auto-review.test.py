"""Focused closure/security tests; no ZIP, render, model or production writes."""
import copy
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('package_auto_review',Path(__file__).resolve().parents[1]/'scripts/package-auto-review.py')
packager=importlib.util.module_from_spec(spec)
spec.loader.exec_module(packager)


class PackagePlanTest(unittest.TestCase):
    def setUp(self):
        self.temporary=tempfile.TemporaryDirectory(prefix='koubo-package-plan-')
        self.root=Path(self.temporary.name)/'project'
        self.root.mkdir()
        self.source='clips/voice.mp4'
        self.project_id='auto-fixture'
        self.prefix='fixture-full'
        for directory in ('src','editor','server','scripts','tests','public/projects','public/exports','public/clips/transcripts/recognition-fe2f8f89fbec','public/broll-assets','public/fonts','inspection/agent-reference'):
            (self.root/directory).mkdir(parents=True,exist_ok=True)
        for name in ('package.json','package-lock.json','tsconfig.json','vite.config.ts','remotion.config.ts','requirements-local.txt','LICENSE','REFERENCE-TARGET.md','CURRENT-ACCEPTANCE.md','.auto-media-library.json'):
            self.write(name,'{}')
        (self.root.parent/'AI-Agent-真人口播-2026-10-21.mov').write_bytes(b'original MOV fixture')
        self.write('public/clips/voice.mp4','source fixture')
        self.write('public/exports/auto-fixture.mp4','reviewed export fixture')
        self.write('public/broll-assets/before.png','source image fixture')
        self.write('public/broll-assets/after.png','accepted result fixture')
        self.write('public/fonts/test-font.ttf','font fixture')
        self.write('public/fonts/test-font-OFL.txt','licence fixture')
        self.raw=[{'word':'原话','startMs':1000,'endMs':2000}]
        self.write('public/clips/transcripts/recognition-fe2f8f89fbec/voice.json',self.raw)
        self.write('public/clips/transcripts/recognition-fe2f8f89fbec/voice.meta.json',{'engine':'faster-whisper','model':'/outside/never-read-historical-model'})
        self.project={'name':'Fixture','clips':[{'id':'raw','src':self.source,'inSec':0,'outSec':8}],'captions':[{'id':'cue','clipId':'raw','startMs':1000,'endMs':2000,'words':[{'text':'原话','startMs':1000,'endMs':2000}]}],'presentation':{'scenes':[{'id':'return','layout':'overview','overviewComparison':{'before':{'src':'broll-assets/before.png','label':'原片','atMs':0},'after':{'src':'broll-assets/after.png','label':'成片','atMs':1000},'steps':[{'id':'captions','text':'字幕','atMs':500}]}}]}}
        self.review={'project':'public/projects/auto-fixture.json','video':'public/exports/auto-fixture.mp4','videoSha256':packager.file_sha(self.root/'public/exports/auto-fixture.mp4'),'audio':{'identityReport':'identity.json'}}
        self.write('inspection/agent-reference/identity.json',{'equal':True})
        self.write('inspection/agent-reference/fixture-full-storyboard.md','Current storyboard')
        self.write('inspection/agent-reference/fixture-full-transition-manifest.json',{})
        self.sync()

    def tearDown(self):
        self.temporary.cleanup()

    def write(self,name,value):
        path=self.root/name
        path.parent.mkdir(parents=True,exist_ok=True)
        path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n' if isinstance(value,(dict,list)) else value)
        return path

    def sync(self,legacy=False):
        self.write('public/projects/auto-fixture.json',self.project)
        for name in ('fixture-full-review.json','fixture-full-visual-review.json'):
            (self.root/'inspection/agent-reference'/name).unlink(missing_ok=True)
        self.write('inspection/agent-reference/fixture-full-'+('visual-review' if legacy else 'review')+'.json',self.review)

    def plan(self):
        return packager.build_plan(self.root,self.project_id,self.prefix,'v3')

    def clocked(self):
        base='public/clips/transcripts/clock-provenance/'+'a'*64
        paths={'legacyRawPath':base+'/legacy/recognition-fe2f8f89fbec/voice.json','legacyMetaPath':base+'/legacy/recognition-fe2f8f89fbec/voice.meta.json','legacyWavPath':base+'/legacy/audio/voice.wav','sourceZeroWavPath':base+'/source-zero/voice.wav'}
        self.write(paths['legacyRawPath'],self.raw)
        self.write(paths['legacyMetaPath'],{'model':'/outside/never-read-historical-model'})
        self.write(paths['legacyWavPath'],'legacy WAV byte fixture')
        self.write(paths['sourceZeroWavPath'],'source-zero WAV byte fixture')
        clock={'version':'source-zero-v1','timestampBasis':'source-video-presentation-ms','sampleRate':16000,'channels':1,'sampleWidthBytes':2,'sourceSha256':packager.file_sha(self.root/'public/clips/voice.mp4'),'wavSha256':packager.file_sha(self.root/paths['sourceZeroWavPath']),'sourcePath':'public/clips/voice.mp4'}
        self.write(paths['sourceZeroWavPath']+'.clock.json',clock)
        raw=self.write('public/clips/transcripts/recognition-modern/voice.json',self.raw)
        artifacts=[{'path':name,'sha256':packager.file_sha(self.root/name)} for name in list(paths.values())+[paths['sourceZeroWavPath']+'.clock.json']]
        metadata={'kind':'recognition-clock-migration','model':'/outside/never-read-historical-model','sourceSha256':clock['sourceSha256'],'audioClock':clock,'recognitionSha256':packager.file_sha(raw),'migrationId':'a'*64,'migration':{**paths,'proofStorage':{'version':'project-relative-v1','baseDir':base,'sourcePath':'public/clips/voice.mp4','artifacts':artifacts}}}
        meta=self.write('public/clips/transcripts/recognition-modern/voice.meta.json',metadata)
        self.project['captions'][0]['audioClock']=clock
        self.sync()
        return meta,metadata

    def test_current_and_legacy_report_names_and_direct_comparison_assets(self):
        for legacy in (False,True):
            self.sync(legacy)
            plan=self.plan()
            self.assertIn('public/broll-assets/before.png',plan['files'])
            self.assertIn('public/broll-assets/after.png',plan['files'])
            self.assertIn('public/fonts/test-font-OFL.txt',plan['files'])
            self.assertTrue(plan['manifest']['review'].endswith('visual-review.json' if legacy else '-review.json'))
            self.assertFalse(plan['destination'].exists(),'planning must not create a ZIP')

    def test_current_closure_omits_unrelated_projects_models_dependencies_and_credentials(self):
        for name in ('public/projects/auto-unrelated.json','node_modules/dependency.json','.models/model.json','server/.env.json','server/credentials.json','server/private.key'):
            self.write(name,{'private':'fixture'})
        plan=self.plan()
        self.assertFalse(any(name in plan['files'] for name in ('public/projects/auto-unrelated.json','node_modules/dependency.json','.models/model.json','server/.env.json','server/credentials.json','server/private.key')))

    def test_relative_paths_and_symlink_escapes_are_rejected(self):
        collector=packager.PackageFiles(self.root)
        for name in ('../outside.png','/absolute.png','broll-assets/../../outside.png','C:/secret.png','broll-assets\\outside.png'):
            with self.assertRaises(ValueError):
                collector.media(name)
        outside=Path(self.temporary.name)/'outside.png'
        outside.write_text('outside fixture')
        (self.root/'public/broll-assets/escape.png').symlink_to(outside)
        with self.assertRaises(ValueError):
            collector.media('broll-assets/escape.png')
        with self.assertRaises(ValueError):
            collector.add(self.root/'package.json','../destination.json')

    def test_derived_cache_keeps_pair_and_five_verified_proofs_without_reading_model_paths(self):
        _,metadata=self.clocked()
        plan=self.plan();selected=plan['manifest']['recognitionCaches'][0]
        self.assertEqual(len(selected['provenanceArtifacts']),5)
        self.assertEqual(selected['meta'],'public/clips/transcripts/recognition-modern/voice.meta.json')
        self.assertTrue(all(item['path'] in plan['files'] for item in metadata['migration']['proofStorage']['artifacts']))
        self.assertNotIn('public/clips/transcripts/recognition-fe2f8f89fbec/voice.json',plan['files'])

    def test_missing_changed_or_escaped_proof_and_mixed_caption_clocks_fail_closed(self):
        meta,metadata=self.clocked()
        for mutate in (lambda data:data['migration']['proofStorage']['artifacts'].pop(),lambda data:data['migration']['proofStorage']['artifacts'][0].update(sha256='b'*64),lambda data:data['migration']['proofStorage']['artifacts'][0].update(path='package.json')):
            changed=copy.deepcopy(metadata);mutate(changed);meta.write_text(json.dumps(changed))
            with self.assertRaises(ValueError):
                self.plan()
        meta.write_text(json.dumps(metadata))
        self.project['captions'].append({'id':'legacy','clipId':'raw','startMs':2000,'endMs':3000,'words':[]});self.sync()
        with self.assertRaises(ValueError):
            self.plan()

    def test_reference_images_require_the_manifest_sha_but_do_not_follow_external_reference_video(self):
        sample=self.write('inspection/agent-reference/frames/current.png','sample image fixture')
        self.review['referenceManifest']='reference-manifest.json';self.sync()
        manifest={'referenceVideo':'/outside/never-read-reference.mp4','groups':[{'reference':[],'current':[{'image':'inspection/agent-reference/frames/current.png','imageSha256':packager.file_sha(sample)}]}]}
        self.write('inspection/agent-reference/reference-manifest.json',manifest)
        self.assertIn('inspection/agent-reference/frames/current.png',self.plan()['files'])
        manifest['groups'][0]['current'][0]['imageSha256']='c'*64
        self.write('inspection/agent-reference/reference-manifest.json',manifest)
        with self.assertRaises(ValueError):
            self.plan()

    def test_explicit_current_supporting_evidence_is_required(self):
        self.review['supportingEvidence']=['inspection/agent-reference/missing-current-proof.json']
        self.sync()
        with self.assertRaises(FileNotFoundError):
            self.plan()
        self.review.pop('supportingEvidence')
        self.review['visual']={'baseUnchangedSceneEvidence':'inspection/agent-reference/prior-full-review.json'}
        self.sync()
        self.write('inspection/agent-reference/prior-full-review.json',{'visual':{'viewed':['prior-full-contact.jpg']}})
        self.write('inspection/agent-reference/prior-full-contact.jpg','previous accepted image fixture')
        plan=self.plan()
        self.assertIn('inspection/agent-reference/prior-full-review.json',plan['files'])
        self.assertIn('inspection/agent-reference/prior-full-contact.jpg',plan['files'],'inherited visual evidence retains its own explicit image closure')
        (self.root/'inspection/agent-reference/prior-full-review.json').unlink()
        with self.assertRaises(FileNotFoundError):
            self.plan()


if __name__=='__main__':
    unittest.main()
