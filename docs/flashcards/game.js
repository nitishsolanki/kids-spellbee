// An independent activity: no Python engine, shared word bank, or saved scores.
const panel = document.getElementById('flashcards');
panel.innerHTML = `
  <div class="fc-intro">
    <span class="eyebrow">THE LITTLE BEE WORD GARDEN</span>
    <h1>A little flip. <span>A big discovery.</span></h1>
    <p>Listen, spell it out, then flip to check. Let's grow together!</p>
    <span class="fc-doodle fc-doodle-one" aria-hidden="true">✧</span>
    <span class="fc-doodle fc-doodle-two" aria-hidden="true">✿</span>
  </div>
  <fieldset class="fc-grades">
    <legend>Pick your word garden</legend>
    <label><input type="radio" name="flashcard-grade" value="1" checked><span>🌱 <strong>1st grade</strong></span></label>
    <label><input type="radio" name="flashcard-grade" value="2"><span>🌻 <strong>2nd grade</strong></span></label>
  </fieldset>
  <div class="fc-game">
    <div class="fc-deck-bar"><span id="fc-deck-label">Your word garden</span><span id="fc-position">Ready to grow?</span></div>
    <button id="fc-listen" class="fc-listen" type="button" disabled><span aria-hidden="true">♫</span> Hear the word</button>
    <p class="fc-directions">Say the letters aloud or write them on paper.</p>
    <div class="fc-card-stage">
      <span class="fc-orbit" aria-hidden="true"><img src="bee.svg" alt="" width="54" height="50"></span>
      <button id="fc-card" class="fc-card" type="button" aria-label="Flip card to show the word" aria-pressed="false" disabled>
        <span class="fc-card-inner">
          <span id="fc-front" class="fc-face fc-front">
            <span class="fc-card-kicker">A WORD IS HIDING HERE</span>
            <span class="fc-mystery" aria-hidden="true">?</span>
            <strong>What's the word?</strong>
            <span class="fc-flip-prompt">↻ &nbsp; Tap to flip &amp; check</span>
          </span>
          <span id="fc-back" class="fc-face fc-back" aria-hidden="true">
            <span class="fc-card-kicker">HERE'S YOUR WORD!</span>
            <strong id="fc-word"></strong>
            <span id="fc-pattern"></span>
            <span class="fc-flip-prompt">↻ &nbsp; Tap to hide &amp; try again</span>
          </span>
        </span>
      </button>
    </div>
    <div class="fc-clues" aria-label="Word clues">
      <button id="fc-definition" type="button" aria-expanded="false" aria-controls="fc-definition-text" disabled><span aria-hidden="true">☀</span> Definition</button>
      <button id="fc-sentence" type="button" aria-expanded="false" aria-controls="fc-sentence-text" disabled><span aria-hidden="true">✎</span> In a sentence</button>
    </div>
    <div class="fc-clue-area">
      <p id="fc-definition-text" hidden></p>
      <p id="fc-sentence-text" hidden></p>
    </div>
    <p id="fc-status" class="fc-status" role="status">Open a garden to get your cards ready.</p>
    <button id="fc-retry" class="secondary" type="button" hidden>Try loading again</button>
    <button id="fc-next" class="fc-next" type="button" disabled>Next mystery word <span aria-hidden="true">→</span></button>
    <div class="fc-garden">
      <div id="fc-flowers" class="fc-flowers" aria-hidden="true"><span>✿</span><span>✿</span><span>✿</span><span>✿</span><span>✿</span></div>
      <p id="fc-growth">Every card you explore helps your garden grow.</p>
      <span class="fc-garden-ground" aria-hidden="true"></span>
    </div>
  </div>
  <p class="fc-note">A fresh shuffle, a little wonder. No timer. Take your time.</p>
  <button id="fc-motion" class="fc-motion" type="button" aria-pressed="false">Pause animations</button>
`;

