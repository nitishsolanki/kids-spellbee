import {readFile,writeFile} from 'node:fs/promises';
const words=(await readFile('data/grade1.txt','utf8')).split(/\r?\n/).filter(line=>line&&!line.startsWith('#')).map(line=>{const[level,word,part,definition,sentence]=line.split('|');if(!sentence)throw Error('Invalid word: '+word);return {grade:1,level,word,part,definition,sentence};});
await writeFile('docs/words.json',JSON.stringify(words,null,2)+'\n');
console.log(`Built ${words.length} words.`);
