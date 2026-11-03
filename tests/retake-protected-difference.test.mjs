import test from 'node:test';
import assert from 'node:assert/strict';
import {protectedDifference} from '../scripts/retake-protected-difference.mjs';

const cases=[
 ['shifted AI','现在谈AI','现在回到开头的问题AI是否能完成任务',false],
 ['numeric assertion negation','3个都需要','3个都不需要',true],
 ['negative noun completion','先检查一个','先检查一个没有变化的功能',false],
 ['decimal change','需要1.5小时','需要15小时',true],
 ['Chinese count change','需要三次检查','需要五次检查',true],
 ['Chinese price change','这个步骤需要一百元','这个步骤需要一千元',true],
 ['name change','使用Qwen识别','使用Gemini识别',true],
 ['name disappears','现在谈AI','现在回到开头的问题是否能完成任务',true],
 ['name ordering','使用Qwen和Gemini','使用Gemini和Qwen',true],
 ['added leading negation','会修改原文件','不会修改原文件',true],
 ['removed negation','不会修改原文件','会修改原文件',true],
 ['negation after name','使用AI生成输出','使用AI不生成输出',true],
 ['negation before number','使用AI处理3个文件','使用AI不处理3个文件',true],
 ['negative sign','需要-2元','需要2元',true],
 ['positive sign','需要+2元','需要2元',true],
 ['percentage','需要2%','需要2元',true],
 ['new negation inside numeric scope','3个都需要','3个都不再需要',true],
 ['long numeric assertion negation','我们现在有3个需要检查的文件','我们现在有3个不需要检查的文件',true],
 ['negation before delayed name','现在谈AI','现在不回到开头的问题AI是否能完成任务',true],
 ['assertion preserved with new tail','采用AI','采用AI但不保存结果',false],
 ['noun completion with count','需要3个','需要3个没有变化的文件',false],
 ['negation before noun completion','先检查一个','先不检查一个没有变化的功能',true],
 ['unmatched ordinary tail and new negation','先检查输入','先确认没有变动的输入',true],
 ['ordinary completion','我们先检查一个','我们先检查一个完整功能',false],
 ['numeric completion','需要1.50小时','需要1.50小时完成',false],
];
for(const [name,before,after,expected]of cases)test(name,()=>assert.equal(protectedDifference(before,after),expected));
