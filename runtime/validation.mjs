export class InvalidArguments extends Error {
  constructor(message){super(message);this.name='InvalidArguments';this.code='INVALID_ARGUMENT';}
}
export function validate(value,schema,path='arguments',root=schema){
 if(!schema||typeof schema!=='object')return;
 if(schema.$ref){if(!schema.$ref.startsWith('#/'))throw new Error('Only local schema references are supported.');let selected=root;for(const part of schema.$ref.slice(2).split('/'))selected=selected?.[part.replaceAll('~1','/').replaceAll('~0','~')];if(!selected)throw new Error('Unresolved local schema reference.');validate(value,selected,path,root);return;}
 if(schema.not&&matches(value,schema.not,path,root))throw new InvalidArguments(path+' matches a forbidden shape.');
 if(schema.const!==undefined&&value!==schema.const)throw new InvalidArguments(path+' must equal its constant.');
 if(schema.enum&&!schema.enum.includes(value))throw new InvalidArguments(path+' is not an allowed value.');
 if(schema.anyOf&&!schema.anyOf.some(s=>matches(value,s,path,root)))throw new InvalidArguments(path+' does not match an allowed shape.');
 if(schema.oneOf&&schema.oneOf.filter(s=>matches(value,s,path,root)).length!==1)throw new InvalidArguments(path+' must match exactly one allowed shape.');
 if(schema.allOf)for(const s of schema.allOf)validate(value,s,path,root);
 const types=Array.isArray(schema.type)?schema.type:schema.type?[schema.type]:[];
 const isType=t=>t==='null'?value===null:t==='array'?Array.isArray(value):t==='object'?value!==null&&typeof value==='object'&&!Array.isArray(value):t==='integer'?Number.isSafeInteger(value):t==='number'?typeof value==='number'&&Number.isFinite(value):typeof value===t;
 if(types.length&&!types.some(isType))throw new InvalidArguments(path+' must be '+types.join(' or ')+'.');
 if(value!==null&&typeof value==='object'&&!Array.isArray(value)){
  for(const key of schema.required??[])if(!Object.hasOwn(value,key))throw new InvalidArguments(path+'.'+key+' is required.');
  for(const key of Object.keys(value)){
   if(schema.propertyNames)validate(key,schema.propertyNames,path+'.'+key,root);
   if(schema.properties&&Object.hasOwn(schema.properties,key))validate(value[key],schema.properties[key],path+'.'+key,root);
   else if(schema.additionalProperties===false)throw new InvalidArguments(path+'.'+key+' is unknown.');
   else if(schema.additionalProperties&&typeof schema.additionalProperties==='object')validate(value[key],schema.additionalProperties,path+'.'+key,root);
  }
 }
 if(Array.isArray(value)){
  if(schema.maxItems!==undefined&&value.length>schema.maxItems)throw new InvalidArguments(path+' has too many items.');
  if(schema.minItems!==undefined&&value.length<schema.minItems)throw new InvalidArguments(path+' has too few items.');
  if(schema.items)for(let i=0;i<value.length;i++)validate(value[i],schema.items,path+'['+i+']',root);
 }
 if(typeof value==='string'){
  if(schema.maxLength!==undefined&&value.length>schema.maxLength)throw new InvalidArguments(path+' is too long.');
  if(schema.minLength!==undefined&&value.length<schema.minLength)throw new InvalidArguments(path+' is too short.');
  if(schema.pattern&&!new RegExp(schema.pattern).test(value))throw new InvalidArguments(path+' does not match its required pattern.');
 }
 if(typeof value==='number'){
  if(!Number.isFinite(value))throw new InvalidArguments(path+' must be finite.');
  if(schema.minimum!==undefined&&value<schema.minimum)throw new InvalidArguments(path+' is below minimum.');
  if(schema.maximum!==undefined&&value>schema.maximum)throw new InvalidArguments(path+' exceeds maximum.');
 }
}
function matches(value,schema,path,root){try{validate(value,schema,path,root);return true;}catch{return false;}}
