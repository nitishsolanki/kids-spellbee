import {JSDOM} from 'jsdom';
import {readFile} from 'node:fs/promises';
import {runInContext} from 'node:vm';
import assert from 'node:assert/strict';

const html = await readFile('docs/index.html', 'utf8');
const app = (await readFile('docs/app.js', 'utf8')).replace('export function lettersFromSpeech', 'function lettersFromSpeech');
const game = await readFile('docs/flashcards/game.js', 'utf8');
const data = {};
for (const grade of [1, 2]) {
  data[grade] = JSON.parse(await readFile(`docs/flashcards/grade-${grade}.json`, 'utf8'));
  const deck = data[grade];
  assert.equal(deck.grade, grade);
  assert.equal(deck.words.length, grade === 1 ? 259 : 93);
  assert.equal(deck.patterns.length, grade === 1 ? 11 : 8);
  assert.equal(deck.cardCount, grade === 1 ? 276 : 95);
  assert.equal(new Set(deck.words.map(w => w.word)).size, deck.words.length);
  assert.equal(deck.words.flatMap(w => w.cards).length, deck.cardCount);
  for (const pattern of deck.patterns) {
    assert.equal(deck.words.flatMap(w => w.cards).filter(c => c.pattern === pattern.name).length, pattern.cardCount);
  }
  for (const word of deck.words) {
    assert.match(word.word, /^[a-z]+$/);
    assert.ok(word.definition.length > 5);
    assert.match(word.sentence, new RegExp('\\b' + word.word + '\\b', 'i'));
    for (const card of word.cards) {
      assert.equal(card.chunks.join(''), word.word);
      assert.ok(card.page > 1 && card.page <= deck.sourcePages);
    }
  }
}
assert.ok(data[1].words.some(w => w.word === 'read'));
assert.ok(data[2].words.some(w => w.word === 'grandfather'));

const delay = () => new Promise(resolve => setTimeout(resolve, 0));
async function waitFor(check) {
  for (let i = 0; i < 100; i++) { if (check()) return; await delay(); }
  throw Error('Timed out waiting for flashcards');
}
function fixture(fetchDeck) {
  const dom = new JSDOM(html, {url: 'http://localhost/', runScripts: 'outside-only'});
  const w = dom.window;
  const spoken = [];
  let cancellations = 0;
  w.console.error = () => {}; // The original engine is intentionally unavailable.
  w.scrollTo = () => {};
  w.confirm = () => true;
  w.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  w.speechSynthesis = {
    getVoices: () => [{voiceURI: 'test-voice', lang: 'en-US', name: 'Test voice'}],
    cancel: () => { cancellations++; }, speak: u => spoken.push(u), addEventListener: () => {}
  };
  w.fetch = async path => {
    if (path.startsWith('flashcards/')) {
      const grade = Number(path.match(/grade-(\d)/)[1]);
      if (fetchDeck) return fetchDeck(grade);
      return {ok: true, json: async () => data[grade]};
    }
    const body = await readFile('docs/' + path, 'utf8');
    return {ok: true, text: async () => body, json: async () => JSON.parse(body)};
  };
  runInContext(app, dom.getInternalVMContext());
  runInContext(`(() => {${game}\n})();`, dom.getInternalVMContext());
  const $ = id => w.document.getElementById(id);
  const chooseGrade = grade => {
    const radio = w.document.querySelector(`[name="flashcard-grade"][value="${grade}"]`);
    radio.checked = true;
    radio.dispatchEvent(new w.Event('change'));
  };
  return {dom, w, $, spoken, chooseGrade, cancellations: () => cancellations};
}

const f = fixture();
const {$, w} = f;
assert.equal($('flashcards').hidden, true);
assert.equal($('fc-card').disabled, true);
$('flashcards-tab').click();
await waitFor(() => !$('fc-card').disabled);
assert.equal($('home').hidden, true);
assert.equal($('patterns').hidden, true);
assert.equal($('flashcards').hidden, false);
assert.equal($('start').disabled, true, 'Flashcards must work while Python is unavailable');
assert.equal($('fc-word').textContent, '');
assert.equal($('fc-back').getAttribute('aria-hidden'), 'true');
$('reading-voice').value = 'test-voice';
$('speech-speed').value = '.7';
$('fc-listen').click();
let target = f.spoken.at(-1).text;
assert.equal(f.spoken.at(-1).rate, .7);
assert.equal(f.spoken.at(-1).voice.voiceURI, 'test-voice');
$('fc-sentence').click();
assert.ok($('fc-sentence-text').textContent.includes('____'));
assert.ok(!new RegExp('\\b' + target + '\\b', 'i').test($('fc-sentence-text').textContent));
assert.match(f.spoken.at(-1).text, new RegExp('\\b' + target + '\\b', 'i'));
$('fc-definition').click();
assert.ok($('fc-definition-text').textContent.length > 5);
$('fc-card').click();
assert.equal($('fc-word').textContent, target);
assert.equal($('fc-back').getAttribute('aria-hidden'), 'false');
assert.match($('fc-sentence-text').textContent, new RegExp('\\b' + target + '\\b', 'i'));
assert.match($('fc-growth').textContent, /^1 card explored/);
$('fc-card').click();
assert.equal($('fc-word').textContent, '');
assert.ok($('fc-sentence-text').textContent.includes('____'));
$('fc-card').click();
assert.match($('fc-growth').textContent, /^1 card explored/, 'Flipping again must not count twice');

