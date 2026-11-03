import React, {useEffect, useState} from 'react';
import {continueRender, delayRender, staticFile} from 'remotion';
const faces = [['NotoSansSC-Black','NotoSansSC-Black.otf'],['NotoSansSC-Bold','NotoSansSC-Bold.otf'],['NotoSansSC-Medium','NotoSansSC-Medium.otf']];
export const Fonts: React.FC = () => {
  const [handle] = useState(() => delayRender('fonts'));
  useEffect(() => {
    Promise.all(faces.map(([n, f]) => { const ff = new FontFace(n, `url(${staticFile('fonts/' + f)})`); return ff.load().then((x) => (document as any).fonts.add(x)); }))
      .then(() => continueRender(handle)).catch((e) => { console.error(e); continueRender(handle); });
  }, [handle]);
  return null;
};
