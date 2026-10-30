import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import path from 'node:path';

const MAX_LINE = 64 * 1024 * 1024;
export class NativeBridge {
  constructor({projectRoot,hostPath,requestTimeoutMs=15000}={}) {
    if (!projectRoot) throw new Error('NativeBridge requires projectRoot.');
    this.projectRoot=path.resolve(projectRoot);
    this.hostPath=hostPath??path.join(this.projectRoot,'.codex','native-host','ComputerUse.NativeHost.exe');
    this.requestTimeoutMs=requestTimeoutMs;this.child=null;this.pending=new Map();this.nextId=1;this.buffer='';this.stderr='';
    this.cancelEvent=null;this.stopping=null;
  }
  async start() {
    if(this.stopping) await this.stopping;
    if(this.child) return;
    if(process.platform!=='win32') throw Object.assign(new Error('Native computer use requires Windows.'),{code:'unsupported_platform'});
    if(!existsSync(this.hostPath)) throw Object.assign(new Error('Native host is missing. Build native/Host/ComputerUse.NativeHost.csproj first.'),{code:'native_host_missing'});
    const event='Local\\ComputerUse2-'+randomUUID();
    const child=spawn(this.hostPath,['--cancel-event',event],{cwd:this.projectRoot,windowsHide:true,stdio:['pipe','pipe','pipe']});
    this.child=child;this.cancelEvent=event;this.buffer='';this.stderr='';
    child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
    child.stdout.on('data',chunk=>{
      if(this.child!==child)return;
      this.buffer+=chunk;if(this.buffer.length>MAX_LINE)return this._fail(new Error('Native response exceeds 64 MiB.'),child);
      let i;while((i=this.buffer.indexOf('\n'))>=0){const line=this.buffer.slice(0,i).trim();this.buffer=this.buffer.slice(i+1);if(!line)continue;
        let message;try{message=JSON.parse(line);}catch{return this._fail(new Error('Native host emitted invalid protocol JSON.'),child);}
        const request=this.pending.get(message.id);if(!request) return this._fail(new Error('Native response has an unknown request ID.'),child);
        this.pending.delete(message.id);clearTimeout(request.timer);request.detach();
        if(message.error)request.reject(Object.assign(new Error(message.error.message??'Native request failed.'),{code:message.error.code??'native_error',data:message.error.data}));
        else request.resolve(message.result);
      }
    });
    child.stderr.on('data',chunk=>{this.stderr=(this.stderr+chunk).slice(-8192);});
    child.on('error',error=>this._fail(error,child));
    child.on('exit',(code,signal)=>{if(this.child===child){this.child=null;this.cancelEvent=null;this._rejectAll(Object.assign(new Error('Native host exited; reobserve before retrying input.'),{code:'native_host_exited',exitCode:code,signal}));}});
    await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
  }
  async status(){return this.call('status',{});}
  async call(method,args={}, {timeoutMs=this.requestTimeoutMs,signal}={}) {
    if(typeof method!=='string'||!method||typeof args!=='object'||args===null||Array.isArray(args))throw new TypeError('Native call requires method and object arguments.');
    if(!Number.isFinite(timeoutMs)||timeoutMs<1||timeoutMs>120000)throw new RangeError('Native timeout must be 1..120000 ms.');
    if(signal?.aborted)throw Object.assign(new Error('Native request cancelled before dispatch.'),{code:'cancelled'});
    await this.start();
    if(this.pending.size)throw Object.assign(new Error('Another native operation is active; wait for its result.'),{code:'native_busy'});
    const id=this.nextId++,child=this.child;
    return new Promise((resolve,reject)=>{
      const abort=()=>{const e=Object.assign(new Error('Native request cancelled; outcome may be partial. Reobserve.'),{code:'cancelled'});this._fail(e,child);};
      const timer=setTimeout(()=>this._fail(Object.assign(new Error('Native request timed out; outcome may be partial. Reobserve.'),{code:'native_timeout'}),child),timeoutMs);
      const detach=()=>signal?.removeEventListener('abort',abort);
      this.pending.set(id,{resolve,reject,timer,detach});
      signal?.addEventListener('abort',abort,{once:true});
      child.stdin.write(JSON.stringify({id,method,args})+'\n',error=>{if(error)this._fail(error,child);});
    });
  }
  _rejectAll(error){for(const p of this.pending.values()){clearTimeout(p.timer);p.detach();p.reject(error);}this.pending.clear();}
  _fail(error,child){if(this.child!==child)return;this._rejectAll(error);void this._stop(child);}
  async _stop(child=this.child){
    if(!child)return;
    if(this.stopping)return this.stopping;
    const event=this.cancelEvent;
    this.stopping=(async()=>{
      if(event&&child.exitCode===null){
        // Cooperative cancellation lets the host release only keys/buttons it owns.
        const helper=spawn(this.hostPath,['--cancel',event],{cwd:this.projectRoot,windowsHide:true,stdio:'ignore'});
        await new Promise(resolve=>{let settled=false;const done=()=>{if(!settled){settled=true;clearTimeout(timer);resolve();}};
          const timer=setTimeout(()=>{helper.kill();done();},1000);helper.once('exit',done);helper.once('error',done);});
      }
      child.stdin.end();
      await new Promise(resolve=>{if(child.exitCode!==null)return resolve();const timer=setTimeout(()=>{child.kill();resolve();},1000);child.once('exit',()=>{clearTimeout(timer);resolve();});});
      if(this.child===child){this.child=null;this.cancelEvent=null;}
    })().finally(()=>{this.stopping=null;});
    return this.stopping;
  }
  async close(){this._rejectAll(Object.assign(new Error('Native bridge closed.'),{code:'cancelled'}));await this._stop();}
}

