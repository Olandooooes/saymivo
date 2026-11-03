import {cancelRender, continueRender, delayRender, staticFile} from 'remotion';
import {useEffect} from 'react';

const files: Record<string, string> = {
  'Noto Sans SC Black': 'fonts/NotoSansSC-Black.woff',
  'Noto Sans SC Bold': 'fonts/NotoSansSC-Bold.woff',
  'Noto Sans SC Medium': 'fonts/NotoSansSC-Medium.woff',
};

export function usePlanFonts() {
  useEffect(() => {
    const handle = delayRender('Load Noto Sans SC');
    Promise.all(Object.entries(files).map(async ([family, file]) => {
      const face = new FontFace(family, `url(${staticFile(file)})`);
      (document.fonts as FontFaceSet & {add(face: FontFace): void}).add(await face.load());
    })).then(() => continueRender(handle)).catch(error => cancelRender(error));
  }, []);
}
