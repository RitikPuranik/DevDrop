const axios = require('axios');
const http = require('http');
const https = require('https');

const HTTP_AGENT = new http.Agent({ keepAlive: false });
const HTTPS_AGENT = new https.Agent({ keepAlive: false });
const STATUS_RETRIES = 2;

function baseUrl(){
  const url=process.env.AI_SERVICE_URL;
  if(!url){
    const err=new Error('AI_SERVICE_URL is not configured');
    err.userMessage='AI Studio is not configured yet. Set AI_SERVICE_URL in backend/.env and restart.';
    err.statusCode=500;
    throw err;
  }
  return url.replace(/\/+$/,'');
}

function headers(){return {'Content-Type':'application/json','X-Service-Key':process.env.AI_SERVICE_TOKEN||''};}

function isTransientNetworkError(error){
  const code = error?.code;
  const message = String(error?.message || '');
  return [
    'ECONNRESET',
    'ECONNREFUSED',
    'EPIPE',
    'ETIMEDOUT',
    'EAI_AGAIN',
  ].includes(code) || /socket hang up|network error/i.test(message);
}

function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}

async function requestStatus(jobId){
  return axios.get(`${baseUrl()}/jobs/${encodeURIComponent(jobId)}`,{
    headers:headers(),
    timeout:30000,
    httpAgent:HTTP_AGENT,
    httpsAgent:HTTPS_AGENT,
    proxy:false,
  });
}

async function createJob({messages,fileData,websiteType,userData,preferences,assets,conversation}){
  try{
    const response=await axios.post(`${baseUrl()}/jobs`,{messages,fileData:fileData||null,websiteType:websiteType||'portfolio',userData:userData||{},preferences:preferences||{},assets:assets||[],conversation:conversation||messages},{
      headers:headers(),
      timeout:10000,
      httpAgent:HTTP_AGENT,
      httpsAgent:HTTPS_AGENT,
      proxy:false,
    });
    return response.data?.data?.jobId;
  }catch(error){
    if(error.userMessage)throw error;
    const err=new Error(error.message);
    err.userMessage=error.response?.data?.message||'Failed to start AI generation.';
    err.statusCode=error.response?.status||502;
    throw err;
  }
}

async function getJob(jobId){
  let lastError;
  for(let attempt=0;attempt<=STATUS_RETRIES;attempt+=1){
    try{
      const response=await requestStatus(jobId);
      return response.data?.data||null;
    }catch(error){
      lastError=error;
      if(error.response?.status===404)return null;
      if(!isTransientNetworkError(error) || attempt===STATUS_RETRIES)break;
      console.warn('[AI Service Client] transient status connection error; retrying', {
        jobId,
        attempt:attempt+1,
        code:error.code,
        message:error.message,
      });
      await sleep(250*(attempt+1));
    }
  }
  if(lastError?.userMessage)throw lastError;
  const err=new Error(lastError?.message||'Failed to check AI generation status.');
  err.userMessage=lastError?.response?.data?.message||'Failed to check AI generation status.';
  err.statusCode=lastError?.response?.status||502;
  throw err;
}

module.exports={createJob,getJob};
