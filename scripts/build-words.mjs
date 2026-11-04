import {readFile,writeFile} from 'node:fs/promises';
const dictionary=new Map();
for(const file of ['data/grade1.txt','data/pattern-dictionary.txt']){
 const lines=(await readFile(file,'utf8')).split(/\r?\n/).filter(line=>line&&!line.startsWith('#'));
 for(const line of lines){
  const fields=line.split('|');if(file.endsWith('/grade1.txt'))fields.shift();
  const [word,part,definition,sentence]=fields;
  if(fields.length!==4||!sentence||dictionary.has(word))throw Error('Invalid or duplicate dictionary entry: '+word);
  dictionary.set(word,{word,part,definition,sentence});
 }
}
const levels=['easy','growing','challenge','expert'];
const difficulty={'short-vowels':0,'ending-blends':1,'ll-ck':1,digraphs:1,'silent-e':2,'bossy-r':2,'vowel-teams':2,'ending-y':2,plurals:3,syllables:3,tricky:3};
const lessons=JSON.parse(await readFile('docs/patterns.json','utf8')).lessons;
const words=new Map();
for(const lesson of lessons){
 if(!(lesson.id in difficulty))throw Error('Missing difficulty for '+lesson.id);
 for(const word of lesson.words){
  const entry=dictionary.get(word);if(!entry)throw Error('Missing dictionary clues for '+word);
  if(!new RegExp('\\b'+word+'\\b','i').test(entry.sentence))throw Error('Sentence must contain '+word);
  const previous=words.get(word);
  const level=levels[Math.max(difficulty[lesson.id],previous?levels.indexOf(previous.level):0)];
  words.set(word,{...entry,grade:1,level,patterns:[...(previous?.patterns||[]),lesson.id]});
 }
}
const output=JSON.stringify([...words.values()],null,2)+'\n';
if(process.argv.includes('--check')){
 if(await readFile('docs/words.json','utf8')!==output)throw Error('Word bank is stale. Run node scripts/build-words.mjs.');
}else await writeFile('docs/words.json',output);
console.log(`Verified ${words.size} lesson words: `+levels.map(level=>level+' '+[...words.values()].filter(w=>w.level===level).length).join(', '));
