const $ = id => document.getElementById(id);
let python, callPython, current, state, result, recognition;
let mode='practice', level='easy', busy=false, voiceToken=0;
const settingsKey='little-bee-settings';
const saved={seen:{},packs:[],levels:{},audio:{voice:'',rate:.75}};
let lastResult=null, origin='home';
try {
 const settings=JSON.parse(localStorage.getItem(settingsKey)||'{}');
 if(typeof settings.voice==='string')saved.audio.voice=settings.voice;
 saved.audio.rate=Math.min(1.2,Math.max(.5,Number(settings.rate)||.75));
}catch{}
// Retire old player/progress data even when voice preferences are malformed.
try{localStorage.removeItem('little-bee-v1');}catch{}
function save(){try{localStorage.setItem(settingsKey,JSON.stringify(saved.audio));}catch{}}
function api(action,data={}){return JSON.parse(callPython(JSON.stringify({action,...data})));}
function errorText(error){console.error(error);return String(error.message||error).split('\n').filter(Boolean).at(-1).replace(/^ValueError: /,'');}
function show(id){
 stopAudio();for(const name of ['home','patterns','round','results'])$(name).hidden=name!==id;
 const selected=id==='home'||id==='patterns'?id:origin;
 document.querySelectorAll('[data-tab]').forEach(b=>{const active=b.dataset.tab===selected;b.setAttribute('aria-selected',active);b.setAttribute('aria-controls',active?id:b.dataset.tab);b.tabIndex=active?0:-1;});
 if(id==='round'||id==='results'){$(id).setAttribute('role','tabpanel');$(id).setAttribute('aria-labelledby',selected==='home'?'spelling-tab':'patterns-tab');}
 window.scrollTo({top:0,behavior:'instant'});
}
function stopAudio(){voiceToken++;recognition?.abort();recognition=null;if('speechSynthesis'in window)window.speechSynthesis.cancel();}
function selectLevel(value){level=value;document.querySelectorAll('[data-level]').forEach(b=>{const selected=b.dataset.level===value;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',selected);});}
document.querySelectorAll('[data-level]').forEach(b=>b.onclick=()=>selectLevel(b.dataset.level));
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;document.querySelectorAll('[data-mode]').forEach(x=>{const selected=x===b;x.classList.toggle('selected',selected);x.setAttribute('aria-pressed',selected);});});
function populateGrades(grades){const previous=$('grade').value;$('grade').replaceChildren(...grades.map(grade=>new Option(`Grade ${grade}${grade===1?' · starter pack':''}`,grade)));if(grades.includes(Number(previous)))$('grade').value=previous;selectLevel(saved.levels[$('grade').value]||'easy');}
$('grade').onchange=()=>selectLevel(saved.levels[$('grade').value]||'easy');
let baseWords=[];
function loadSpellingBank(){return api('load',{words:[...new Map([...baseWords,...saved.packs].map(w=>[String(w.grade)+':'+w.word,w])).values()]});}
function setRoundHints(visible){document.querySelector('.hint-buttons').hidden=!visible;$('hint').hidden=!visible;}

async function boot(){
 $('start').disabled=true;$('reload').hidden=true;
 try{
  const [engine,words]=await Promise.all([fetch('engine.py').then(checkResponse).then(r=>r.text()),fetch('words.json').then(checkResponse).then(r=>r.json())]);baseWords=words;
  if(typeof loadPyodide!=='function')throw Error('Python could not load. Check your connection and try again.');
  python=python||await loadPyodide({indexURL:'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/'});
  python.runPython(engine);callPython=python.globals.get('dispatch');
  let loaded;try{const combined=[...new Map([...baseWords,...saved.packs].map(w=>[`${w.grade}:${w.word}`,w])).values()];loaded=api('load',{words:combined});}catch{saved.packs=[];save();loaded=api('load',{words:baseWords});}
  populateGrades(loaded.grades);$('start').textContent='Let’s practice →';$('start').disabled=false;$('pattern-spell-start').disabled=false;
  $('load-status').textContent=`${baseWords.length} starter words · Fresh rounds, one little word at a time`;
 }catch(e){$('load-status').textContent=errorText(e);$('start').textContent='Waiting for your words';$('reload').hidden=false;}
}
function checkResponse(response){if(!response.ok)throw Error('A word file could not load. Please try again.');return response;}
$('reload').onclick=()=>location.reload();
function speak(text){
 if(!('speechSynthesis'in window)){ $('audio-status').textContent='This device has no speech playback. Try another browser or ask a grown-up to read the word.';return; }
 recognition?.abort();window.speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text);utterance.lang='en-US';utterance.rate=saved.audio.rate;
 const voices=window.speechSynthesis.getVoices();const voice=voices.find(v=>v.voiceURI===saved.audio.voice)||voices.find(v=>v.lang==='en-US');if(voice){utterance.voice=voice;utterance.lang=voice.lang;}
 utterance.onerror=e=>{if(!['interrupted','canceled'].includes(e.error))$('speech-settings-status').textContent='Speech playback failed. Check your device’s sound and voice settings.';};
 $('audio-status').textContent='';window.speechSynthesis.speak(utterance);
}
function renderWord(){
 current=api('current');saved.seen[`${current.grade}:${current.word}`]=Date.now();save();
 $('position').textContent=`Word ${state.number} of ${state.total}`;$('progress').max=state.total;$('progress').value=state.number-1;
 $('round-label').textContent=origin==='patterns'?currentPattern().title:`Grade ${current.grade} · ${level} · ${mode==='contest'?'Mini contest':'Practice'}`;
 $('mystery').textContent='A little mystery word.';$('spelling').value='';$('spelling').disabled=false;$('check').disabled=false;
 $('feedback').textContent='';$('hint').textContent='A clue is just a question away.';$('answer-form').hidden=false;$('next').hidden=true;$('skip').hidden=false;
 $('voice-status').textContent=voiceAvailable?'Say each letter, then check what we heard before submitting.':'Microphone recognition is unavailable in this browser. Type your spelling instead.';
 $('spelling').focus();
}
$('start').onclick=()=>{
 origin='home';level=document.querySelector('[data-level].selected').dataset.level;mode=document.querySelector('[data-mode].selected').dataset.mode;setRoundHints(true);
 try{loadSpellingBank();state=api('start',{grade:Number($('grade').value),level,mode,count:Number($('count').value),seen:saved.seen});show('round');renderWord();speak(current.word);}
 catch(e){$('load-status').textContent=errorText(e);}
};
$('listen').onclick=()=>speak(current.word);
document.querySelectorAll('[data-hint]').forEach(b=>b.onclick=()=>{const kind=b.dataset.hint;const text=kind==='part'?`This word is a ${current.part}.`:current[kind];$('hint').textContent=kind==='sentence'?text.replace(new RegExp(`\\b${current.word}\\b`,'gi'),'____'):text;speak(text);});
$('answer-form').onsubmit=e=>{e.preventDefault();submit(false);};
$('skip').onclick=()=>submit(true);
function submit(skip){
 if(busy)return;busy=true;stopAudio();
 try{const response=api('submit',{spelling:$('spelling').value,skip});$('feedback').textContent=response.message;
  if(response.word)$('mystery').textContent=response.word;
  if(response.locked){$('answer-form').hidden=true;$('skip').hidden=true;$('next').hidden=false;$('next').textContent=state.number===state.total?'See my results →':'Next word →';$('next').focus();}
  else $('spelling').focus();
 }catch(e){$('feedback').textContent=errorText(e);}finally{busy=false;}
}
$('next').onclick=()=>{stopAudio();state=api('next');if(state.done)finish();else{renderWord();speak(current.word);}};
function finish(){
 const completedLevel=level;
 result=api('results');show('results');$('score').textContent=`${result.score} / ${result.total} correct`;
 $('result-note').textContent=`${result.first_try} correct on the first try. ${result.advanced&&origin==='home'?'You’re ready for '+result.next_level+'!':'Every little practice helps you grow.'}`;
 if(mode==='practice'&&origin==='home'){saved.levels[$('grade').value]=result.next_level;selectLevel(result.next_level);}
 lastResult={date:new Date().toISOString(),grade:current.grade,level:completedLevel,mode,pattern:origin==='patterns'?currentPattern().id:null,...result};
 $('result-context').textContent=origin==='patterns'?currentPattern().title+' spelling':'Spelling practice';
 $('answers').replaceChildren(...result.answers.map(row=>{const tr=document.createElement('tr');const cells=[row.word,row.answer||'—',row.skipped?'Skipped':row.correct?(row.first_try?'✓ First try!':`✓ After ${row.attempts} tries`):'Keep practicing'];for(const [i,text]of cells.entries()){const td=document.createElement('td');td.textContent=text;if(i===2)td.className=row.correct?'good':'miss';tr.append(td);}return tr;}));
}
$('end').onclick=()=>{stopAudio();if(!window.confirm('Finish this round? Unanswered words will be marked as skipped in your review.'))return;while(!state.done){if(!apiStateLocked()){api('submit',{skip:true});}state=api('next');}finish();};
function apiStateLocked(){return python.runPython('bee.locked');}
$('again').onclick=()=>show(origin);
$('download').onclick=()=>{const blob=new Blob([JSON.stringify(lastResult,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='little-bee-results.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;const voiceAvailable=!!Recognition;
$('mic').disabled=!voiceAvailable;
const names={ay:'a',eh:'a',bee:'b',be:'b',cee:'c',see:'c',sea:'c',dee:'d',ee:'e',ef:'f',gee:'g',aitch:'h',eye:'i',jay:'j',kay:'k',el:'l',em:'m',en:'n',oh:'o',owe:'o',pee:'p',queue:'q',cue:'q',are:'r',ar:'r',ess:'s',tee:'t',tea:'t',you:'u',vee:'v',ex:'x',why:'y',zee:'z',zed:'z'};
export function lettersFromSpeech(text){const tokens=text.toLowerCase().replace(/double[ -]+you/g,'w').replace(/[^a-z\s]/g,' ').trim().split(/\s+/);return tokens.map(t=>names[t]||t).join('');}
$('mic').onclick=()=>{
 if(recognition){recognition.stop();return;}stopAudio();const token=++voiceToken;recognition=new Recognition();const active=recognition;active.lang='en-US';active.interimResults=false;active.maxAlternatives=1;
 $('mic').setAttribute('aria-pressed','true');$('voice-status').textContent='Listening… say one letter at a time. Tap the microphone again to stop.';
 active.onresult=e=>{if(token!==voiceToken)return;const transcript=e.results[0][0].transcript;$('spelling').value=lettersFromSpeech(transcript);$('voice-status').textContent=`Heard “${transcript}”. Check and edit the letters before submitting.`;};
 active.onerror=e=>{if(token===voiceToken)$('voice-status').textContent=e.error==='not-allowed'?'Microphone permission was denied. Type your spelling or enable it in browser settings.':'We couldn’t hear the letters. Try again, or type your spelling.';};
 active.onend=()=>{if(recognition===active)recognition=null;$('mic').setAttribute('aria-pressed','false');};
 try{active.start();}catch{$('voice-status').textContent='Microphone could not start. Please type your spelling.';recognition=null;$('mic').setAttribute('aria-pressed','false');}
};
$('guide-button').onclick=()=> $('guide').showModal();$('close-guide').onclick=()=> $('guide').close();
$('import').onchange=async e=>{try{if(!callPython)throw Error('Wait for the spelling engine to finish loading.');const file=e.target.files[0];if(!file)return;if(file.size>3_000_000)throw Error('Choose a JSON pack smaller than 3 MB.');const words=JSON.parse(await file.text());if(!Array.isArray(words))throw Error('Your pack must be a JSON array of words.');const merged=new Map([...baseWords,...saved.packs,...words].map(w=>[`${w.grade}:${w.word}`,w]));const combined=[...merged.values()];const response=api('load',{words:combined});saved.packs=[...new Map([...saved.packs,...words].map(w=>[`${w.grade}:${w.word}`,w])).values()];save();populateGrades(response.grades);$('import-status').textContent=`Pack ready! Available grades: ${response.grades.join(', ')}.`;}catch(err){$('import-status').textContent=errorText(err);}finally{e.target.value='';}};
let patternLessons=[], quiz=[], quizIndex=0, quizAnswers=[], quizLocked=false;
const wordPictures={ran:'🏃',leg:'🦵',rod:'🎣',wind:'🍃',drink:'🥤',mist:'🌫️',shell:'🐚',truck:'🚚',bush:'🌳',shoot:'🏀',shine:'☀️',dive:'🏊',dirt:'🌱',yarn:'🧶',stars:'⭐',fire:'🔥',seal:'🦭',house:'🏠',claws:'🐾',bunny:'🐰',mossy:'🌿',body:'🧍',wings:'🪽',steps:'👣',winter:'❄️',apple:'🍎',yellow:'🟡',hello:'👋',heart:'❤️'};
function currentPattern(){return patternLessons.find(p=>p.id===$('pattern-select').value);}
function shuffled(items){const result=[...items];for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
async function initPatterns(){
 try{
  const data=await fetch('patterns.json').then(checkResponse).then(r=>r.json());patternLessons=data.lessons;
  $('pattern-select').replaceChildren(...patternLessons.map((p,i)=>new Option((i+1)+'. '+p.title,p.id)));
  $('pattern-select').disabled=false;renderLesson();
 }catch(e){$('pattern-status').textContent='Patterns could not load. Please refresh to try again.';console.error(e);}
}
function patternView(id){stopAudio();for(const name of ['pattern-lesson','pattern-activity','activity-results'])$(name).hidden=name!==id;}
function renderLesson(){
 const p=currentPattern();if(!p)return;
 patternView('pattern-lesson');$('pattern-number').textContent='PATTERN '+(patternLessons.indexOf(p)+1)+' OF 11';
 $('pattern-title').textContent=p.title;$('pattern-rule').textContent=p.rule;
 $('pattern-words').replaceChildren(...p.core.map(word=>{const button=document.createElement('button');button.type='button';const picture=document.createElement('span');picture.className='word-picture';picture.setAttribute('aria-hidden','true');picture.textContent=wordPictures[word]||'🔊';button.append(picture,document.createTextNode(word));button.onclick=()=>speak(word);return button;}));
 $('pattern-status').textContent='';$('pattern-spell-start').disabled=!callPython;
}
$('pattern-select').onchange=renderLesson;
$('hear-rule').onclick=()=>speak(currentPattern().rule);
$('back-to-lesson').onclick=renderLesson;$('activity-again').onclick=renderLesson;
$('pattern-quiz-start').onclick=()=>{quiz=shuffled(currentPattern().questions).slice(0,5);quizIndex=0;quizAnswers=[];patternView('pattern-activity');renderQuestion();};
function renderQuestion(){
 quizLocked=false;const q=quiz[quizIndex];$('activity-title').textContent=currentPattern().title;
 $('activity-position').textContent='Question '+(quizIndex+1)+' of '+quiz.length;
 $('activity-prompt').textContent=q.prompt;$('activity-feedback').textContent='';$('activity-next').hidden=true;$('activity-check').hidden=false;
 $('activity-input').value='';$('activity-input').disabled=false;$('activity-input').required=!q.choices;$('activity-input-label').hidden=!!q.choices;
 $('activity-choices').replaceChildren(...(q.choices?shuffled(q.choices).map(choice=>{const label=document.createElement('label');const input=document.createElement('input');input.type='radio';input.name='pattern-answer';input.value=choice;input.required=true;label.append(input,document.createTextNode(choice));return label;}):[]));
 if(!q.choices)$('activity-input').focus();
}
$('activity-form').onsubmit=e=>{
 e.preventDefault();if(quizLocked)return;const q=quiz[quizIndex];const response=q.choices?document.querySelector('input[name="pattern-answer"]:checked')?.value:$('activity-input').value.trim().toLowerCase();
 if(!response){$('activity-feedback').textContent='Choose or write an answer first.';return;}
 const correct=response===q.answer;quizAnswers.push({prompt:q.prompt,answer:q.answer,response,correct});quizLocked=true;
 $('activity-feedback').textContent=(correct?'You got it! ':'Good try! ')+q.explanation;$('activity-check').hidden=true;$('activity-next').hidden=false;
 $('activity-next').textContent=quizIndex===quiz.length-1?'See my results':'Next question';
 $('activity-input').disabled=true;document.querySelectorAll('input[name="pattern-answer"]').forEach(input=>input.disabled=true);$('activity-next').focus();
};
$('activity-next').onclick=()=>{
 if(!quizLocked)return;
 if(++quizIndex<quiz.length){renderQuestion();return;}
 patternView('activity-results');$('activity-score').textContent=quizAnswers.filter(a=>a.correct).length+' / '+quizAnswers.length+' correct';
 $('activity-review').replaceChildren(...quizAnswers.map(a=>{const li=document.createElement('li');li.textContent=a.prompt+' Your answer: '+a.response+'. Correct answer: '+a.answer+'.';li.className=a.correct?'good':'miss';return li;}));
};
$('pattern-spell-start').onclick=()=>{
 if(!callPython)return;const p=currentPattern();origin='patterns';mode='practice';level='easy';setRoundHints(false);
 try{
  const words=p.words.map(word=>({...baseWords.find(w=>w.word===word),word,grade:1,level:'easy',part:'word',definition:'A practice word for '+p.title+'.',sentence:'Listen carefully and spell this word.'}));
  api('load',{words});state=api('start',{grade:1,level:'easy',mode:'practice',count:5,seen:saved.seen});show('round');renderWord();speak(current.word);
 }catch(e){$('pattern-status').textContent=errorText(e);show('patterns');}
};
document.querySelectorAll('[data-tab]').forEach((button,index,buttons)=>{
 button.onclick=()=>{if(!$('round').hidden&&!confirm('Leave this spelling round? This round will not be saved.'))return;origin=button.dataset.tab;show(origin);};
 button.onkeydown=e=>{let next;if(e.key==='ArrowRight'||e.key==='ArrowLeft')next=1-index;else if(e.key==='Home')next=0;else if(e.key==='End')next=1;else return;e.preventDefault();buttons[next].click();buttons[next].focus();};
});
function populateVoices(){
 const synth=window.speechSynthesis;
 const voices=(synth?.getVoices()||[]).filter(v=>/^en[-_]/i.test(v.lang)||v.lang==='en').sort((a,b)=>(b.lang==='en-US')-(a.lang==='en-US')||a.name.localeCompare(b.name));
 $('reading-voice').replaceChildren(new Option('Device default · US English',''),...voices.map(v=>new Option(`${v.name} · ${v.lang}`,v.voiceURI)));
 if(voices.some(v=>v.voiceURI===saved.audio.voice))$('reading-voice').value=saved.audio.voice;
 $('speech-settings-status').textContent=!synth?'Speech playback is unavailable on this device.':voices.length?'Voice choices depend on your device. Settings are kept for next time.':'Using your device’s default voice. More voices may appear when your device loads them.';
 $('reading-voice').disabled=!synth;$('speech-speed').disabled=!synth;$('voice-preview').disabled=!synth;
}
function updateSpeed(){const rate=saved.audio.rate;$('speech-speed').value=rate;$('speed-value').textContent=`${rate.toFixed(2)}× · ${rate<.7?'extra slow':rate<1?'gentle':rate===1?'normal':'brisk'}`;}
$('reading-voice').onchange=()=>{stopAudio();saved.audio.voice=$('reading-voice').value;save();};
$('speech-speed').oninput=()=>{stopAudio();saved.audio.rate=Number($('speech-speed').value);updateSpeed();save();};
$('voice-preview').onclick=()=>speak('Hello, little speller. Take your time. You can do it!');
populateVoices();updateSpeed();
window.speechSynthesis?.addEventListener('voiceschanged',populateVoices);
boot();
initPatterns();
