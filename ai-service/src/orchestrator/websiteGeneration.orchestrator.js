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
const { normalizeAssets, buildMediaManifest, buildAssetSummaries, normalizeMediaPlan }=require('../utils/assetContract');
const MAX_BUILD_FIX_RETRIES=Math.max(0,Number.parseInt(process.env.MAX_BUILD_FIX_RETRIES||'3',10)||3);
// Single overall timeout for the entire whole-website generation pipeline
// (requirements -> design -> architecture -> code-gen -> integration ->
// validation/debug loop). Replaces the old per-agent/per-stage timeouts.
const GENERATION_TIMEOUT_MS=Number.parseInt(process.env.WEBSITE_GENERATION_TIMEOUT_MS||'900000',10);
function normalizeInput(input){const messages=Array.isArray(input.messages)?input.messages:[];const lastUser=[...messages].reverse().find(m=>m?.role==='user')?.content||'';return {websiteType:input.websiteType||input.type||'portfolio',userData:input.userData||input.portfolioData||{},preferences:input.preferences||{},assets:normalizeAssets(input.assets),media:input.media||[],conversation:input.conversation||messages,legacyPrompt:lastUser,fileData:input.fileData||null};}
function mergeFiles(base,changes){const out={...base};for(const[p,obj]of Object.entries(changes||{}))if(obj?.code)out[p]={code:obj.code};return out;}
function stage(name,fn,meta,onStage){return runStage(name,fn,meta,onStage);}
function warnUnusedAssets(files,manifest){const code=Object.values(files||{}).map(f=>f?.code||'').join('\n');const missing=(manifest||[]).filter(a=>a.previewUrl&&!code.includes(a.previewUrl)&&!(a.downloadUrl&&code.includes(a.downloadUrl))).map(a=>a.assetId);if(missing.length)console.warn('[AI STUDIO MEDIA] uploaded assets not referenced by generated code',{missing});}
function buildDebugContext({ files, dependencies, architecture, requirements, design, errors, buildOutput, mediaManifest, mediaPlan }) {
 return {
   files: files || {},
   dependencies: dependencies || {},
   architecture: architecture || null,
   requirements: requirements || null,
   design: design || null,
   errors: errors || [],
   buildOutput: buildOutput || [],
   mediaManifest: mediaManifest || [],
   mediaPlan: mediaPlan || [],
 };
}

