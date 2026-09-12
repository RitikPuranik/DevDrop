const requirementsAgent=require('../agents/requirements.agent');
const designAgent=require('../agents/design.agent');
const architectureAgent=require('../agents/architecture.agent');
const codeGenerationAgent=require('../agents/codeGeneration.agent');
const integrationAgent=require('../agents/integration.agent');
const debugAgent=require('../agents/debug.agent');
const {validateRequirements,validateDesign,validateArchitecture}=require('../validators/contracts.validator');
const {validateGeneratedFiles}=require('../validators/generatedFiles.validator');
const buildValidator=require('../validators/build.validator');
const MAX_BUILD_FIX_RETRIES=Math.max(0,Number.parseInt(process.env.MAX_BUILD_FIX_RETRIES||'3',10)||3);
const STAGE_TIMEOUT_MS=Number.parseInt(process.env.AGENT_STAGE_TIMEOUT_MS||'180000',10);
function withTimeout(promise,ms,name){let timer;const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error(`${name} timed out after ${ms}ms`),{failure:{category:'timeout'}})),ms);});return Promise.race([promise,timeout]).finally(()=>clearTimeout(timer));}
function normalizeInput(input){const messages=Array.isArray(input.messages)?input.messages:[];const lastUser=[...messages].reverse().find(m=>m?.role==='user')?.content||'';return {websiteType:input.websiteType||input.type||'portfolio',userData:input.userData||input.portfolioData||{},preferences:input.preferences||{},assets:input.assets||[],conversation:input.conversation||messages,legacyPrompt:lastUser,fileData:input.fileData||null};}
function mergeFiles(base,changes){const out={...base};for(const[p,obj]of Object.entries(changes||{}))if(obj?.code)out[p]={code:obj.code};return out;}
async function stage(name,fn,meta,onStage){const started=Date.now();const item={name,status:'processing',durationMs:0};meta.push(item);onStage?.(name,'started',item);try{const value=await withTimeout(fn(),STAGE_TIMEOUT_MS,name);item.status='completed';item.durationMs=Date.now()-started;item.model=value?.model||null;item.attempt=value?.attempt||null;onStage?.(name,'completed',item);return value;}catch(error){item.status='failed';item.durationMs=Date.now()-started;item.failure={category:error.failure?.category||'agent_error',message:error.message};onStage?.(name,'failed',item);throw error;}}
async function generateWebsite(input,{onStage}={}){
 const meta=[];console.log('[ORCHESTRATOR] Starting generation');const normalized=normalizeInput(input);
 const requirementsResult=await stage('requirements',()=>requirementsAgent.run(normalized),meta,onStage);const requirements=validateRequirements(requirementsResult.value);
 const designResult=await stage('design',()=>designAgent.run({requirements,preferences:normalized.preferences,websiteType:normalized.websiteType}),meta,onStage);const design=validateDesign(designResult.value);
 const architectureResult=await stage('architecture',()=>architectureAgent.run({requirements,design}),meta,onStage);const architecture=validateArchitecture(architectureResult.value);
 const ordered=[...architecture.files].sort((a,b)=>{const rank=f=>f.path==='/package.json'?0:f.path==='/index.html'?1:f.path==='/main.jsx'?2:f.path==='/App.js'?3:/data|content/i.test(f.path)?4:/component/i.test(f.type||'')?5:6;return rank(a)-rank(b);});
 const codeResult=await stage('code-generation',async()=>{const generatedFiles={};for(const fileContract of ordered){const relatedContracts=architecture.files.filter(f=>f.path!==fileContract.path&&(fileContract.imports||[]).includes(f.path));console.log('[AGENT:CODE] generating',fileContract.path);const result=await withTimeout(codeGenerationAgent.run({fileContract,relatedContracts,requirements,design,userData:requirements.userData}),STAGE_TIMEOUT_MS,`code:${fileContract.path}`);if(result.value?.path!==fileContract.path||typeof result.value.code!=='string')throw new Error(`Code agent returned an invalid path/contract for ${fileContract.path}`);generatedFiles[fileContract.path]={code:result.value.code};}return {value:generatedFiles,model:'multi-file',attempt:1};},meta,onStage);
 let files=codeResult.value;const integrationResult=await stage('integration',()=>integrationAgent.run({requirements,design,architecture,files}),meta,onStage);files=mergeFiles(files,integrationResult.value?.files);let dependencies=architecture.dependencies||{};
 if(files['/package.json']?.code){try{dependencies={...dependencies,...(JSON.parse(files['/package.json'].code).dependencies||{})};}catch{}}
 for(let attempt=0;attempt<=MAX_BUILD_FIX_RETRIES;attempt+=1){
  const staticErrors=validateGeneratedFiles(files);
  if(staticErrors.length){console.warn('[VALIDATOR] static validation failed',{attempt,errors:staticErrors});if(attempt===MAX_BUILD_FIX_RETRIES)throw Object.assign(new Error(staticErrors.join(' | ')),{userMessage:'Generated code failed validation after the maximum repair attempts.'});const debug=await stage(`debug:${attempt+1}`,()=>debugAgent.run({errors:staticErrors,affectedFiles:Object.keys(files),files,architecture,requirements,design,dependencies}),meta,onStage);for(const change of debug.value?.changes||[])if(change.path&&change.code)files[change.path]={code:change.code};continue;}
  console.log('[VALIDATOR] static validation passed');const build=await stage('build-validator',()=>buildValidator.run({files,dependencies}),meta,onStage);if(build.success){console.log('[VALIDATOR] build passed');console.log('[ORCHESTRATOR] generation completed');return {assistantMessage:`Generated a ${requirements.websiteType} website through the multi-agent pipeline.`,title:requirements.userData?.name?`${requirements.userData.name} Portfolio`:'Generated Portfolio',files,dependencies,generationMeta:{agents:meta}};}
  console.warn('[VALIDATOR] build failed',{attempt,errors:build.errors});if(attempt===MAX_BUILD_FIX_RETRIES)throw Object.assign(new Error('Build failed after maximum repair attempts'),{userMessage:'DevDrop could not produce a buildable website after the maximum repair attempts.'});const debug=await stage(`debug:${attempt+1}`,()=>debugAgent.run({errors:build.errors,affectedFiles:Object.keys(files),files,architecture,requirements,design,dependencies,buildOutput:build.errors}),meta,onStage);for(const change of debug.value?.changes||[])if(change.path&&change.code)files[change.path]={code:change.code};
 }
 throw new Error('Generation failed after maximum repair attempts');
}
module.exports={generateWebsite};
