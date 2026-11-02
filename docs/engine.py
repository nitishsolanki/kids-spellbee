"""Pure Python spelling-bee rules; no browser dependencies."""
import json
import random
import re


def validate_words(words):
    if not isinstance(words, list) or not 10 <= len(words) <= 5000:
        raise ValueError('A pack needs 10 to 5,000 words.')
    unique = set()
    for item in words:
        if not isinstance(item, dict):
            raise ValueError('Each word must be an object.')
        for key in ('word', 'definition', 'sentence', 'part'):
            if not isinstance(item.get(key), str) or not item[key].strip() or len(item[key]) > 400:
                raise ValueError('Every word needs word, definition, sentence, and part (under 400 characters).')
        item['word'] = item['word'].strip().lower()
        if not re.fullmatch(r'[a-z]{2,25}', item['word']):
            raise ValueError('Use single English words with 2–25 letters.')
        if type(item.get('grade')) is not int or not 1 <= item['grade'] <= 12:
            raise ValueError('Grade must be a number from 1 to 12.')
        if item.get('level') not in ('easy', 'growing', 'challenge'):
            raise ValueError('Level must be easy, growing, or challenge.')
        key = (item['grade'], item['word'])
        if key in unique:
            raise ValueError('Remove duplicate words within each grade.')
        unique.add(key)
    return words


class Bee:
    def __init__(self, words):
        self.words = validate_words(words)
        self.deck = []
        self.answers = []
        self.index = 0
        self.attempts = 0
        self.locked = False

    def start(self, grade=1, level='easy', mode='practice', count=10, seen=None):
        if mode not in ('practice', 'contest') or level not in ('easy', 'growing', 'challenge'):
            raise ValueError('Choose a valid mode and level.')
        pool = [w for w in self.words if w['grade'] == grade and w['level'] == level]
        if not pool:
            raise ValueError('This grade has no words at this level. Import a pack or choose another level.')
        seen = seen or {}
        random.shuffle(pool)
        # Least recently heard first, shuffled within unseen words. No repeats until exhausted.
        pool.sort(key=lambda w: seen.get(str(grade) + ':' + w['word'], 0))
        self.deck = pool[:min(max(int(count), 1), len(pool))]
        self.mode, self.level = mode, level
        self.index, self.attempts, self.answers, self.locked = 0, 0, [], False
        return self.state()

    def state(self):
        done = self.index >= len(self.deck)
        return {'done': done, 'number': self.index + 1, 'total': len(self.deck),
                'mode': getattr(self, 'mode', 'practice'), 'locked': self.locked}

    def current(self):
        return self.deck[self.index]

    def submit(self, spelling='', skip=False):
        if self.index >= len(self.deck) or self.locked:
            raise ValueError('This answer has already been submitted.')
        answer = spelling.strip().lower()
        if not skip and not re.fullmatch(r'[a-z]+', answer):
            raise ValueError('Type letters only, with no spaces.')
        self.attempts += 1
        correct = not skip and answer == self.current()['word']
        self.locked = self.mode == 'contest' or correct or skip
        if self.locked:
            self.answers.append({'word': self.current()['word'], 'answer': answer,
                                 'correct': correct, 'first_try': correct and self.attempts == 1,
                                 'attempts': self.attempts, 'skipped': skip})
        if self.mode == 'contest':
            return {'message': 'Answer saved. Keep going!', 'locked': True}
        result = {'correct': correct, 'locked': self.locked,
                  'message': 'You got it!' if correct else ('Saved for your end-of-round review.' if skip else 'Good effort! Listen again and try another spelling.')}
        if correct:
            result['word'] = self.current()['word']
        return result

    def next(self):
        if not self.locked:
            raise ValueError('Submit an answer first.')
        self.index += 1
        self.attempts, self.locked = 0, False
        return self.state()

    def results(self):
        if self.index < len(self.deck):
            raise ValueError('Finish your round to see the answers.')
        score = sum(row['correct'] for row in self.answers)
        first = sum(row['first_try'] for row in self.answers)
        levels = ['easy', 'growing', 'challenge']
        level = levels.index(self.level)
        advance = self.mode == 'practice' and first / max(len(self.answers), 1) >= .8 and level < 2
        return {'score': score, 'first_try': first, 'total': len(self.answers),
                'answers': self.answers, 'next_level': levels[level + 1] if advance else self.level,
                'advanced': advance}


bee = None


def dispatch(payload):
    global bee
    data = json.loads(payload)
    action = data.pop('action')
    if action == 'load':
        bee = Bee(data['words'])
        result = {'grades': sorted(set(w['grade'] for w in bee.words))}
    elif action == 'start':
        result = bee.start(**data)
    elif action == 'current':
        result = bee.current()
    elif action == 'submit':
        result = bee.submit(**data)
    elif action == 'next':
        result = bee.next()
    elif action == 'results':
        result = bee.results()
    else:
        raise ValueError('Unknown action')
    return json.dumps(result)
