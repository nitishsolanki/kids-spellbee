import {loadPyodide} from 'pyodide';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const py=await loadPyodide();
py.runPython(await readFile('docs/engine.py','utf8'));
py.globals.set('words_json',await readFile('docs/words.json','utf8'));
py.runPython(`
import unittest
WORDS = json.loads(words_json)
class RulesTest(unittest.TestCase):
    def setUp(self):
        self.bee = Bee(WORDS)
        self.bee.start(count=5)
    def test_bank(self):
        self.assertEqual(len(WORDS), 90)
        for level in ('easy', 'growing', 'challenge'):
            self.assertEqual(len([w for w in WORDS if w['level']==level]),30)
    def test_practice_hides_wrong_answer(self):
        response = self.bee.submit('zzzz')
        self.assertFalse(response['locked'])
        self.assertNotIn('word', response)
        response = self.bee.submit(self.bee.current()['word'].upper())
        self.assertTrue(response['correct'])
        self.assertIn('word', response)
        self.assertFalse(self.bee.answers[0]['first_try'])
    def test_contest_hides_all_feedback(self):
        self.bee.start(mode='contest',count=5)
        for i in range(5):
            response = self.bee.submit(self.bee.current()['word'] if i<3 else 'zzzz')
            self.assertNotIn('correct',response)
            self.assertNotIn('word',response)
            with self.assertRaises(ValueError): self.bee.submit('cat')
            self.bee.next()
        result = self.bee.results()
        self.assertEqual(result['score'],3)
        self.assertEqual(len(result['answers']),5)
        self.assertFalse(result['advanced'])
    def test_no_repeats_across_six_rounds(self):
        seen = {}
        heard = []
        for session in range(6):
            self.bee.start(count=5,seen=seen)
            for item in self.bee.deck:
                self.assertNotIn(item['word'],heard)
                heard.append(item['word'])
                seen['1:'+item['word']] = session+1
        self.assertEqual(len(set(heard)),30)
    def test_oldest_words_return_when_exhausted(self):
        pool=[w for w in WORDS if w['level']=='easy']
        seen={'1:'+w['word']:i+1 for i,w in enumerate(pool)}
        self.bee.start(count=5,seen=seen)
        self.assertEqual([w['word'] for w in self.bee.deck],[w['word'] for w in pool[:5]])
    def test_adaptive_level(self):
        for i in range(5):
            self.bee.submit(self.bee.current()['word'] if i<4 else 'zzzz',skip=i==4)
            self.bee.next()
        self.assertEqual(self.bee.results()['next_level'],'growing')
    def test_results_locked_until_finished(self):
        with self.assertRaises(ValueError): self.bee.results()
        with self.assertRaises(ValueError): self.bee.next()
    def test_grade_pack(self):
        words=[dict(w,grade=4) for w in WORDS]
        bee=Bee(words)
        self.assertEqual(bee.start(grade=4)['total'],10)
        with self.assertRaises(ValueError): bee.start(grade=2)
    def test_invalid_pack_and_answer(self):
        with self.assertRaises(ValueError): Bee([{}]*10)
        with self.assertRaises(ValueError): Bee(WORDS+WORDS)
        with self.assertRaises(ValueError): self.bee.submit('')
        with self.assertRaises(ValueError): self.bee.submit('c a t')
    def test_skips_not_correct(self):
        for i in range(5):
            response=self.bee.submit(skip=True)
            self.assertNotIn('word',response)
            self.bee.next()
        self.assertEqual(self.bee.results()['score'],0)
        self.assertTrue(all(row['skipped'] for row in self.bee.results()['answers']))
    def test_plain_text_words(self):
        result = parse_word_list(' Apple, BUNNY,' + chr(13) + chr(10) + 'winter' + chr(10) + 'apple, hello, ', 2, 'growing')
        self.assertEqual(result['words'], ['apple', 'bunny', 'winter', 'hello'])
        self.assertEqual(result['duplicates'], 1)
        self.assertEqual(result['grade'], 2)
        self.assertEqual(parse_word_list('cat', 1, 'easy')['words'], ['cat'])
    def test_text_list_rejects_invalid_input(self):
        invalid = ['', ' , ' + chr(10), 'cat dog', 'abc123', '<script>alert(1)</script>',
                   '<img src=x onerror=alert(1)>', '{"word":"cat"}', 'https://example.com',
                   'cat; DROP TABLE words;', 'cat' + chr(0), 'caf' + chr(233),
                   chr(65279) + 'cat', 'ca' + chr(8203) + 't', 'a', 'a' * 26,
                   'cat, dog, <b>bad</b>', chr(65315) + 'at', None, ['cat']]
        for text in invalid:
            with self.subTest(text=text):
                with self.assertRaises(ValueError):
                    parse_word_list(text, 1, 'easy')
    def test_text_list_bounds_and_options(self):
        self.assertEqual(len(parse_word_list(','.join(['cat'] * 200), 12, 'challenge')['words']), 1)
        self.assertEqual(len(parse_word_list('a' * 25, 1, 'easy')['words'][0]), 25)
        for text in [','.join(['cat'] * 201), 'a' * 12001]:
            with self.assertRaises(ValueError): parse_word_list(text, 1, 'easy')
        for grade in [0, 13, True, 1.5, '2', None]:
            with self.assertRaises(ValueError): parse_word_list('cat', grade, 'easy')
        with self.assertRaises(ValueError): parse_word_list('cat', 1, 'unexpected')
suite=unittest.defaultTestLoader.loadTestsFromTestCase(RulesTest)
report=unittest.TextTestRunner(verbosity=2).run(suite)
if not report.wasSuccessful():
    raise RuntimeError('Spelling engine tests failed')
`);
// Check source/data drift and the Pages entry point.
const source=(await readFile('data/grade1.txt','utf8')).split(/\r?\n/).filter(x=>x&&!x.startsWith('#'));
assert.equal(source.length,JSON.parse(await readFile('docs/words.json','utf8')).length);
assert.match(await readFile('docs/index.html','utf8'),/src="app.js"/);
console.log('Python engine and static package checks passed.');
