const $ = id => document.getElementById(id);
let python, callPython, current, state, result, recognition;
let mode='practice', level='easy', busy=false, voiceToken=0;
const key='little-bee-v1';
const empty=()=>({seen:{},history:[],packs:[],levels:{},profiles:[],activePlayer:null,audio:{voice:'',rate:.75}});
let saved;
try { saved=JSON.parse(localStorage.getItem(key))||empty(); if(!saved.seen||!Array.isArray(saved.history)||!Array.isArray(saved.packs)||!saved.levels) saved=empty(); } catch { saved=empty(); }
function save(){
 const player=saved.profiles?.find(p=>p.id===saved.activePlayer);
 if(player){player.seen=saved.seen;player.history=saved.history;player.levels=saved.levels;}
 try{localStorage.setItem(key,JSON.stringify(saved));}catch{$('player-status').textContent='Storage is unavailable. Progress will last for this visit only.';}
}
function totals(history){return history.reduce((stats,row)=>({rounds:stats.rounds+1,words:stats.words+row.total,points:stats.points+row.first_try}),{rounds:0,words:0,points:0});}
function bindPlayer(player){saved.activePlayer=player.id;saved.seen=player.seen;saved.history=player.history;saved.levels=player.levels;}
function initializePlayers(){
 if(!Array.isArray(saved.profiles)||!saved.profiles.length){saved.profiles=[{id:'starter',name:'Little Speller',seen:saved.seen,history:saved.history,levels:saved.levels,stats:totals(saved.history)}];saved.activePlayer='starter';}
 bindPlayer(saved.profiles.find(p=>p.id===saved.activePlayer)||saved.profiles[0]);
 saved.audio={voice:typeof saved.audio?.voice==='string'?saved.audio.voice:'',rate:Math.min(1.2,Math.max(.5,Number(saved.audio?.rate)||.75))};
 save();renderTracker();
}
function renderTracker(){
 const player=saved.profiles.find(p=>p.id===saved.activePlayer);
 $('player-select').replaceChildren(...saved.profiles.map(p=>new Option(p.name,p.id)));$('player-select').value=player.id;
 $('tracker-name').textContent=`${player.name}’s progress`;
 const stats=player.stats;$('stat-rounds').textContent=stats.rounds;$('stat-words').textContent=stats.words;$('stat-accuracy').textContent=stats.words?`${Math.round(100*stats.points/stats.words)}%`:'—';
 $('recent-rounds').replaceChildren(...saved.history.slice(0,5).map(row=>{const li=document.createElement('li');li.textContent=`${new Date(row.date).toLocaleDateString()} · ${row.mode} · Grade ${row.grade}, ${row.level}: ${row.score}/${row.total} (${row.first_try} first try)`;return li;}));
 if(!saved.history.length){const li=document.createElement('li');li.textContent='Your first adventure is waiting!';$('recent-rounds').append(li);}
 const ranked=[...saved.profiles].sort((a,b)=>b.stats.points-a.stats.points||a.name.localeCompare(b.name));
 $('leaderboard').replaceChildren(...ranked.map(p=>{const li=document.createElement('li');const name=document.createElement('span');name.textContent=p.name;const points=document.createElement('strong');points.textContent=`${p.stats.points} pts`;li.append(name,points);if(p.id===player.id)li.setAttribute('aria-current','true');return li;}));
 const inRound=!$('round').hidden;for(const id of ['player-select','player-name','rename-player'])$(id).disabled=inRound;$('player-form').querySelector('button').disabled=inRound;
}
$('player-form').onsubmit=e=>{
 e.preventDefault();if(!$('round').hidden)return;
 const name=$('player-name').value.trim().replace(/\s+/g,' ');if(!name)return;
 let player=saved.profiles.find(p=>p.name.toLocaleLowerCase()===name.toLocaleLowerCase());
 if(!player){player={id:crypto.randomUUID(),name,seen:{},history:[],levels:{},stats:totals([])};saved.profiles.push(player);}
 bindPlayer(player);save();renderTracker();selectLevel(saved.levels[$('grade').value]||'easy');$('player-name').value='';$('player-status').textContent=`Ready for ${name}!`;show('home');
};
$('player-select').onchange=()=>{if(!$('round').hidden)return;bindPlayer(saved.profiles.find(p=>p.id===$('player-select').value));save();selectLevel(saved.levels[$('grade').value]||'easy');show('home');};
$('rename-player').onclick=()=>{
 const player=saved.profiles.find(p=>p.id===saved.activePlayer);const input=prompt('Choose a name or nickname:',player.name);if(input===null)return;const name=input.trim().replace(/\s+/g,' ');
 if(!name||name.length>30){$('player-status').textContent='Choose a name with 1–30 characters.';return;}
 if(saved.profiles.some(p=>p.id!==player.id&&p.name.toLowerCase()===name.toLowerCase())){$('player-status').textContent='That name already has a profile. Choose it from the list.';return;}
 player.name=name;save();renderTracker();
};
function api(action,data={}){return JSON.parse(callPython(JSON.stringify({action,...data})));}
function errorText(error){console.error(error);return String(error.message||error).split('\n').filter(Boolean).at(-1).replace(/^ValueError: /,'');}
function show(id){stopAudio();for(const name of ['home','round','results'])$(name).hidden=name!==id;renderTracker();window.scrollTo({top:0,behavior:'instant'});}
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
 recognition?.abort();window.speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text);utterance.lang='en-US';utterance.rate=saved.audio.rate;
 const voices=window.speechSynthesis.getVoices();const voice=voices.find(v=>v.voiceURI===saved.audio.voice)||voices.find(v=>v.lang==='en-US');if(voice){utterance.voice=voice;utterance.lang=voice.lang;}
 utterance.onerror=e=>{if(!['interrupted','canceled'].includes(e.error))$('speech-settings-status').textContent='Speech playback failed. Check your device’s sound and voice settings.';};
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
 const player=saved.profiles.find(p=>p.id===saved.activePlayer);
 saved.history.unshift({date:new Date().toISOString(),player:player.name,grade:Number($('grade').value),level:completedLevel,mode,...result});saved.history=saved.history.slice(0,20);
 player.stats.rounds++;player.stats.words+=result.total;player.stats.points+=result.first_try;save();renderTracker();
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
$('clear-data').onclick=()=>{if(!confirm('Clear all player names, scores, saved words, voice settings, and imported packs on this browser?'))return;saved=empty();initializePlayers();populateVoices();updateSpeed();populateGrades(api('load',{words:baseWords}).grades);$('import-status').textContent='Saved progress cleared.';};
$('import').onchange=async e=>{try{if(!callPython)throw Error('Wait for the spelling engine to finish loading.');const file=e.target.files[0];if(!file)return;if(file.size>3_000_000)throw Error('Choose a JSON pack smaller than 3 MB.');const words=JSON.parse(await file.text());if(!Array.isArray(words))throw Error('Your pack must be a JSON array of words.');const merged=new Map([...baseWords,...saved.packs,...words].map(w=>[`${w.grade}:${w.word}`,w]));const combined=[...merged.values()];const response=api('load',{words:combined});saved.packs=[...new Map([...saved.packs,...words].map(w=>[`${w.grade}:${w.word}`,w])).values()];save();populateGrades(response.grades);$('import-status').textContent=`Pack ready! Available grades: ${response.grades.join(', ')}.`;}catch(err){$('import-status').textContent=errorText(err);}finally{e.target.value='';}};
function populateVoices(){
 const synth=window.speechSynthesis;
 const voices=(synth?.getVoices()||[]).filter(v=>/^en[-_]/i.test(v.lang)||v.lang==='en').sort((a,b)=>(b.lang==='en-US')-(a.lang==='en-US')||a.name.localeCompare(b.name));
 $('reading-voice').replaceChildren(new Option('Device default · US English',''),...voices.map(v=>new Option(`${v.name} · ${v.lang}`,v.voiceURI)));
 if(voices.some(v=>v.voiceURI===saved.audio.voice))$('reading-voice').value=saved.audio.voice;
 $('speech-settings-status').textContent=!synth?'Speech playback is unavailable on this device.':voices.length?'Voice choices depend on your device. Settings are saved automatically.':'Using your device’s default voice. More voices may appear when your device loads them.';
 $('reading-voice').disabled=!synth;$('speech-speed').disabled=!synth;$('voice-preview').disabled=!synth;
}
function updateSpeed(){const rate=saved.audio.rate;$('speech-speed').value=rate;$('speed-value').textContent=`${rate.toFixed(2)}× · ${rate<.7?'extra slow':rate<1?'gentle':rate===1?'normal':'brisk'}`;}
$('reading-voice').onchange=()=>{stopAudio();saved.audio.voice=$('reading-voice').value;save();};
$('speech-speed').oninput=()=>{stopAudio();saved.audio.rate=Number($('speech-speed').value);updateSpeed();save();};
$('voice-preview').onclick=()=>speak('Hello, little speller. Take your time. You can do it!');
initializePlayers();populateVoices();updateSpeed();
window.speechSynthesis?.addEventListener('voiceschanged',populateVoices);
boot();
