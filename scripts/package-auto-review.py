"""Package one reviewed automatic project; --dry-run only inspects its closure."""
import argparse
import hashlib
import json
import re
import zipfile
from pathlib import Path, PurePosixPath

CODE_SUFFIXES={'.ts','.tsx','.mts','.mjs','.js','.cjs','.py','.sh','.swift','.json','.css','.html','.md','.txt','.svg'}
SECRET_NAMES={'credentials.json','secrets.json','service-account.json','auth.json','tokens.json','config.local.json'}
EVIDENCE_SUFFIXES={'.json','.md','.log','.png','.jpg','.jpeg','.webp'}
CLOCK_KEYS=('version','timestampBasis','sourceSha256','wavSha256','sampleRate','channels','sampleWidthBytes')
SHA=re.compile(r'^[a-f0-9]{64}$')


def file_sha(path):
    with Path(path).open('rb') as handle:
        digest=hashlib.sha256()
        for chunk in iter(lambda: handle.read(1024*1024),b''):
            digest.update(chunk)
        return digest.hexdigest()


def relative_path(value):
    if not isinstance(value,str) or not value or '\\' in value or ':' in value or '\0' in value:
        raise ValueError('Invalid relative package path')
    path=PurePosixPath(value)
    if path.is_absolute() or '..' in path.parts or str(path)=='.':
        raise ValueError('Package path escapes its root: '+value)
    return Path(*path.parts)


def clock_matches(a,b):
    if a is None and b is None:
        return True
    return all(isinstance(c,dict) and c.get('version')=='source-zero-v1' and c.get('timestampBasis')=='source-video-presentation-ms' and c.get('sampleRate')==16000 and c.get('channels')==1 and c.get('sampleWidthBytes')==2 and all(isinstance(c.get(k),str) and SHA.fullmatch(c[k]) for k in ('sourceSha256','wavSha256')) for c in (a,b)) and all(a.get(k)==b.get(k) for k in CLOCK_KEYS)


