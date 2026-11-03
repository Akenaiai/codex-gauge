'use strict';
const steps=['choose','connect','membership'];
const memberships=['unknown','free','paid','api'];
function cleanPreferences(input,legacy=false){
  const platforms={};
  for(const [id,row] of Object.entries(input?.platforms||{}).slice(0,500)){
    if(id.length>160||!row||typeof row.followed!=='boolean')continue;
    platforms[id]={followed:row.followed,membership:memberships.includes(row.membership)?row.membership:'unknown',userChoice:row.userChoice!==false};
  }
  return {version:1,defaultFollow:typeof input?.defaultFollow==='boolean'?input.defaultFollow:legacy,platforms,step:steps.includes(input?.step)?input.step:'choose',activeProvider:typeof input?.activeProvider==='string'&&input.activeProvider.length<=160?input.activeProvider:null};
}
function followed(preferences,id){return preferences.platforms[id]?.followed??preferences.defaultFollow;}
function patchPreferences(preferences,input,validProvider){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('invalid_connection_preferences');
  const next=structuredClone(preferences);
  if(input.provider!==undefined){
    if(typeof input.provider!=='string'||!validProvider(input.provider))throw Error('invalid_connection_preferences');
    if(input.followed!==undefined&&typeof input.followed!=='boolean'||input.membership!==undefined&&!memberships.includes(input.membership))throw Error('invalid_connection_preferences');
    next.platforms[input.provider]={followed:followed(next,input.provider),membership:'unknown',userChoice:false,...next.platforms[input.provider],...(input.followed!==undefined?{followed:input.followed,userChoice:true}:{}),...(input.membership!==undefined?{membership:input.membership}:{})};
  }
  if(input.step!==undefined){if(!steps.includes(input.step))throw Error('invalid_connection_preferences');next.step=input.step;}
  if(input.activeProvider!==undefined){if(input.activeProvider!==null&&!validProvider(input.activeProvider))throw Error('invalid_connection_preferences');next.activeProvider=input.activeProvider;}
  return next;
}
module.exports={cleanPreferences,followed,patchPreferences};
