import api from "./axios";

export const aiGenerateAPI = {
  generate: (messages, fileData) =>
    api.post("/ai-generate", { messages, fileData }),

  getJob: (jobId) =>
    api.get(`/ai-generate/jobs/${encodeURIComponent(jobId)}`),
};
