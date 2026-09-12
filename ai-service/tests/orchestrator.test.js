jest.mock('../src/agents/requirements.agent', () => ({ run: jest.fn(async () => ({ value:{websiteType:'portfolio',goal:'x',targetAudience:'x',pages:[],sections:[],contentRequirements:{},features:[],userData:{name:'Test'},constraints:[],assets:[]},model:'test',attempt:1 })) }));
jest.mock('../src/agents/design.agent', () => ({ run: jest.fn(async () => ({ value:{designSystem:{style:'modern',theme:'dark',colors:{},typography:{},spacing:'normal',borderRadius:'medium',componentStyle:'clean',layoutStrategy:'grid',responsiveStrategy:'mobile-first',animationStrategy:'subtle'}},model:'test',attempt:1 })) }));
jest.mock('../src/agents/architecture.agent', () => ({ run: jest.fn(async () => ({ value:{project:{framework:'react-vite',language:'javascript'},files:[{path:'/App.js',type:'entry',responsibility:'entry',exports:['default'],imports:[]}],dependencies:{},routes:[],dataModel:{}},model:'test',attempt:1 })) }));
jest.mock('../src/agents/codeGeneration.agent', () => ({ run: jest.fn(async ({fileContract}) => ({ value:{path:fileContract.path,code:'export default function App(){return <div>ok</div>}'},model:'test',attempt:1 })) }));
jest.mock('../src/agents/integration.agent', () => ({ run: jest.fn(async () => ({ value:{files:{},changes:[],integrationStatus:'valid'},model:'test',attempt:1 })) }));
jest.mock('../src/agents/debug.agent', () => ({ run: jest.fn() }));
jest.mock('../src/validators/build.validator', () => ({ run: jest.fn(async () => ({success:true,errors:[],warnings:[],durationMs:1})) }));

const { generateWebsite } = require('../src/orchestrator/websiteGeneration.orchestrator');
const requirements=require('../src/agents/requirements.agent');
const design=require('../src/agents/design.agent');
const architecture=require('../src/agents/architecture.agent');
const code=require('../src/agents/codeGeneration.agent');
const integration=require('../src/agents/integration.agent');

it('runs requirements -> design -> architecture -> code -> integration -> validation', async () => {
  const stages=[];
  const result=await generateWebsite({websiteType:'portfolio',userData:{name:'Test'},preferences:{theme:'dark'},messages:[{role:'user',content:'portfolio'}]}, {onStage:(name,status)=>{if(status==='started')stages.push(name);}});
  expect(stages).toEqual(['requirements','design','architecture','code-generation','integration','build-validator']);
  expect(requirements.run).toHaveBeenCalledTimes(1);
  expect(design.run).toHaveBeenCalledTimes(1);
  expect(architecture.run).toHaveBeenCalledTimes(1);
  expect(code.run).toHaveBeenCalledTimes(1);
  expect(integration.run).toHaveBeenCalledTimes(1);
  expect(result.files['/App.js']).toBeTruthy();
});