const $ = id => document.getElementById(id);
const decks = new Map();
let grade = 1, current = null, revealed = false, loadToken = 0, speechToken = 0;
let explored = 0, exploredThisCard = false;
let autoReadTimer;

function shuffle(words, previous) {
  const result = [...words];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  // A new pass never starts with the previous pass's last word.
  if (result.length > 1 && result[0].word === previous) {
    [result[0], result[1]] = [result[1], result[0]];
  }
  return result;
}

function stopSpeech() {
  clearTimeout(autoReadTimer);
  speechToken++;
  window.speechSynthesis?.cancel();
}

function speak(text) {
  stopSpeech();
  if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
    $('fc-status').textContent = 'Sound is unavailable here. Try a clue, or flip with a grown-up to practice together.';
    return;
  }
  const token = speechToken;
  try {
    const speech = new SpeechSynthesisUtterance(text);
    const selected = $('reading-voice')?.value;
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(v => v.voiceURI === selected) || voices.find(v => v.lang === 'en-US');
    if (voice) speech.voice = voice;
    speech.lang = voice?.lang || 'en-US';
    speech.rate = Number($('speech-speed')?.value) || 1;
    speech.onerror = event => {
      if (token === speechToken && !panel.hidden && !['canceled', 'interrupted'].includes(event.error)) {
        $('fc-status').textContent = 'The sound could not play. Check your volume and voice settings, or try a clue.';
      }
    };
    window.speechSynthesis.speak(speech);
  } catch {
    $('fc-status').textContent = 'Sound could not play. Try a clue, or practice with a grown-up.';
  }
}

function setReady(ready) {
  for (const id of ['fc-listen', 'fc-card', 'fc-definition', 'fc-sentence', 'fc-next']) $(id).disabled = !ready;
}

function updateClues() {
  for (const kind of ['definition', 'sentence']) {
    const open = $('fc-' + kind).getAttribute('aria-expanded') === 'true';
    const output = $('fc-' + kind + '-text');
    output.hidden = !open;
    // Both visual clues hide the spelling until the child chooses to flip.
    output.textContent = open && current
      ? (revealed ? current[kind] : current[kind].replace(new RegExp('\\b' + current.word + '\\b', 'gi'), '____'))
      : '';
  }
}

function setRevealed(value) {
  revealed = value;
  $('fc-word').textContent = value ? current.word : '';
  $('fc-pattern').textContent = value ? [...new Set(current.cards.map(card => card.pattern))].join(' · ') : '';
  $('fc-card').classList.toggle('fc-revealed', value);
  $('fc-card').setAttribute('aria-pressed', String(value));
  $('fc-card').setAttribute('aria-label', value ? `${current.word}. Flip card to hide the word` : 'Flip card to show the word');
  $('fc-front').setAttribute('aria-hidden', String(value));
  $('fc-back').setAttribute('aria-hidden', String(!value));
  updateClues();
}

function nextCard() {
  stopSpeech();
  const deck = decks.get(grade);
  const previous = current?.word;
  const freshPass = deck.index >= deck.order.length;
  if (freshPass) {
    deck.order = shuffle(deck.words, previous);
    deck.index = 0;
  }
  current = deck.order[deck.index++];
  exploredThisCard = false;
  for (const kind of ['definition', 'sentence']) $('fc-' + kind).setAttribute('aria-expanded', 'false');
  setRevealed(false);
  $('fc-deck-label').textContent = `${grade === 1 ? '1st' : '2nd'} grade · ${deck.words.length} words`;
  $('fc-position').textContent = `Card ${deck.index} of ${deck.words.length}`;
  $('fc-status').textContent = freshPass ? 'You explored the whole deck! A fresh shuffle is ready.' : 'Hear the word, give it a try, then flip to peek.';
  setReady(true);
}

