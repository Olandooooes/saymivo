import test from 'node:test';import assert from 'node:assert/strict';
import {projectFaceRectangle,suggestSideTextZones} from '../src/visual-profile-layout.mjs';
const face={x:.4,y:.3,w:.2,h:.4,confidence:.9};
test('source face rectangles follow cover crop, zoom and vertical shift without mutating input',()=>{
 const before=structuredClone(face),p=projectFaceRectangle(face,{sourceWidth:1280,sourceHeight:720,scale:1.2,shiftY:-5});
 assert.ok(Math.abs(p.x-.38)<1e-9);assert.ok(Math.abs(p.y-.21)<1e-9);assert.ok(Math.abs(p.w-.24)<1e-9);assert.deepEqual(face,before);
 const square=projectFaceRectangle({x:.25,y:.4,w:.5,h:.2,confidence:.9},{sourceWidth:1000,sourceHeight:1000});
 assert.equal(square.x,.25);assert.ok(Math.abs(square.y-(.4*1920-420)/1080)<1e-9);
 assert.equal(projectFaceRectangle(face,{sourceWidth:0,sourceHeight:720}),null);
});
test('left, centre and right people yield different candidate sides; missing or crowded detections do not invent safety',()=>{
 assert.deepEqual(suggestSideTextZones([face]).zones.map(z=>z.side),['left','right']);
 assert.deepEqual(suggestSideTextZones([{...face,x:.05,w:.3}]).zones.map(z=>z.side),['right']);
 assert.deepEqual(suggestSideTextZones([{...face,x:.65,w:.3}]).zones.map(z=>z.side),['left']);
 assert.equal(suggestSideTextZones([]).status,'needs-review');
 assert.equal(suggestSideTextZones([{...face,x:.08,w:.84}]).status,'needs-review');
 assert.equal(suggestSideTextZones([{...face,confidence:.2}]).zones.length,0);
});
