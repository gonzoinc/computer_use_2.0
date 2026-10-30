#!/usr/bin/env node
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createMcpServer} from './mcp.mjs';
const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const MAX_REQUEST=1024*1024;
let buffer=Buffer.alloc(0),ending=false;
const pending=new Set();
const write=message=>{if(!process.stdout.destroyed)process.stdout.write(JSON.stringify(message)+'\n');};
const server=createMcpServer({projectRoot,send:write});
function dispatch(line){
 let message;try{message=JSON.parse(line.toString('utf8'));}catch{write({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}});return;}
 const work=server.receive(message).catch(error=>{console.error('MCP dispatch failure: '+error.message);});
 pending.add(work);work.finally(()=>pending.delete(work));
}
process.stdin.on('data',chunk=>{
 if(ending)return;buffer=Buffer.concat([buffer,chunk]);
 let newline;while((newline=buffer.indexOf(10))>=0){
  const line=buffer.subarray(0,newline);buffer=buffer.subarray(newline+1);
  if(line.length>MAX_REQUEST){write({jsonrpc:'2.0',id:null,error:{code:-32600,message:'Request exceeds 1 MiB.'}});void shutdown(1);return;}
  if(line.toString('utf8').trim())dispatch(line);
 }
 if(buffer.length>MAX_REQUEST){write({jsonrpc:'2.0',id:null,error:{code:-32600,message:'Request exceeds 1 MiB.'}});void shutdown(1);}
});
async function shutdown(code=0){
 if(ending)return;ending=true;process.stdin.pause();
 await server.close();await Promise.allSettled([...pending]);process.exitCode=code;
 // Stop reading pipe handles without killing or closing user Firefox.
 process.stdin.destroy();
}
process.stdin.on('end',()=>{if(buffer.length&&buffer.toString('utf8').trim())dispatch(buffer);buffer=Buffer.alloc(0);void shutdown();});
process.stdin.on('error',()=>void shutdown(1));
process.on('SIGINT',()=>void shutdown());process.on('SIGTERM',()=>void shutdown());
process.on('uncaughtException',error=>{console.error('MCP fatal: '+error.message);void shutdown(1);});
process.stdout.on('error',()=>void shutdown(1));
