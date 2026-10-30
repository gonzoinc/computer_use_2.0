#!/usr/bin/env node
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validate} from '../runtime/validation.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const offline=process.argv.includes('--offline');
await mkdir(path.join(root,'.codex'),{recursive:true});
for(const name of ['plugin','mcp']){
 const url='https://agent-plugins.org/schemas/1.0.0/'+name+'.schema.json';
 const cache=path.join(root,'.codex',name+'-schema.json');
 let schema;
 if(offline)schema=JSON.parse(await readFile(cache,'utf8'));
 else{
  const response=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('Schema download failed: '+response.status);
  const text=await response.text();if(text.length>1048576)throw new Error('Schema exceeds bounded size.');
  schema=JSON.parse(text);if(schema.$id!==url)throw new Error('Unexpected canonical schema identity.');
  await writeFile(cache,JSON.stringify(schema,null,2)+'\n');
 }
 const manifest=JSON.parse(await readFile(path.join(root,name+'.json'),'utf8'));
 validate(manifest,schema,name+'.json');
 console.log(name+'.json satisfies canonical Agent Plugins1.0.0 schema ('+(offline?'cached':'fetched')+').');
}
const skill=await readFile(path.join(root,'skills','computer-use-2','SKILL.md'),'utf8');
const match=/^---\r?\nname: ([a-z0-9-]+)\r?\ndescription: ([^\r\n]+)\r?\n---(?:\r?\n|$)/.exec(skill);
if(!match||match[1].length>64||match[1].startsWith('-')||match[1].endsWith('-')||match[1].includes('--')||match[2].length>1024||/[<>]/.test(match[2])||match[2].startsWith('[TODO:'))throw new Error('Bundled skill simple frontmatter is invalid.');
if(/^\s*\[TODO:[^\n]*\]\s*$/m.test(skill))throw new Error('Bundled skill contains unfinished instructions.');
console.log('Bundled skill simple frontmatter and required fields pass dependency-free checks; the optional Python/PyYAML validator was not used.');
