// Generates a credential-reference-only workflow. Never put keys in node parameters.
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const endpoint='https://www.dialedbyhenry.com/api/leads-admin';
const draftCred={httpHeaderAuth:{id:'DBH_SOCIAL_CREDENTIAL_ID',name:'Dialed Social drafting'}};
const orCred={openRouterApi:{id:'XScb47cLfmEaHaH3',name:'OpenRouter funded'}};
const nodes=[],connections={};
function add(name,type,parameters,x,y=0,extra={}){nodes.push({id:name.toLowerCase().replace(/\W+/g,'-'),name,type:'n8n-nodes-base.'+type,typeVersion:type==='httpRequest'?4.2:type==='code'?2:type==='scheduleTrigger'?1.2:1,position:[x,y],parameters,...extra});}
function link(from,to,output=0){connections[from]??={main:[]};connections[from].main[output]??=[];connections[from].main[output].push({node:to,type:'main',index:0});}
function site(name,body,x,y=0){add(name,'httpRequest',{method:'POST',url:endpoint,authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',sendBody:true,specifyBody:'json',jsonBody:body,options:{timeout:55000}},x,y,{credentials:draftCred,retryOnFail:true,maxTries:2,waitBetweenTries:3000});}
function model(name,x){add(name,'httpRequest',{method:'POST',url:'https://openrouter.ai/api/v1/chat/completions',authentication:'predefinedCredentialType',nodeCredentialType:'openRouterApi',sendBody:true,specifyBody:'json',jsonBody:'={{ JSON.stringify($json.payload) }}',options:{timeout:90000}},x,0,{credentials:orCred,onError:'continueErrorOutput'});}
add('Daily at 18:05 Eastern','scheduleTrigger',{rule:{interval:[{field:'cronExpression',expression:'5 18 * * *'}]}},0);
add('Run manually','manualTrigger',{},0,180);
site('Reserve tomorrow',JSON.stringify({action:'social-workflow',operation:'begin'}),220);
add('Skip existing or disabled batch','code',{jsCode:"const r=$input.first().json; if(r.skip)return []; if(!r.runId||!r.draftPayload)throw new Error('Invalid drafting context.'); return [{json:{payload:r.draftPayload}}];"},440);
model('Write five drafts',660);
add('Prepare independent review','code',{jsCode:`const r=$input.first().json;
if(r.error||r.choices?.[0]?.finish_reason!=='stop')throw new Error('Draft model failed or was truncated.');
const posts=JSON.parse(r.choices[0].message.content).posts;
if(!Array.isArray(posts)||posts.length!==5)throw new Error('Expected five drafts.');
const run=$('Reserve tomorrow').first().json;
const payload=run.reviewTemplate;
payload.messages[1].content=JSON.stringify({posts,voice:run.context.voice,sources:run.context.sources,recent:run.context.recent});
return [{json:{payload,posts,writerUsage:{model:r.model,cost:r.usage?.cost}}}];`},880,0,{onError:'continueErrorOutput'});
model('Independent editorial check',1100);
add('Prepare batch import','code',{jsCode:`const r=$input.first().json;
if(r.error||r.choices?.[0]?.finish_reason!=='stop')throw new Error('Editorial model failed or was truncated.');
const reviews=JSON.parse(r.choices[0].message.content).reviews;
if(!Array.isArray(reviews)||reviews.length!==5)throw new Error('Expected five editorial verdicts.');
const draft=$('Prepare independent review').first().json;
return [{json:{action:'social-workflow',operation:'commit',runId:$('Reserve tomorrow').first().json.runId,posts:draft.posts,reviews,usage:[draft.writerUsage,{model:r.model,cost:r.usage?.cost}]}}];`},1320,0,{onError:'continueErrorOutput'});
site('Save drafts and planned times','={{ JSON.stringify($json) }}',1540);
nodes.at(-1).onError='continueErrorOutput';
site('Record failure',"={{ JSON.stringify({action:'social-workflow',operation:'fail',runId:$('Reserve tomorrow').first().json.runId}) }}",1320,280);
add('Stop failed run','code',{jsCode:"throw new Error('Draft batch failed. Review the failed node above. Website publishing settings were not changed.');"},1540,280);
for(const[from,to]of [['Daily at 18:05 Eastern','Reserve tomorrow'],['Run manually','Reserve tomorrow'],['Reserve tomorrow','Skip existing or disabled batch'],['Skip existing or disabled batch','Write five drafts'],['Write five drafts','Prepare independent review'],['Prepare independent review','Independent editorial check'],['Independent editorial check','Prepare batch import'],['Prepare batch import','Save drafts and planned times'],['Record failure','Stop failed run']])link(from,to);
for(const name of ['Write five drafts','Prepare independent review','Independent editorial check','Prepare batch import','Save drafts and planned times'])link(name,'Record failure',1);
const workflow={name:'Social: daily watch drafts and schedule',nodes,connections,settings:{timezone:'America/New_York',executionOrder:'v1',executionTimeout:360,saveDataSuccessExecution:'all',saveDataErrorExecution:'all',saveManualExecutions:true,callerPolicy:'workflowsFromSameOwner',availableInMCP:false}};
writeFileSync(fileURLToPath(new URL('./n8n-social-drafts.json',import.meta.url)),JSON.stringify(workflow,null,2)+'\n');
console.log('Generated credential-reference-only n8n workflow.');