// Every word appears exactly once per shuffled pass, for both grades.
for (const grade of [1, 2]) {
  if (grade === 2) {
    f.chooseGrade(2);
    await waitFor(() => !$('fc-card').disabled);
    $('fc-listen').click();
    target = f.spoken.at(-1).text;
  }
  const seen = new Set([target]);
  let last = target;
  for (let i = 1; i < data[grade].words.length; i++) {
    $('fc-next').click();
    assert.equal($('fc-word').textContent, '');
    assert.equal($('fc-definition-text').hidden, true);
    assert.equal($('fc-sentence-text').hidden, true);
    $('fc-listen').click();
    last = f.spoken.at(-1).text;
    assert.ok(!seen.has(last), `Repeated word: ${last}`);
    seen.add(last);
  }
  assert.deepEqual([...seen].sort(), data[grade].words.map(w => w.word).sort());
  $('fc-next').click();
  assert.match($('fc-status').textContent, /fresh shuffle/);
  $('fc-listen').click();
  assert.notEqual(f.spoken.at(-1).text, last);
  assert.equal($('fc-position').textContent, `Card 1 of ${data[grade].words.length}`);
}

// Original tab navigation, including its leave-round confirmation, stays intact.
const before = f.cancellations();
$('patterns-tab').click();
assert.equal($('flashcards').hidden, true);
assert.equal($('patterns').hidden, false);
assert.ok(f.cancellations() > before);
function key(id, value) { $(id).dispatchEvent(new w.KeyboardEvent('keydown', {key: value, cancelable: true})); }
key('patterns-tab', 'ArrowRight');
assert.equal($('flashcards-tab').getAttribute('aria-selected'), 'true');
key('flashcards-tab', 'ArrowRight');
assert.equal($('spelling-tab').getAttribute('aria-selected'), 'true');
key('spelling-tab', 'ArrowLeft');
assert.equal($('flashcards-tab').getAttribute('aria-selected'), 'true');
key('flashcards-tab', 'Home');
assert.equal($('spelling-tab').getAttribute('aria-selected'), 'true');
key('spelling-tab', 'End');
assert.equal($('flashcards-tab').getAttribute('aria-selected'), 'true');
$('spelling-tab').click();
$('home').hidden = true; $('round').hidden = false;
w.confirm = () => false;
$('flashcards-tab').click();
assert.equal($('round').hidden, false);
assert.equal($('flashcards').hidden, true);
w.confirm = () => true;
$('flashcards-tab').click();
assert.equal($('round').hidden, true);
assert.equal($('flashcards').hidden, false);
$('fc-motion').click();
assert.ok($('flashcards').classList.contains('fc-motion-paused'));
assert.equal($('fc-motion').getAttribute('aria-pressed'), 'true');

// Audio errors, missing speech, and stale audio callbacks do not break the game.
$('fc-listen').click();
const staleSpeech = f.spoken.at(-1);
$('fc-next').click();
const status = $('fc-status').textContent;
staleSpeech.onerror({error: 'audio-busy'});
assert.equal($('fc-status').textContent, status);
$('fc-listen').click();
f.spoken.at(-1).onerror({error: 'audio-busy'});
assert.match($('fc-status').textContent, /could not play/);
delete w.speechSynthesis;
$('fc-listen').click();
assert.match($('fc-status').textContent, /unavailable/);
$('fc-card').click();
assert.ok($('fc-word').textContent);

// A failed deck can be retried without reloading either existing activity.
let fail = true;
const retry = fixture(async grade => ({ok: !fail, json: async () => data[grade]}));
retry.$('flashcards-tab').click();
await waitFor(() => !retry.$('fc-retry').hidden);
assert.equal(retry.$('fc-card').disabled, true);
assert.equal(retry.$('flashcards').getAttribute('aria-busy'), 'false');
fail = false;
retry.$('fc-retry').click();
await waitFor(() => !retry.$('fc-card').disabled);
assert.equal(retry.$('fc-retry').hidden, true);

// Slow responses from an earlier grade selection must never replace the new grade.
const pending = [];
const race = fixture(grade => new Promise(resolve => pending.push({grade, resolve})));
race.$('flashcards-tab').click();
race.chooseGrade(2);
assert.equal(pending.length, 2);
pending[1].resolve({ok: true, json: async () => data[2]});
await waitFor(() => !race.$('fc-card').disabled);
assert.match(race.$('fc-deck-label').textContent, /2nd grade/);
pending[0].resolve({ok: true, json: async () => data[1]});
await delay();
assert.match(race.$('fc-deck-label').textContent, /2nd grade/);
race.$('fc-listen').click();
assert.ok(data[2].words.some(w => w.word === race.spoken.at(-1).text));
for (const fixture of [f, retry, race]) fixture.dom.window.close();
console.log('Flashcard data, hidden clues, flip/reveal, grade selection, full-deck shuffling, tab isolation, speech fallbacks, retry, and loading race checks passed.');
