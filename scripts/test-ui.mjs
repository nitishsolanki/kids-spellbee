import {JSDOM} from 'jsdom';
import {loadPyodide} from 'pyodide';
import {readFile} from 'node:fs/promises';
import {runInContext} from 'node:vm';
import assert from 'node:assert/strict';
const dom=new JSDOM(await readFile('docs/index.html','utf8'),{url:'http://localhost/',runScripts:'outside-only'});
const w=dom.window;
w.scrollTo=()=>{};w.confirm=()=>true;
w.localStorage.setItem('little-bee-v1',JSON.stringify({profiles:[{name:'Old player'}],history:[{score:5}]}));
let voices=[],spoken=[],onVoicesChanged;
w.SpeechSynthesisUtterance=class {constructor(text){this.text=text;}};
w.speechSynthesis={getVoices:()=>voices,cancel:()=>{},speak:utterance=>spoken.push(utterance),addEventListener:(event,handler)=>{if(event==='voiceschanged')onVoicesChanged=handler;}};
const py=await loadPyodide();
w.loadPyodide=async()=>py;
w.fetch=async path=>{const body=await readFile('docs/'+path,'utf8');return {ok:true,text:async()=>body,json:async()=>JSON.parse(body)};};
const code=(await readFile('docs/app.js','utf8')).replace('export function lettersFromSpeech','function lettersFromSpeech');
runInContext(code,dom.getInternalVMContext());
const $=id=>w.document.getElementById(id);
await new Promise((resolve,reject)=>{const deadline=Date.now()+15000;const check=()=>{if(!$('start').disabled)return resolve();if(Date.now()>deadline)return reject(Error($('load-status').textContent));setTimeout(check,10);};check();});
$('count').value='5';$('start').click();
assert.equal($('round').hidden,false);
const answer=py.runPython("bee.current()['word']");
assert.equal($('mystery').textContent,'A little mystery word.');
w.document.querySelector('[data-hint="sentence"]').click();
assert.ok(!$('hint').textContent.includes(answer));
$('spelling').value='zzzz';$('answer-form').dispatchEvent(new w.Event('submit',{cancelable:true}));
assert.equal($('next').hidden,true);
assert.equal($('mystery').textContent,'A little mystery word.');
$('spelling').value=answer;$('answer-form').dispatchEvent(new w.Event('submit',{cancelable:true}));
assert.equal($('mystery').textContent,answer);
assert.equal($('next').hidden,false);
$('end').click();
assert.equal($('results').hidden,false);
assert.equal($('answers').children.length,5);
assert.equal($('score').textContent,'1 / 5 correct');
$('again').click();w.document.querySelector('[data-mode="contest"]').click();$('start').click();
for(let i=0;i<5;i++){
 $('spelling').value='zzzz';$('answer-form').dispatchEvent(new w.Event('submit',{cancelable:true}));
 assert.equal($('feedback').textContent,'Answer saved. Keep going!');
 assert.equal($('mystery').textContent,'A little mystery word.');
 $('next').click();
}
assert.equal($('score').textContent,'0 / 5 correct');
assert.equal($('answers').children.length,5);
assert.equal(w.localStorage.getItem('little-bee-v1'),null);
assert.equal($('leaderboard'),null);
assert.equal(runInContext("lettersFromSpeech('bee ay tee')",dom.getInternalVMContext()),'bat');
assert.equal(runInContext("lettersFromSpeech('double you eye en')",dom.getInternalVMContext()),'win');
// Device voices may arrive after startup; settings affect prompts and hints.
assert.equal($('reading-voice').options.length,1);
voices=[{name:'Gentle US',lang:'en-US',voiceURI:'gentle-us'},{name:'English UK',lang:'en-GB',voiceURI:'uk'},{name:'French',lang:'fr-FR',voiceURI:'fr'}];
onVoicesChanged();
assert.equal($('reading-voice').options.length,3);
$('reading-voice').value='uk';$('reading-voice').dispatchEvent(new w.Event('change'));
$('speech-speed').value='0.5';$('speech-speed').dispatchEvent(new w.Event('input'));
$('voice-preview').click();
assert.equal(spoken.at(-1).rate,.5);assert.equal(spoken.at(-1).voice.voiceURI,'uk');
assert.equal(spoken.at(-1).lang,'en-GB');
// Every worksheet pattern supports both an activity and hidden-word spelling.
const patternData=JSON.parse(await readFile('docs/patterns.json','utf8')).lessons;
assert.equal(patternData.length,11);
$('patterns-tab').click();
assert.equal($('patterns').hidden,false);
assert.equal($('pattern-select').options.length,11);
for(const pattern of patternData){
 $('pattern-select').value=pattern.id;$('pattern-select').dispatchEvent(new w.Event('change'));
 assert.equal($('pattern-title').textContent,pattern.title);
 assert.equal($('pattern-words').children.length,pattern.core.length);
 $('pattern-words').children[0].click();assert.equal(spoken.at(-1).text,pattern.core[0]);
 $('pattern-quiz-start').click();
 for(let i=0;i<5;i++){
  const question=runInContext('quiz[quizIndex]',dom.getInternalVMContext());
  if(question.choices){const input=[...w.document.querySelectorAll('input[name="pattern-answer"]')].find(x=>x.value===question.answer);input.checked=true;}
  else $('activity-input').value=question.answer;
  $('activity-form').dispatchEvent(new w.Event('submit',{cancelable:true}));
  assert.ok($('activity-feedback').textContent.startsWith('You got it!'));
  $('activity-next').click();
 }
 assert.equal($('activity-score').textContent,'5 / 5 correct');
 assert.equal($('activity-review').children.length,5);
 $('activity-again').click();$('pattern-spell-start').click();
 assert.equal($('round').hidden,false);assert.equal(w.document.querySelector('.hint-buttons').hidden,true);
 for(let i=0;i<5;i++){
  const word=py.runPython("bee.current()['word']");assert.ok(pattern.words.includes(word));
  assert.equal($('mystery').textContent,'A little mystery word.');
  $('spelling').value=word;$('answer-form').dispatchEvent(new w.Event('submit',{cancelable:true}));$('next').click();
 }
 assert.equal($('score').textContent,'5 / 5 correct');$('again').click();assert.equal($('patterns').hidden,false);
}
// Wrong activity answers count once, and a fresh round has a clean slate.
$('pattern-quiz-start').click();
const wrongQuestion=runInContext('quiz[quizIndex]',dom.getInternalVMContext());
$('activity-input').value='zzzz';$('activity-form').dispatchEvent(new w.Event('submit',{cancelable:true}));
assert.ok($('activity-feedback').textContent.startsWith('Good try!'));
$('activity-form').dispatchEvent(new w.Event('submit',{cancelable:true}));
assert.equal(runInContext('quizAnswers.length',dom.getInternalVMContext()),1);
$('back-to-lesson').click();
$('spelling-tab').click();$('start').click();
assert.equal(w.document.querySelector('.hint-buttons').hidden,false);
assert.equal(py.runPython('bee.mode'),'contest');
assert.ok(JSON.parse(await readFile('docs/words.json','utf8')).some(item=>item.word===py.runPython("bee.current()['word']")));
$('end').click();
// Only audio preferences survive a reload; no names, scores, or difficulty history.
const audio=JSON.parse(w.localStorage.getItem('little-bee-settings'));
assert.deepEqual(Object.keys(audio).sort(),['rate','voice']);assert.equal(audio.rate,.5);
assert.equal(w.localStorage.length,1);
const reloaded=new JSDOM(await readFile('docs/index.html','utf8'),{url:'http://localhost/',runScripts:'outside-only'});
const rw=reloaded.window;rw.scrollTo=()=>{};rw.localStorage.setItem('little-bee-settings',JSON.stringify(audio));
rw.loadPyodide=w.loadPyodide;rw.fetch=w.fetch;rw.speechSynthesis=w.speechSynthesis;rw.SpeechSynthesisUtterance=w.SpeechSynthesisUtterance;
runInContext(code,reloaded.getInternalVMContext());
await new Promise((resolve,reject)=>{const deadline=Date.now()+15000;const check=()=>{if(!rw.document.getElementById('start').disabled)return resolve();if(Date.now()>deadline)return reject(Error('Reload timed out'));setTimeout(check,10);};check();});
assert.equal(rw.document.getElementById('reading-voice').value,'uk');
assert.equal(rw.document.getElementById('speech-speed').value,'0.5');
assert.equal(runInContext('lastResult',reloaded.getInternalVMContext()),null);
assert.equal(Object.keys(runInContext('saved.seen',reloaded.getInternalVMContext())).length,0);
reloaded.window.close();
dom.window.close();
console.log('DOM integration passed: spelling, voice controls, all 11 pattern activities and spelling pools, removal of saved progress.');