class PackageFiles:
    def __init__(self,root):
        self.root=Path(root).resolve()
        self.public=(self.root/'public').resolve()
        self.evidence=self.root/'inspection/agent-reference'
        self.files={}
        self.included_evidence=set()
        self.missing_evidence=set()
        self.evidence_queue=[]
        self.evidence_seen=set()
        self.recognition_caches=[]

    def add(self,path,name=None,original=False):
        path=Path(path)
        resolved=path.resolve(strict=True)
        if not resolved.is_file() or path.is_symlink():
            raise ValueError('Expected a regular package file: '+str(path))
        if original:
            if path!=self.root.parent/'AI-Agent-真人口播-2026-10-21.mov' or resolved!=path:
                raise ValueError('Only the explicitly named original MOV may be outside the project')
        elif not resolved.is_relative_to(self.root):
            raise ValueError('Package source escapes project: '+str(path))
        destination=relative_path(name if name is not None else path.relative_to(self.root).as_posix()).as_posix()
        if destination in self.files and self.files[destination]!=resolved:
            raise ValueError('Conflicting package destination: '+destination)
        self.files[destination]=resolved
        return resolved

    def media(self,src):
        if not src:
            return
        relative=relative_path(src)
        actual=(self.public/relative).resolve(strict=True)
        if not actual.is_relative_to(self.public):
            raise ValueError('Media escapes public: '+src)
        self.add(actual,'public/'+relative.as_posix())

    def evidence_file(self,name,required=False,expected_sha=None):
        relative=relative_path(name)
        if len(relative.parts)==1:
            relative=Path('inspection/agent-reference')/relative
        actual=(self.root/relative).resolve()
        canonical=relative.as_posix()
        if canonical in self.files:
            if expected_sha and file_sha(actual)!=expected_sha:
                raise ValueError('Evidence SHA mismatch: '+canonical)
            self.included_evidence.add(canonical)
            return
        folders=[self.evidence,self.root/'inspection/reference-audit',self.public/'projects']
        if not any(actual.is_relative_to(folder.resolve()) for folder in folders):
            raise ValueError('Review evidence outside permitted folders: '+name)
        if relative.suffix.lower() not in EVIDENCE_SUFFIXES:
            if required:
                raise ValueError('Unsupported required review evidence: '+name)
            self.missing_evidence.add(canonical+' (unsupported evidence type)')
            return
        if actual.is_relative_to(self.public/'projects') and relative.suffix!='.json':
            raise ValueError('Historical project evidence must be JSON')
        if not actual.is_file():
            if required:
                raise FileNotFoundError(name)
            self.missing_evidence.add(canonical)
            return
        self.add(self.root/relative)
        if expected_sha and file_sha(actual)!=expected_sha:
            raise ValueError('Evidence SHA mismatch: '+canonical)
        self.included_evidence.add(canonical)
        if relative.suffix=='.json' and canonical not in self.evidence_seen:
            self.evidence_seen.add(canonical)
            self.evidence_queue.append(actual)

    def source_evidence(self,value):
        if isinstance(value,dict):
            for key,child in value.items():
                if key in ('evidence','supportingEvidence') and isinstance(child,list):
                    for name in child:
                        if isinstance(name,str):
                            self.evidence_file(name,required=key=='supportingEvidence')
                elif isinstance(child,(dict,list)):
                    self.source_evidence(child)
            migration=value.get('migration')
            if isinstance(migration,dict) and isinstance(migration.get('map'),str):
                self.evidence_file(migration['map'])
        elif isinstance(value,list):
            for child in value:
                self.source_evidence(child)

    def evidence_closure(self):
        # These are report schema fields, not an arbitrary JSON path crawler.
        single=('renderInput','storyboard','ui','speedUi','storyboardDraftHttp','productionReplay','referenceManifest','referenceContact','referenceReview','referenceActualViewReport','baseUnchangedSceneEvidence')
        visual=('viewed','inspectedSheets','sheets','reports','shortSamples','unchangedSceneEvidence','baseUnchangedSceneEvidence')
        audio=('report','identityReport','inheritedWaveformReport')
        while self.evidence_queue:
            if len(self.evidence_seen)>1000:
                raise ValueError('Review evidence closure exceeds its explicit budget')
            document=json.loads(self.evidence_queue.pop(0).read_text())
            self.source_evidence(document)
            if isinstance(document,list):
                for item in document:
                    if isinstance(item,dict) and isinstance(item.get('rows'),list) and isinstance(item.get('path'),str):
                        self.evidence_file(item['path'],required=True)
                continue
            if not isinstance(document,dict):
                continue
            for key in single:
                if isinstance(document.get(key),str):
                    self.evidence_file(document[key],required=True)
            for section,keys in [('visual',visual),('audio',audio),('checks',('log',)),('media',('probe','fullDecodeLog','fullDecodeProgress'))]:
                values=document.get(section,{})
                if not isinstance(values,dict):
                    continue
                for key in keys:
                    names=values.get(key,[])
                    for name in names if isinstance(names,list) else [names]:
                        if isinstance(name,str):
                            self.evidence_file(name,required=True)
            # The comparison manifest binds each sampled image to its SHA.
            for group in document.get('groups',[]):
                if not isinstance(group,dict):
                    continue
                for entry in group.get('reference',[])+group.get('current',[]):
                    for key in ('image','sheet'):
                        if isinstance(entry.get(key),str):
                            self.evidence_file(entry[key],required=True,expected_sha=entry.get(key+'Sha256'))
            for name in document.get('referenceSheetsActuallyViewed',[]):
                if not isinstance(name,str) or Path(name).name!=name:
                    raise ValueError('Reference sheet must use an explicit basename')
                self.evidence_file('inspection/reference-audit/'+name,required=True)

    def recognition_cache(self,src,source_sha,clock):
        stem=Path(src).stem
        candidates=[]
        for meta in sorted((self.public/'clips/transcripts').glob('recognition-*/'+stem+'.meta.json')):
            data=json.loads(meta.read_text())
            raw=meta.with_name(stem+'.json')
            if not raw.is_file() or data.get('sourceSha256',source_sha if clock is None else None)!=source_sha or 'audioClock' in data and data['audioClock'] is None:
                continue
            if clock_matches(data.get('audioClock'),clock):
                candidates.append((meta,raw,data))
        # Preserve the old positional invocation's explicit medium-v2 cache.
        if clock is None:
            preferred=[c for c in candidates if c[0].parent.name=='recognition-fe2f8f89fbec']
            candidates=preferred or candidates
        if not candidates:
            raise ValueError('No matching recognition raw/meta pair for '+src)
        hashes={file_sha(raw) for _,raw,_ in candidates}
        if len(hashes)!=1:
            raise ValueError('Ambiguous recognition provenance for '+src)
        meta,raw,data=sorted(candidates,key=lambda c:(c[2].get('kind')!='recognition-clock-migration',c[0].as_posix()))[0]
        if data.get('recognitionSha256') and file_sha(raw)!=data['recognitionSha256']:
            raise ValueError('Recognition SHA mismatch: '+str(raw))
        self.add(meta);self.add(raw)
        artifacts=[]
        if data.get('kind')=='recognition-clock-migration':
            migration=data.get('migration',{});proof=migration.get('proofStorage',{})
            migration_id=data.get('migrationId','')
            if not SHA.fullmatch(migration_id) or proof.get('version')!='project-relative-v1':
                raise ValueError('Clock migration needs durable project-relative provenance')
            base=Path('public/clips/transcripts/clock-provenance')/migration_id
            if proof.get('baseDir')!=base.as_posix() or proof.get('sourcePath')!='public/'+src or data.get('audioClock',{}).get('sourcePath')!=proof['sourcePath']:
                raise ValueError('Clock provenance source/base path differs')
            if any(not isinstance(migration.get(field),str) or not migration[field].endswith(suffix) for field,suffix in (('legacyRawPath','.json'),('legacyMetaPath','.meta.json'),('legacyWavPath','.wav'),('sourceZeroWavPath','.wav'))):
                raise ValueError('Clock provenance roles must use raw/meta JSON and PCM WAV files')
            required={migration.get(key) for key in ('legacyRawPath','legacyMetaPath','legacyWavPath','sourceZeroWavPath')}
            required.add(str(migration.get('sourceZeroWavPath'))+'.clock.json')
            entries=proof.get('artifacts',[])
            if len(entries)!=5 or {item.get('path') for item in entries}!=required:
                raise ValueError('Clock provenance must contain all five dependencies')
            for item in entries:
                relative=relative_path(item.get('path'))
                if not relative.is_relative_to(base) or not SHA.fullmatch(item.get('sha256','')):
                    raise ValueError('Clock provenance artifact escapes its own migration')
                actual=self.add(self.root/relative)
                if file_sha(actual)!=item['sha256']:
                    raise ValueError('Clock provenance artifact SHA mismatch: '+str(relative))
                artifacts.append(relative.as_posix())
            receipt=json.loads((self.root/relative_path(migration['sourceZeroWavPath']+'.clock.json')).read_text())
            if receipt!=data['audioClock'] or file_sha(self.root/migration['sourceZeroWavPath'])!=clock['wavSha256']:
                raise ValueError('Clock receipt/WAV differs from the selected project')
        self.recognition_caches.append({'src':src,'raw':raw.relative_to(self.root).as_posix(),'meta':meta.relative_to(self.root).as_posix(),'sourceSha256':source_sha,'audioClock':clock,'provenanceArtifacts':artifacts})


