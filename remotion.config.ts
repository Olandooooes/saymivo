import {Config} from '@remotion/cli/config';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
Config.setVideoImageFormat('jpeg');
// Prefer a locally available headless browser; avoids another large download.
const root=path.join(os.homedir(),'.cache/puppeteer/chrome-headless-shell');
if(fs.existsSync(root)){
 const browsers=fs.readdirSync(root).filter(p=>p.startsWith('mac_arm-')).sort().reverse();
 for(const b of browsers){const file=path.join(root,b,'chrome-headless-shell-mac-arm64/chrome-headless-shell');if(fs.existsSync(file)){Config.setBrowserExecutable(file);break;}}
}
