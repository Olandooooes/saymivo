import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {knowledgePlan} from '../src/presentation.mjs';
import {displayFontChoices,displayFontConfig} from '../src/display-fonts.mjs';
test('chosen local font and license exist and survive template rebuilding; rejected font cannot be selected',()=>{
 for(const f of displayFontChoices){assert.ok(fs.statSync('public/fonts/'+f.file).size>10000);assert.match(fs.readFileSync('public/fonts/'+f.license,'utf8'),/SIL OPEN FONT LICENSE/i);assert.equal(knowledgePlan([],[],{displayFont:f.id}).presentation.displayFont,f.id);}
 assert.equal(displayFontConfig('zcool'),undefined);assert.equal(knowledgePlan([],[],{displayFont:'zcool'}).presentation.displayFont,undefined);assert.equal(knowledgePlan([],[]).presentation.displayFont,undefined);
});
