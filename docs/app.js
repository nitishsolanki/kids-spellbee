const $ = id => document.getElementById(id);
let python, callPython, current, state, result, recognition;
let mode='practice', level='easy', busy=false, voiceToken=0;
const key='little-bee-v1';
const empty=()=>({seen:{},history:[],packs:[],levels:{}});
let saved;
try { saved=JSON.parse(localStorage.getItem(key))||empty(); if(!saved.seen||!Array.isArray(saved.history)||!Array.isArray(saved.packs)||!saved.levels) saved=empty(); } catch { saved=empty(); }
function save(){try{localStorage.setItem(key,JSON.stringify(saved));}catch{$('load-status').textContent='Storage is unavailable. Your next visit may repeat words.';}}
function api(action,data={}){return JSON.parse(callPython(JSON.stringify({action,...data})));}
function errorText(error){console.error(error);return String(error.message||error).split('\n').filter(Boolean).at(-1).replace(/^ValueError: /,'');}
function show(id){stopAudio();for(const name of ['home','round','results'])$(name).hidden=name!==id;window.scrollTo({top:0,behavior:'instant'});}
function stopAudio(){voiceToken++;recognition?.abort();recognition=null;if('speechSynthesis'in window)window.speechSynthesis.cancel();}
function selectLevel(value){level=value;document.querySelectorAll('[data-level]').forEach(b=>{const selected=b.dataset.level===value;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',selected);});}
document.querySelectorAll('[data-level]').forEach(b=>b.onclick=()=>selectLevel(b.dataset.level));
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;document.querySelectorAll('[data-mode]').forEach(x=>{const selected=x===b;x.classList.toggle('selected',selected);x.setAttribute('aria-pressed',selected);});});
function populateGrades(grades){const previous=$('grade').value;$('grade').replaceChildren(...grades.map(grade=>new Option(`Grade ${grade}${grade===1?' · starter pack':''}`,grade)));if(grades.includes(Number(previous)))$('grade').value=previous;selectLevel(saved.levels[$('grade').value]||'easy');}
$('grade').onchange=()=>selectLevel(saved.levels[$('grade').value]||'easy');
let baseWords=[];
async function boot(){
 $('start').disabled=true;$('reload').hidden=true;
 try{
  const [engine,words]=await Promise.all([fetch('engine.py').then(checkResponse).then(r=>r.text()),fetch('words.json').then(checkResponse).then(r=>r.json())]);baseWords=words;
  if(typeof loadPyodide!=='function')throw Error('Python could not load. Check your connection and try again.');
  python=python||await loadPyodide({indexURL:'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/'});
  python.runPython(engine);callPython=python.globals.get('dispatch');
  let loaded;try{const combined=[...new Map([...baseWords,...saved.packs].map(w=>[`${w.grade}:${w.word}`,w])).values()];loaded=api('load',{words:combined});}catch{saved.packs=[];save();loaded=api('load',{words:baseWords});}
  populateGrades(loaded.grades);$('start').textContent='Let’s practice →';$('start').disabled=false;
  $('load-status').textContent=`${baseWords.length} starter words · Fresh rounds, one little word at a time`;
 }catch(e){$('load-status').textContent=errorText(e);$('start').textContent='Waiting for your words';$('reload').hidden=false;}
}
function checkResponse(response){if(!response.ok)throw Error('A word file could not load. Please try again.');return response;}
$('reload').onclick=()=>location.reload();
function speak(text){
 if(!('speechSynthesis'in window)){ $('audio-status').textContent='This device has no speech playback. Try another browser or ask a grown-up to read the word.';return; }
 recognition?.abort();window.speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text);utterance.lang='en-US';utterance.rate=.78;
 const voice=window.speechSynthesis.getVoices().find(v=>v.lang==='en-US');if(voice)utterance.voice=voice;
 utterance.onerror=e=>{if(!['interrupted','canceled'].includes(e.error))$('audio-status').textContent='Speech playback failed. Check your device’s sound and voice settings.';};
 $('audio-status').textContent='';window.speechSynthesis.speak(utterance);
}
function renderWord(){
 current=api('current');saved.seen[`${current.grade}:${current.word}`]=Date.now();save();
 $('position').textContent=`Word ${state.number} of ${state.total}`;$('progress').max=state.total;$('progress').value=state.number-1;
 $('round-label').textContent=`Grade ${current.grade} · ${level} · ${mode==='contest'?'Mini contest':'Practice'}`;
 $('mystery').textContent='A little mystery word.';$('spelling').value='';$('spelling').disabled=false;$('check').disabled=false;
 $('feedback').textContent='';$('hint').textContent='A clue is just a question away.';$('answer-form').hidden=false;$('next').hidden=true;$('skip').hidden=false;
 $('voice-status').textContent=voiceAvailable?'Say each letter, then check what we heard before submitting.':'Microphone recognition is unavailable in this browser. Type your spelling instead.';
 $('spelling').focus();
}
$('start').onclick=()=>{
 try{state=api('start',{grade:Number($('grade').value),level,mode,count:Number($('count').value),seen:saved.seen});show('round');renderWord();speak(current.word);}
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
 $('result-note').textContent=`${result.first_try} correct on the first try. ${result.advanced?'You’re ready for '+result.next_level+'!':'Every little practice helps you grow.'}`;
 if(mode==='practice'){saved.levels[$('grade').value]=result.next_level;selectLevel(result.next_level);}
 saved.history.unshift({date:new Date().toISOString(),grade:Number($('grade').value),level:completedLevel,mode,...result});saved.history=saved.history.slice(0,20);save();
 $('answers').replaceChildren(...result.answers.map(row=>{const tr=document.createElement('tr');const cells=[row.word,row.answer||'—',row.skipped?'Skipped':row.correct?(row.first_try?'✓ First try!':`✓ After ${row.attempts} tries`):'Keep practicing'];for(const [i,text]of cells.entries()){const td=document.createElement('td');td.textContent=text;if(i===2)td.className=row.correct?'good':'miss';tr.append(td);}return tr;}));
}
$('end').onclick=()=>{stopAudio();if(!window.confirm('Finish this round? Unanswered words will be marked as skipped in your review.'))return;while(!state.done){if(!apiStateLocked()){api('submit',{skip:true});}state=api('next');}finish();};
function apiStateLocked(){return python.runPython('bee.locked');}
$('again').onclick=()=>show('home');
$('download').onclick=()=>{const blob=new Blob([JSON.stringify(saved.history[0],null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='little-bee-results.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
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
$('clear-data').onclick=()=>{if(!confirm('Clear saved words, results, and imported packs on this browser?'))return;saved=empty();save();populateGrades(api('load',{words:baseWords}).grades);$('import-status').textContent='Saved progress cleared.';};
$('import').onchange=async e=>{try{if(!callPython)throw Error('Wait for the spelling engine to finish loading.');const file=e.target.files[0];if(!file)return;if(file.size>3_000_000)throw Error('Choose a JSON pack smaller than 3 MB.');const words=JSON.parse(await file.text());if(!Array.isArray(words))throw Error('Your pack must be a JSON array of words.');const merged=new Map([...baseWords,...saved.packs,...words].map(w=>[`${w.grade}:${w.word}`,w]));const combined=[...merged.values()];const response=api('load',{words:combined});saved.packs=[...new Map([...saved.packs,...words].map(w=>[`${w.grade}:${w.word}`,w])).values()];save();populateGrades(response.grades);$('import-status').textContent=`Pack ready! Available grades: ${response.grades.join(', ')}.`;}catch(err){$('import-status').textContent=errorText(err);}finally{e.target.value='';}};
boot();
