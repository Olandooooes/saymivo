import test from 'node:test';import assert from 'node:assert/strict';
import {emphasisThemeVars} from '../src/emphasis-theme.mjs';
import {knowledgePlan} from '../src/presentation.mjs';
test('light and dark scene emphasis use separate colours; template rebuilding keeps the selected theme',()=>{
 const vars=emphasisThemeVars('tech-indigo');assert.notEqual(vars['--koubo-emphasis'],vars['--koubo-emphasis-on-dark']);assert.equal(vars['--koubo-emphasis-stroke'],'0px transparent');
 for(const emphasisTheme of ['tech-indigo','tech-violet','reference-yellow'])assert.equal(knowledgePlan([],[],{emphasisTheme}).presentation.emphasisTheme,emphasisTheme);
 assert.equal(knowledgePlan([],[],{emphasisTheme:'unknown'}).presentation.emphasisTheme,undefined);
 assert.equal(emphasisThemeVars()['--koubo-emphasis'],'#efff24');
});
