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
assert.equal($('speech-speed').value,'1');
assert.equal($('speed-value').textContent,'1.00× · normal');
assert.equal(w.document.querySelectorAll('[data-level]').length,4);
assert.deepEqual([...$('grade').options].map(option=>option.value),['1','2']);
assert.ok([...$('grade').options].every(option=>option.textContent.includes('starter pack')));
$('count').value='5';$('start').click();
assert.equal($('round').hidden,false);
const answer=py.runPython("bee.current()['word']");
assert.equal($('mystery').textContent,'A little mystery word.');
w.document.querySelector('[data-hint="sentence"]').click();
assert.ok(!$('hint').textContent.includes(answer));
const beforeWrong=spoken.length;
$('spelling').value='zzzz';$('answer-form').dispatchEvent(new w.Event('submit',{cancelable:true}));
assert.equal(spoken.length,beforeWrong);
assert.equal($('next').hidden,true);
assert.equal($('mystery').textContent,'A little mystery word.');
$('spelling').value=answer;$('answer-form').dispatchEvent(new w.Event('submit',{cancelable:true}));
assert.equal($('mystery').textContent,answer);
assert.equal($('next').hidden,false);
assert.equal(spoken.at(-1).text,'You got it!');
assert.equal(spoken.length,beforeWrong+1);
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
 for(const kind of ['definition','sentence','part']){w.document.querySelector('[data-learn-hint="'+kind+'"]').click();assert.ok($('learning-clue').textContent.length>5);}
 $('pattern-quiz-start').click();
 for(let i=0;i<5;i++){
  const question=runInContext('quiz[quizIndex]',dom.getInternalVMContext());
  if(question.choices){const input=[...w.document.querySelectorAll('input[name="pattern-answer"]')].find(x=>x.value===question.answer);input.checked=true;}
  else $('activity-input').value=question.answer;
  $('activity-form').dispatchEvent(new w.Event('submit',{cancelable:true}));
  assert.ok($('activity-feedback').textContent.startsWith('You got it!'));
  assert.equal(spoken.at(-1).text,'You got it!');
  assert.equal(spoken.at(-1).rate,.5);assert.equal(spoken.at(-1).voice.voiceURI,'uk');
  const afterCorrect=spoken.length;
  $('activity-form').dispatchEvent(new w.Event('submit',{cancelable:true}));
  assert.equal(spoken.length,afterCorrect);
  $('activity-next').click();
 }
 assert.equal($('activity-score').textContent,'5 / 5 correct');
 assert.equal($('activity-review').children.length,5);
 $('activity-again').click();$('pattern-spell-start').click();
 assert.equal($('round').hidden,false);assert.equal(w.document.querySelector('.hint-buttons').hidden,false);
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
const beforeWrongActivity=spoken.length;
$('activity-input').value='zzzz';$('activity-form').dispatchEvent(new w.Event('submit',{cancelable:true}));
assert.ok($('activity-feedback').textContent.startsWith('Good try!'));
assert.equal(spoken.length,beforeWrongActivity);
$('activity-form').dispatchEvent(new w.Event('submit',{cancelable:true}));
assert.equal(runInContext('quizAnswers.length',dom.getInternalVMContext()),1);
$('back-to-lesson').click();
$('spelling-tab').click();$('start').click();
assert.equal(w.document.querySelector('.hint-buttons').hidden,false);
assert.equal(py.runPython('bee.mode'),'contest');
assert.ok(JSON.parse(await readFile('docs/words.json','utf8')).some(item=>item.word===py.runPython("bee.current()['word']")));
$('end').click();
// Only audio preferences survive a reload; no names, scores, or difficulty history.
// Both starter packs support all four levels and modes with complete clues.
const fullBank=JSON.parse(await readFile('docs/words.json','utf8'));
for(const grade of [1,2])for(const difficulty of ['easy','growing','challenge','expert'])for(const roundMode of ['practice','contest']){
 $('spelling-tab').click();$('grade').value=String(grade);$('grade').dispatchEvent(new w.Event('change'));w.document.querySelector('[data-level="'+difficulty+'"]').click();w.document.querySelector('[data-mode="'+roundMode+'"]').click();$('start').click();
 for(let i=0;i<5;i++){
  const word=py.runPython("bee.current()['word']");const entry=fullBank.find(w=>w.grade===grade&&w.word===word);
  assert.equal(entry.level,difficulty);assert.equal(py.runPython("bee.current()['grade']"),grade);
  if(grade===1)assert.ok(entry.patterns.length>0);
  assert.equal(w.document.querySelector('.hint-buttons').hidden,false);
  for(const kind of ['definition','sentence','part']){
   w.document.querySelector('[data-hint="'+kind+'"]').click();
   assert.ok($('hint').textContent.length>5);
   if(kind==='sentence')assert.ok($('hint').textContent.includes('____'));
   assert.ok(!new RegExp('\\b'+word+'\\b','i').test($('hint').textContent));
  }
  const beforeSubmit=spoken.length;
  $('spelling').value=word;$('answer-form').dispatchEvent(new w.Event('submit',{cancelable:true}));
  if(roundMode==='contest'){
   assert.equal($('mystery').textContent,'A little mystery word.');assert.equal(spoken.length,beforeSubmit);
  }else{
   assert.equal(spoken.length,beforeSubmit+1);assert.equal(spoken.at(-1).text,'You got it!');
   assert.equal(spoken.at(-1).rate,.5);assert.equal(spoken.at(-1).voice.voiceURI,'uk');
  }
  $('next').click();
 }
 assert.equal($('score').textContent,'5 / 5 correct');
}
// Skipping does not announce a correct answer.
$('spelling-tab').click();w.document.querySelector('[data-mode="practice"]').click();$('start').click();
const beforeSkip=spoken.length;$('skip').click();
assert.equal(spoken.length,beforeSkip);assert.equal($('mystery').textContent,'A little mystery word.');
assert.equal($('next').hidden,false);$('end').click();
// Untrusted plain text is validated as a whole, without touching the current bank.
$('spelling-tab').click();
assert.equal($('import'),null);
const addList=(text,grade='2',level='growing')=>{
 $('word-list').value=text;$('word-list-grade').value=grade;$('word-list-level').value=level;
 $('word-list-form').dispatchEvent(new w.Event('submit',{cancelable:true}));
};
const before=runInContext('saved.packs.length',dom.getInternalVMContext());
const originalError=w.console.error;w.console.error=()=>{};
for(const input of ['cat dog','cat, <script>window.injected=true</script>','123','word'.repeat(3001),Array(201).fill('cat').join(',')]){
 addList(input);
 assert.equal($('word-list').getAttribute('aria-invalid'),'true');
 assert.equal(runInContext('saved.packs.length',dom.getInternalVMContext()),before);
 assert.equal(w.injected,undefined);
 assert.equal($('import-status').querySelector('script'),null);
}
w.console.error=originalError;
addList('Apple, bunny\nwinter\nAPPLE, hello');
assert.equal($('word-list').getAttribute('aria-invalid'),'false');
assert.ok($('import-status').textContent.includes('Added 4 unique words'));
assert.ok($('import-status').textContent.includes('1 duplicate'));
assert.equal($('grade').value,'2');
assert.equal(w.document.querySelector('[data-level].selected').dataset.level,'growing');
assert.equal(runInContext('saved.packs.length',dom.getInternalVMContext()),4);
const validWords=runInContext('JSON.stringify(saved.packs)',dom.getInternalVMContext());
w.console.error=()=>{};addList('hello, <img src=x onerror=alert(1)>');w.console.error=originalError;
assert.equal(runInContext('JSON.stringify(saved.packs)',dom.getInternalVMContext()),validWords);
// Unknown custom words need valid clues before being added.
w.document.querySelector('[data-mode="practice"]').click();addList('orchard','3','easy');
assert.equal(runInContext("saved.packs.some(w=>w.word==='orchard')",dom.getInternalVMContext()),false);
const fields=$('custom-clues').querySelector('[data-clue-word="orchard"]');
fields.querySelector('[data-clue="definition"]').value='<script>alert(1)</script>';
fields.querySelector('[data-clue="sentence"]').value='We picked apples in the orchard.';
fields.querySelector('[data-clue="part"]').value='noun';
w.console.error=()=>{};addList('orchard','3','easy');w.console.error=originalError;
assert.equal($('word-list').getAttribute('aria-invalid'),'true');
assert.equal(runInContext("saved.packs.some(w=>w.word==='orchard')",dom.getInternalVMContext()),false);
fields.querySelector('[data-clue="definition"]').value='Land where fruit trees are grown.';
addList('orchard','3','easy');
$('start').click();
assert.equal(py.runPython("bee.current()['word']"),'orchard');
assert.equal($('position').textContent,'Word 1 of 1');
assert.equal(w.document.querySelector('.hint-buttons').hidden,false);
for(const kind of ['definition','sentence','part']){w.document.querySelector('[data-hint="'+kind+'"]').click();assert.ok($('hint').textContent.length>5);}
$('spelling').value='orchard';$('answer-form').dispatchEvent(new w.Event('submit',{cancelable:true}));$('next').click();
assert.equal($('score').textContent,'1 / 1 correct');
assert.equal(w.document.querySelector('[data-level].selected').dataset.level,'easy');
assert.equal($('result-note').textContent.includes('ready for growing'),false);
$('again').click();
addList('dog','4','easy');$('start').click();
assert.equal(w.document.querySelector('.hint-buttons').hidden,false);
assert.ok(py.runPython("bee.current()['definition']").includes('barks'));
$('end').click();
// The per-visit limit also applies across multiple additions.
runInContext("saved.packs=Array.from({length:1000},(_,i)=>({grade:12,word:'word'+i}))",dom.getInternalVMContext());
$('spelling-tab').click();w.console.error=()=>{};addList('extra','5','easy');w.console.error=originalError;
assert.equal($('word-list').getAttribute('aria-invalid'),'true');
assert.ok($('import-status').textContent.includes('1,000'));
assert.equal(runInContext('saved.packs.length',dom.getInternalVMContext()),1000);
const audio=JSON.parse(w.localStorage.getItem('little-bee-settings'));
assert.deepEqual(Object.keys(audio).sort(),['rate','version','voice']);assert.equal(audio.rate,.5);
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
assert.equal(runInContext('saved.packs.length',reloaded.getInternalVMContext()),0);
// Old automatically saved gentle speed switches to the new default once.
const migrated=new JSDOM(await readFile('docs/index.html','utf8'),{url:'http://localhost/',runScripts:'outside-only'});
const mw=migrated.window;mw.scrollTo=()=>{};mw.localStorage.setItem('little-bee-settings',JSON.stringify({voice:'uk',rate:.75}));
mw.loadPyodide=w.loadPyodide;mw.fetch=w.fetch;mw.speechSynthesis=w.speechSynthesis;mw.SpeechSynthesisUtterance=w.SpeechSynthesisUtterance;
runInContext(code,migrated.getInternalVMContext());
assert.equal(mw.document.getElementById('speech-speed').value,'1');
assert.equal(mw.document.getElementById('reading-voice').value,'uk');
await new Promise((resolve,reject)=>{const deadline=Date.now()+15000;const check=()=>{if(!mw.document.getElementById('start').disabled)return resolve();if(Date.now()>deadline)return reject(Error('Migration timed out'));setTimeout(check,10);};check();});
migrated.window.close();
reloaded.window.close();
dom.window.close();
console.log('DOM integration passed: spelling, voice controls, all 11 pattern activities and spelling pools, removal of saved progress.');
