import api from "./axios";

export const aiGenerateAPI = {
  // messages: [{ role: 'user'|'assistant', content: string }]
  // fileData: { files: {path:{code}}, dependencies } | null — the currently
  // generated project, sent back so follow-up prompts can build on it.
  // Returns { jobId, status: 'queued' } immediately — generation runs
  // asynchronously in ai-service; poll it with getJob().
  generate: (messages, fileData) =>
    api.post("/ai-generate", { messages, fileData }),

  // jobId: from generate()'s response. Returns
  // { jobId, status: 'queued'|'processing'|'completed'|'failed', result?, error? }
  getJob: (jobId) => api.get(`/ai-generate/jobs/${jobId}`),
};
