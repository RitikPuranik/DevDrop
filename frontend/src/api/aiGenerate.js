import api from "./axios";

export const aiGenerateAPI = {
  generate: (messages, fileData, spec = {}) =>
    api.post("/ai-generate", {
      messages,
      fileData,
      websiteType: spec.websiteType,
      userData: spec.userData,
      preferences: spec.preferences,
      assets: spec.assets,
      conversation: spec.conversation,
    }),
  getJob: (jobId) => api.get(`/ai-generate/jobs/${jobId}`),
};
