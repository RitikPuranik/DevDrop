const requirementsAgent=require('../agents/requirements.agent');
const designAgent=require('../agents/design.agent');
const architectureAgent=require('../agents/architecture.agent');
const codeGenerationAgent=require('../agents/codeGeneration.agent');
const integrationAgent=require('../agents/integration.agent');
const debugAgent=require('../agents/debug.agent');
const {validateRequirements,validateDesign,validateArchitecture}=require('../validators/contracts.validator');
const {validateGeneratedFiles}=require('../validators/generatedFiles.validator');
const buildValidator=require('../validators/build.validator');
const { withTimeout, stage: runStage }=require('./stageRunner');
const MAX_BUILD_FIX_RETRIES=Math.max(0,Number.parseInt(process.env.MAX_BUILD_FIX_RETRIES||'3',10)||3);
// Single overall timeout for the entire whole-website generation pipeline
// (requirements -> design -> architecture -> code-gen -> integration ->
// validation/debug loop). Replaces the old per-agent/per-stage timeouts.
const GENERATION_TIMEOUT_MS=Number.parseInt(process.env.WEBSITE_GENERATION_TIMEOUT_MS||'900000',10);
function normalizeInput(input){const messages=Array.isArray(input.messages)?input.messages:[];const lastUser=[...messages].reverse().find(m=>m?.role==='user')?.content||'';return {websiteType:input.websiteType||input.type||'portfolio',userData:input.userData||input.portfolioData||{},preferences:input.preferences||{},assets:input.assets||[],conversation:input.conversation||messages,legacyPrompt:lastUser,fileData:input.fileData||null};}
function mergeFiles(base,changes){const out={...base};for(const[p,obj]of Object.entries(changes||{}))if(obj?.code)out[p]={code:obj.code};return out;}
function stage(name,fn,meta,onStage){return runStage(name,fn,meta,onStage);}
async function generateWebsite(input,options={}){
 return withTimeout(runGeneration(input,options),GENERATION_TIMEOUT_MS,'website-generation');
}
async function runGeneration(input,{onStage}={}){
 const meta=[];console.log('[ORCHESTRATOR] Starting generation');const normalized=normalizeInput(input);
 const requirementsResult=await stage('requirements',()=>requirementsAgent.run(normalized),meta,onStage);const requirements=validateRequirements(requirementsResult.value);
 const designResult=await stage('design',()=>designAgent.run({requirements,preferences:normalized.preferences,websiteType:normalized.websiteType}),meta,onStage);const design=validateDesign(designResult.value);
 const architectureResult=await stage('architecture',()=>architectureAgent.run({requirements,design}),meta,onStage);const architecture=validateArchitecture(architectureResult.value);
 const ordered=[...architecture.files].sort((a,b)=>{const rank=f=>f.path==='/package.json'?0:f.path==='/index.html'?1:f.path==='/main.jsx'?2:f.path==='/App.js'?3:/data|content/i.test(f.path)?4:/component/i.test(f.type||'')?5:6;return rank(a)-rank(b);});
 let files={};
 for(const fileContract of ordered){
   const relatedContracts=architecture.files.filter(f=>f.path!==fileContract.path&&(fileContract.imports||[]).includes(f.path));
   const result=await stage(`code:${fileContract.path}`,()=>codeGenerationAgent.run({fileContract,relatedContracts,requirements,design,userData:requirements.userData}),meta,onStage);
   if(result.value?.path!==fileContract.path||typeof result.value.code!=='string')throw new Error(`Code agent returned an invalid path/contract for ${fileContract.path}`);
   files[fileContract.path]={code:result.value.code};
 }const integrationResult=await stage('integration',()=>integrationAgent.run({requirements,design,architecture,files}),meta,onStage);files=mergeFiles(files,integrationResult.value?.files);let dependencies=architecture.dependencies||{};
 if(files['/package.json']?.code){try{dependencies={...dependencies,...(JSON.parse(files['/package.json'].code).dependencies||{})};}catch{}}
 for(let attempt=0;attempt<=MAX_BUILD_FIX_RETRIES;attempt+=1){
  const staticErrors=validateGeneratedFiles(files);
  if(staticErrors.length){console.warn('[VALIDATOR] static validation failed',{attempt,errors:staticErrors});if(attempt===MAX_BUILD_FIX_RETRIES)throw Object.assign(new Error(staticErrors.join(' | ')),{userMessage:`Generated code failed validation after the maximum repair attempts: ${staticErrors.join(' | ').slice(0,1200)}`});const debug=await stage(`debug:${attempt+1}`,()=>debugAgent.run({errors:staticErrors,affectedFiles:Object.keys(files),files,architecture,requirements,design,dependencies}),meta,onStage);for(const change of debug.value?.changes||[])if(change.path&&change.code)files[change.path]={code:change.code};continue;}
  console.log('[VALIDATOR] static validation passed');const build=await stage('build-validator',()=>buildValidator.run({files,dependencies}),meta,onStage);if(build.success){console.log('[VALIDATOR] build passed');console.log('[ORCHESTRATOR] generation completed');return {assistantMessage:`Generated a ${requirements.websiteType} website through the multi-agent pipeline.`,title:requirements.userData?.name?`${requirements.userData.name} Portfolio`:'Generated Portfolio',files,dependencies,generationMeta:{agents:meta}};}
  console.warn('[VALIDATOR] build failed',{attempt,errors:build.errors});if(attempt===MAX_BUILD_FIX_RETRIES)throw Object.assign(new Error('Build failed after maximum repair attempts'),{userMessage:`DevDrop could not produce a buildable website after the maximum repair attempts: ${(build.errors||[]).join(' | ').slice(0,1200)}`});const debug=await stage(`debug:${attempt+1}`,()=>debugAgent.run({errors:build.errors,affectedFiles:Object.keys(files),files,architecture,requirements,design,dependencies,buildOutput:build.errors}),meta,onStage);for(const change of debug.value?.changes||[])if(change.path&&change.code)files[change.path]={code:change.code};
 }
 throw new Error('Generation failed after maximum repair attempts');
}
module.exports={generateWebsite};