def build_plan(root,project_id,review_prefix,package_version):
    if not re.fullmatch(r'auto-[a-z0-9-]+',project_id):
        raise ValueError('Expected automatic project id')
    if not re.fullmatch(r'[a-z0-9-]+',review_prefix) or not re.fullmatch(r'v[0-9]+',package_version):
        raise ValueError('Invalid evidence prefix or package version')
    bundle=PackageFiles(root);root=bundle.root;public=bundle.public;evidence=bundle.evidence
    project_file=public/'projects'/f'{project_id}.json';movie=public/'exports'/f'{project_id}.mp4'
    project=json.loads(project_file.read_text())
    for directory in ('src','editor','server','scripts','tests'):
        for path in sorted((root/directory).rglob('*')):
            relative=path.relative_to(root/directory)
            if not path.is_file() or any(p.startswith('.') or p in ('__pycache__','dist','node_modules') for p in relative.parts) or path.suffix not in CODE_SUFFIXES or path.name.lower() in SECRET_NAMES:
                continue
            bundle.add(path)
    for name in ('package.json','package-lock.json','tsconfig.json','vite.config.ts','remotion.config.ts','requirements-local.txt','LICENSE','REFERENCE-TARGET.md','CURRENT-ACCEPTANCE.md','.auto-media-library.json'):
        bundle.add(root/name)
    if (root/'PROJECT-WORKFLOW.md').is_file():
        bundle.add(root/'PROJECT-WORKFLOW.md')
    bundle.add(project_file);bundle.add(movie)
    bundle.add(root.parent/'AI-Agent-真人口播-2026-10-21.mov','original/AI-Agent-真人口播-2026-10-21.mov',original=True)
    for clip in project['clips']:
        bundle.media(clip['src'])
    for asset in project.get('brollAssets',[]):
        bundle.media(asset.get('src'));bundle.media(asset.get('thumb'))
    for scene in project.get('presentation',{}).get('scenes',[]):
        bundle.media(scene.get('media',{}).get('src'))
        for node in scene.get('nodes',[]):
            bundle.media(node.get('assetSrc'))
        comparison=scene.get('overviewComparison')
        if comparison:
            for side in ('before','after'):
                bundle.media(comparison[side]['src'])
        matte=scene.get('personMatte')
        if matte:
            if type(matte.get('count')) is not int or not 0<matte['count']<=18000:
                raise ValueError('Invalid person frame sequence')
            for index in range(matte['count']):
                bundle.media(matte['prefix']+f'{index:05d}.png')
    for broll in project.get('brolls',[]):
        bundle.media(broll.get('src'))
    if project.get('music'):
        bundle.media(project['music'].get('src'))
    for src in sorted({clip['src'] for clip in project['clips']}):
        source_sha=file_sha(public/relative_path(src))
        ids={clip['id'] for clip in project['clips'] if clip['src']==src}
        source_captions=[caption for caption in project.get('captions',[]) if caption.get('clipId') in ids]
        if any('audioClock' in caption and caption['audioClock'] is None for caption in source_captions):
            raise ValueError('Project captions contain an invalid null clock: '+src)
        clocks=[caption.get('audioClock') for caption in source_captions]
        clock=next((c for c in clocks if c is not None),None)
        if not all(clock_matches(clock,c) for c in clocks) or clock is not None and clock['sourceSha256']!=source_sha:
            raise ValueError('Project captions have mixed/invalid source clocks: '+src)
        bundle.recognition_cache(src,source_sha,clock)
        for suffix in ('.json','.visual.json'):
            relative=Path('clips/reviews')/(Path(src).stem+suffix)
            if (public/relative).is_file():
                record=json.loads((public/relative).read_text())
                if record.get('sourceSha256')!=source_sha or 'audioClock' in record and record['audioClock'] is None or not clock_matches(record.get('audioClock'),clock):
                    raise ValueError('Source reuse record has a different SHA/clock: '+relative.as_posix())
                bundle.media(relative.as_posix());bundle.source_evidence(record)
    for font in sorted((public/'fonts').iterdir()):
        if font.is_file() and (font.suffix.lower() in ('.ttf','.otf','.woff','.woff2') or font.suffix.lower()=='.txt' and any(word in font.name.lower() for word in ('license','ofl'))):
            bundle.media('fonts/'+font.name)
    review_file=next((path for path in (evidence/f'{review_prefix}-visual-review.json',evidence/f'{review_prefix}-review.json') if path.is_file()),None)
    if review_file is None:
        raise FileNotFoundError('No reviewed export evidence for '+review_prefix)
    review=json.loads(review_file.read_text())
    if review.get('project')!=f'public/projects/{project_id}.json' or review.get('video')!=f'public/exports/{project_id}.mp4':
        raise ValueError('Evidence belongs to another project/video')
    if review.get('videoSha256') and review['videoSha256']!=file_sha(movie):
        raise ValueError('Reviewed video SHA differs')
    if review.get('projectSha256') and review['projectSha256']!=file_sha(project_file):
        raise ValueError('Reviewed project SHA differs')
    bundle.evidence_file(review_file.relative_to(root).as_posix(),required=True)
    bundle.evidence_file(review.get('storyboard',f'{review_prefix}-storyboard.md'),required=True)
    bundle.evidence_file(f'{review_prefix}-transition-manifest.json',required=True)
    # Legacy primary reports use this fixed audio name; newer reports name an
    # inherited source-clock report/whole-PCM identity explicitly instead.
    legacy_audio=evidence/f'{review_prefix}-audio-sync.json'
    if legacy_audio.is_file():
        bundle.evidence_file(legacy_audio.relative_to(root).as_posix(),required=True)
    elif not review.get('audio'):
        raise FileNotFoundError('No audio evidence for '+review_prefix)
    family=review_prefix.removesuffix('-full')
    prepare=evidence/f'{family}-batch-prepare-proof.json'
    if prepare.is_file():
        bundle.evidence_file(prepare.relative_to(root).as_posix(),required=True)
    bundle.evidence_closure()
    manifest={'project':project_id,'scope':'单一已验收工程及显式依赖；95%未证','review':review_file.relative_to(root).as_posix(),'recognitionCaches':bundle.recognition_caches,'sourceReviewEvidence':{'included':sorted(bundle.included_evidence),'unavailable':sorted(bundle.missing_evidence)},'files':[{'path':name,'bytes':path.stat().st_size,'sha256':file_sha(path)} for name,path in sorted(bundle.files.items())]}
    destination=root/'deliverables'/f'AI-Agent-自动流程-{project_id[5:13]}-portable-{package_version}.zip'
    return {'root':root,'project':project,'projectId':project_id,'reviewPrefix':review_prefix,'files':bundle.files,'manifest':manifest,'destination':destination}