async function loadGrade() {
  const token = ++loadToken;
  const requestedGrade = grade;
  stopSpeech();
  current = null;
  setReady(false);
  $('fc-retry').hidden = true;
  for (const kind of ['definition', 'sentence']) $('fc-' + kind).setAttribute('aria-expanded', 'false');
  setRevealed(false);
  $('fc-deck-label').textContent = `${requestedGrade === 1 ? '1st' : '2nd'} grade`;
  $('fc-position').textContent = 'Getting ready…';
  $('fc-status').textContent = 'Planting your word garden…';
  panel.setAttribute('aria-busy', 'true');
  try {
    if (!decks.has(requestedGrade)) {
      const response = await fetch(`flashcards/grade-${requestedGrade}.json`);
      if (!response.ok) throw Error('Could not load this deck.');
      const data = await response.json();
      if (token !== loadToken) return;
      if (data.grade !== requestedGrade || !Array.isArray(data.words) || !data.words.length ||
          data.words.some(w => !/^[a-z]+$/.test(w.word) || !w.definition || !w.sentence || !w.cards?.length)) {
        throw Error('This deck is incomplete.');
      }
      decks.set(requestedGrade, {...data, order: shuffle(data.words), index: 0});
    }
    if (token !== loadToken) return;
    nextCard();
  } catch {
    if (token !== loadToken) return;
    $('fc-status').textContent = 'Your cards could not load. Please try again.';
    $('fc-position').textContent = 'Not loaded yet';
    $('fc-retry').hidden = false;
  } finally {
    if (token === loadToken) panel.setAttribute('aria-busy', 'false');
  }
}

panel.querySelectorAll('[name="flashcard-grade"]').forEach(radio => {
  radio.addEventListener('change', () => {
    if (!radio.checked) return;
    grade = Number(radio.value);
    loadGrade();
  });
});
$('fc-retry').addEventListener('click', loadGrade);
$('fc-motion').addEventListener('click', () => {
  const paused = panel.classList.toggle('fc-motion-paused');
  $('fc-motion').setAttribute('aria-pressed', String(paused));
  $('fc-motion').textContent = paused ? 'Resume animations' : 'Pause animations';
});
$('fc-listen').addEventListener('click', () => { if (current) speak(current.word); });
$('fc-next').addEventListener('click', () => {
  nextCard();
  autoReadTimer = setTimeout(() => {
    if (!panel.hidden && current) speak(current.word);
  }, 1000);
});
$('fc-card').addEventListener('click', () => {
  if (!current) return;
  stopSpeech();
  setRevealed(!revealed);
  if (revealed && !exploredThisCard) {
    exploredThisCard = true;
    explored++;
    const petals = (explored - 1) % 5 + 1;
    [...$('fc-flowers').children].forEach((flower, index) => flower.classList.toggle('fc-bloom', index < petals));
    $('fc-growth').textContent = `${explored} ${explored === 1 ? 'card' : 'cards'} explored · ${explored % 5 === 0 ? 'Your garden is blooming!' : 'Keep growing, little bee!'}`;
    $('fc-status').textContent = explored % 5 === 0 ? 'Five more discoveries! Look at your garden grow.' : 'Check your spelling. Every try helps you learn!';
  } else {
    $('fc-status').textContent = revealed ? 'Check the word, one letter at a time.' : 'Hidden again! Hear the word and give it another try.';
  }
});
for (const kind of ['definition', 'sentence']) {
  $('fc-' + kind).addEventListener('click', () => {
    const button = $('fc-' + kind);
    const open = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(open));
    updateClues();
    if (open && current) speak(current[kind]);
    else stopSpeech();
  });
}
document.addEventListener('little-bee-activity', event => {
  // Existing navigation owns the tab selection and cancels other activity audio.
  if (event.detail === 'flashcards') {
    if (!current && panel.getAttribute('aria-busy') !== 'true') loadGrade();
  } else {
    clearTimeout(autoReadTimer);
    speechToken++;
  }
});
if (!panel.hidden) loadGrade();