const win={type:'object',properties:{id:{type:'integer',minimum:1},app:{type:'string',minLength:1},title:{type:'string'}},required:['id','app'],additionalProperties:false};
const observation={window:win,snapshot_id:{type:'string',minLength:1}};
const frame={...observation,screenshot_id:{type:'string',minLength:1}};
const int={type:'integer'},text={type:'string'};
const define=(method,description,properties={},required=[])=>({name:'native_'+method,method,description,inputSchema:{type:'object',properties,required,additionalProperties:false}});
export const NativeTools=[
 define('status','Inspect native Windows capabilities and capture limitations. Does not capture user content.'),
 define('list_windows','List visible targetable Windows windows. Select an exact returned window before acting.'),
 define('list_apps','List installed executable/packaged apps and running windows. Catalog sources are bounded and may omit inaccessible entries.'),
 define('get_window','Revalidate a window returned earlier in this host session.',{id:{type:'integer',minimum:1},app:text},['id']),
 define('launch_app','Launch an absolute existing executable with no shell/arguments, or a packaged ID returned by list_apps.',{app:text},['app']),
 define('get_window_state','Observe selected window via WGC screenshot and/or bounded UI Automation. Returns snapshot_id and screenshot IDs; PrintWindow fallback is identified.',{window:win,include_screenshot:{type:'boolean'},include_text:{type:'boolean'}},['window']),
 define('activate_window','Bring the exact selected Windows window to foreground and invalidate old observations.',{window:win},['window']),
 define('click','Click fresh UIA index or observed screenshot-relative physical-pixel coordinates. Input invalidates observations.',{...frame,element_index:int,x:int,y:int,click_count:{type:'integer',minimum:1,maximum:3},mouse_button:{enum:['left','right','middle','l','r','m']}},['window','snapshot_id']),
 define('press_key','Send a key/chord to verified target foreground. Supports Control_L+Shift_L+F12, navigation and KP_ keys. Physical Escape stops input.',{...observation,key:text},['window','snapshot_id','key']),
 define('type_text','Type literal Unicode at the same observed focused UIA element. Capture include_text first. No control characters or password fields.',{...observation,text:{type:'string',maxLength:100000}},['window','snapshot_id','text']),
 define('scroll','Scroll from a fresh screenshot-relative physical-pixel point; positive scrollY moves down.',{...frame,x:int,y:int,scrollX:int,scrollY:int},['window','snapshot_id','screenshot_id','x','y','scrollX','scrollY']),
 define('drag','Drag between two fresh screenshot-relative points inside selected window.',{...frame,from_x:int,from_y:int,to_x:int,to_y:int},['window','snapshot_id','screenshot_id','from_x','from_y','to_x','to_y']),
 define('set_value','Replace a fresh UIA editable ValuePattern; reject read-only/password fields.',{...observation,element_index:int,value:{type:'string',maxLength:100000}},['window','snapshot_id','element_index','value']),
 define('perform_secondary_action','Invoke an action exposed in current UIA snapshot: Invoke, Expand, Collapse, Toggle, Select, Raise, Scroll Up/Down/Left/Right.',{...observation,element_index:int,action:text},['window','snapshot_id','element_index','action'])
];