def restore_readme(plan):
    title=plan['project'].get('name') or plan['project'].get('presentation',{}).get('title') or plan['projectId']
    project_id=plan['projectId']
    return f'''# AI Agent · 可编辑工程与验收证据

本包保存一个真人原声工程、对应成片、明确引用素材、完整工作台源码、原片/视觉复用记录和参考对照证据。未证明参考还原95%。

解压后运行 `npm ci`，再运行 `npm start`，按终端地址打开编辑器，选择“{title}”。依赖安装需网络；本包不包含账户密钥、模型或node_modules。
工程：public/projects/{project_id}.json。
重新导出：`node node_modules/@remotion/cli/remotion-cli.js render src/index.ts MultiClip public/exports/rebuilt.mp4 --props=public/projects/{project_id}.json --concurrency=2`。

已保存工程的编辑和导出不需要重新识别。public/clips/reviews 的记录按原片SHA及字幕音频时钟复用；新旧时钟不可混用。source-zero缓存如为旧识别时钟转换，连同其元数据和5份完整PCM来源证据一起保存，不代表重新识别或逐词真值。
历史模型绝对路径只是来源记录，不是可读取的随包依赖；不同电脑重新识别需配置本地模型，缓存模型指纹未必自动命中。

对照图是已验收旧成片与同一原片帧的图片；不引用正在导出的新片。录屏/图片为本工程实际素材，不能证明任意素材自动加工成功或量化节省工作。

inspection/agent-reference保存当前分镜、UI/生产重放、整片检查与参考对照。音轨波形/PCM检查不等于听审或逐词声学精度证明；真实5—10分钟长片阶段仍待验收。manifest仅证明文件完整性。
manifest.sourceReviewEvidence列出附带与未找到的历史依据。少量历史工程JSON仅作证据，不附其各自全部素材；请编辑上面指定的本次工程。
'''


