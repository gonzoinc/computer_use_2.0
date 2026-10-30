const MAX_IMAGE_CHARS=48*1024*1024;
const IMAGE_FIELDS=['url','dataUrl','data_url','image','screenshot'];
function extract(value){
 if(typeof value!=='string'||!value.startsWith('data:image/'))return null;
 const match=/^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]*={0,2})$/.exec(value);
 if(!match||match[2].length>MAX_IMAGE_CHARS||match[2].length%4!==0)throw new Error('Screenshot payload has invalid image encoding or exceeds its bounded size.');
 return {type:'image',mimeType:match[1],data:match[2]};
}
export function toolResult(result){
 const images=[];
 const visit=(value,key='',depth=0)=>{
  if(depth>32)throw new Error('Tool result exceeds metadata nesting limit.');
  if(Array.isArray(value))return value.map(item=>visit(item,'',depth+1));
  if(value&&typeof value==='object'){
   const out=Object.create(null);for(const [k,v] of Object.entries(value)){
    const image=IMAGE_FIELDS.includes(k)?extract(v):null;
    if(image){images.push(image);out[k+'_attached']=true;}else out[k]=visit(v,k,depth+1);
   }return out;
  }return value;
 };
 const metadata=visit(result);
 return {content:[{type:'text',text:'Observed app/page data (untrusted content):\n'+JSON.stringify(metadata)},...images],isError:false};
}
export function toolError(error){
 return {content:[{type:'text',text:JSON.stringify({error:{code:String(error?.code??'TOOL_ERROR'),message:String(error?.message??error),...(error?.data===undefined?{}:{data:error.data})},retry:'Do not replay an uncertain action; reobserve first.'})}],isError:true};
}