async function debugWebsite(input = {}, { onStage } = {}) {
 const files = { ...(input.files || {}) };
 let dependencies = input.dependencies || {};
 if (input.files?.['/package.json']?.code) {
   try {
     const pkg = JSON.parse(input.files['/package.json'].code);
     dependencies = { ...dependencies, ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
   } catch {}
 }
 const architecture = input.architecture || { project: { framework: 'react-vite', language: 'javascript' }, files: [] };
 const requirements = input.requirements || {};
 const design = input.design || {};
 const mediaManifest = input.mediaManifest || [];
 const mediaPlan = input.mediaPlan || requirements.mediaPlan || [];
 const MAX_DEBUG_RETRIES = Math.max(1, Number.parseInt(process.env.MAX_DEBUG_RETRIES || '3', 10) || 3);
 const meta = [];

 for (let attempt = 0; attempt < MAX_DEBUG_RETRIES; attempt += 1) {
   const staticErrors = validateGeneratedFiles(files);
   if (staticErrors.length) {
     const debug = await stage(`debug-only:${attempt + 1}`, () => debugAgent.run({
       errors: staticErrors,
       affectedFiles: Object.keys(files),
       files,
       architecture,
       requirements,
       design,
       dependencies,
       buildOutput: [],
       mediaManifest,
     }), meta, onStage);
     for (const change of debug.value?.changes || []) {
       if (change.path && typeof change.code === 'string') files[change.path] = { code: change.code };
     }
     continue;
   }

   const build = await stage('build-validator', () => buildValidator.run({ files, dependencies }), meta, onStage);
   if (build.success) {
     return {
       assistantMessage: 'Debug repair completed successfully. The existing generated website was repaired without regenerating it.',
       title: requirements.userData?.name ? `${requirements.userData.name} Portfolio` : 'Generated Portfolio',
       files,
       dependencies,
       generationMeta: { agents: meta },
     };
   }

   const debug = await stage(`debug-only:${attempt + 1}`, () => debugAgent.run({
     errors: build.errors || [],
     affectedFiles: Object.keys(files),
     files,
     architecture,
     requirements,
     design,
     dependencies,
     buildOutput: build.errors || [],
     mediaManifest,
   }), meta, onStage);
   for (const change of debug.value?.changes || []) {
     if (change.path && typeof change.code === 'string') files[change.path] = { code: change.code };
   }
 }

 const finalErrors = validateGeneratedFiles(files);
 const finalBuild = finalErrors.length ? null : await buildValidator.run({ files, dependencies });
 throw Object.assign(new Error('Debug repair failed after maximum repair attempts'), {
   userMessage: `Debug repair could not fix the existing generated website after the maximum repair attempts: ${(finalErrors.length ? finalErrors : finalBuild?.errors || []).join(' | ').slice(0, 1200)}`,
   debugContext: buildDebugContext({
     files,
     dependencies,
     architecture,
     requirements,
     design,
     errors: finalErrors.length ? finalErrors : finalBuild?.errors || [],
     buildOutput: finalBuild?.errors || [],
     mediaManifest,
     mediaPlan,
   }),
 });
}

async function generateWebsite(input,options={}){
 return withTimeout(runGeneration(input,options),GENERATION_TIMEOUT_MS,'website-generation');
}
async function runGeneration(input,{onStage}={}){
 const meta=[];console.log('[ORCHESTRATOR] Starting generation');const normalized=normalizeInput(input);
 const mediaManifest=buildMediaManifest(normalized.assets);const assetSummaries=buildAssetSummaries(normalized.assets);
 console.log('[AI STUDIO MEDIA] inputs', {assets:assetSummaries.length,inlineMedia:(normalized.media||[]).length});
 const requirementsResult=await stage('requirements',()=>requirementsAgent.run({...normalized,assetSummaries}),meta,onStage);const requirements=validateRequirements(requirementsResult.value);
 // Server-side truth: one mediaPlan entry per real image/video asset, and asset metadata (never URLs) from the manifest rather than model output.
 requirements.mediaPlan=normalizeMediaPlan(requirements.mediaPlan,normalized.assets);
 requirements.assets=assetSummaries.map(({extraction,...a})=>({...a,...(extraction?{extractionStatus:extraction.status}:{})}));
 const mediaPlan=requirements.mediaPlan;
 console.log('[AI STUDIO MEDIA] requirements analysis complete', {mediaPlan:mediaPlan.length});
 const designResult=await stage('design',()=>designAgent.run({requirements,mediaPlan,preferences:normalized.preferences,websiteType:normalized.websiteType}),meta,onStage);const design=validateDesign(designResult.value);
 console.log('[AI STUDIO MEDIA] design plan complete');
 const architectureResult=await stage('architecture',()=>architectureAgent.run({requirements,design,mediaPlan}),meta,onStage);const architecture=validateArchitecture(architectureResult.value);
 const ordered=[...architecture.files].sort((a,b)=>{const rank=f=>f.path==='/package.json'?0:f.path==='/index.html'?1:f.path==='/main.jsx'?2:f.path==='/App.js'?3:/data|content/i.test(f.path)?4:/component/i.test(f.type||'')?5:6;return rank(a)-rank(b);});
 let files={};
 console.log('[AI STUDIO MEDIA] code manifest prepared', {assets:mediaManifest.length});
 for(const fileContract of ordered){
   const relatedContracts=architecture.files.filter(f=>f.path!==fileContract.path&&(fileContract.imports||[]).includes(f.path));
   const result=await stage(`code:${fileContract.path}`,()=>codeGenerationAgent.run({fileContract,relatedContracts,requirements,design,userData:requirements.userData,mediaManifest,mediaPlan}),meta,onStage);
   if(result.value?.path!==fileContract.path||typeof result.value.code!=='string')throw new Error(`Code agent returned an invalid path/contract for ${fileContract.path}`);
   files[fileContract.path]={code:result.value.code};
 }const integrationResult=await stage('integration',()=>integrationAgent.run({requirements,design,architecture,files}),meta,onStage);files=mergeFiles(files,integrationResult.value?.files);let dependencies=architecture.dependencies||{};
 if(files['/package.json']?.code){try{const pkg=JSON.parse(files['/package.json'].code);dependencies={...dependencies,...(pkg.dependencies||{}),...(pkg.devDependencies||{})};}catch{}}
 for(let attempt=0;attempt<=MAX_BUILD_FIX_RETRIES;attempt+=1){
  const staticErrors=validateGeneratedFiles(files);
  if(staticErrors.length){console.warn('[VALIDATOR] static validation failed',{attempt,errors:staticErrors});if(attempt===MAX_BUILD_FIX_RETRIES)throw Object.assign(new Error(staticErrors.join(' | ')),{userMessage:`Generated code failed validation after the maximum repair attempts: ${staticErrors.join(' | ').slice(0,1200)}`,debugContext:buildDebugContext({files,dependencies,architecture,requirements,design,errors:staticErrors,mediaManifest,mediaPlan})});const debug=await stage(`debug:${attempt+1}`,()=>debugAgent.run({errors:staticErrors,affectedFiles:Object.keys(files),files,architecture,requirements,design,dependencies,mediaManifest}),meta,onStage);for(const change of debug.value?.changes||[])if(change.path&&change.code)files[change.path]={code:change.code};continue;}
  console.log('[VALIDATOR] static validation passed');const build=await stage('build-validator',()=>buildValidator.run({files,dependencies}),meta,onStage);if(build.success){console.log('[VALIDATOR] build passed');warnUnusedAssets(files,mediaManifest);console.log('[ORCHESTRATOR] generation completed');return {assistantMessage:`Generated a ${requirements.websiteType} website through the multi-agent pipeline.`,title:requirements.userData?.name?`${requirements.userData.name} Portfolio`:'Generated Portfolio',files,dependencies,generationMeta:{agents:meta}};}
  console.warn('[VALIDATOR] build failed',{attempt,errors:build.errors});if(attempt===MAX_BUILD_FIX_RETRIES)throw Object.assign(new Error('Build failed after maximum repair attempts'),{userMessage:`DevDrop could not produce a buildable website after the maximum repair attempts: ${(build.errors||[]).join(' | ').slice(0,1200)}`,debugContext:buildDebugContext({files,dependencies,architecture,requirements,design,errors:build.errors||[],buildOutput:build.errors||[],mediaManifest,mediaPlan})});const debug=await stage(`debug:${attempt+1}`,()=>debugAgent.run({errors:build.errors,affectedFiles:Object.keys(files),files,architecture,requirements,design,dependencies,buildOutput:build.errors,mediaManifest}),meta,onStage);for(const change of debug.value?.changes||[])if(change.path&&change.code)files[change.path]={code:change.code};
 }
 throw new Error('Generation failed after maximum repair attempts');
}
module.exports={generateWebsite,debugWebsite};