def write_package(plan):
    destination=plan['destination']
    if destination.exists():
        raise FileExistsError(str(destination))
    destination.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(destination,'x',compression=zipfile.ZIP_STORED) as archive:
        for name,path in sorted(plan['files'].items()):
            archive.write(path,name)
        archive.writestr('RESTORE.md',restore_readme(plan))
        archive.writestr('manifest.json',json.dumps(plan['manifest'],ensure_ascii=False,indent=2))
    with zipfile.ZipFile(destination) as archive:
        for item in plan['manifest']['files']:
            with archive.open(item['path']) as handle:
                if hashlib.file_digest(handle,'sha256').hexdigest()!=item['sha256']:
                    raise ValueError(item['path'])
    report={'archive':str(destination),'bytes':destination.stat().st_size,'files':len(plan['files']),'allReadbackDigestsMatch':True,'restoreVerified':False}
    (plan['root']/'inspection/agent-reference'/f"{plan['reviewPrefix']}-package.json").write_text(json.dumps(report,ensure_ascii=False,indent=2))
    return report


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('project_id')
    parser.add_argument('review_prefix',nargs='?',default='auto-annotated')
    parser.add_argument('package_version',nargs='?',default='v2')
    parser.add_argument('--dry-run',action='store_true',help='validate and print the exact file plan without writing an archive or report')
    args=parser.parse_args(argv)
    plan=build_plan(Path(__file__).resolve().parent.parent,args.project_id,args.review_prefix,args.package_version)
    if args.dry_run:
        report={'status':'dry-run','archive':str(plan['destination']),'archiveExists':plan['destination'].exists(),'files':len(plan['files']),'payloadBytes':sum(item['bytes'] for item in plan['manifest']['files']),'manifest':plan['manifest']}
    else:
        report=write_package(plan)
    print(json.dumps(report,ensure_ascii=False))


if __name__=='__main__':
    main()
