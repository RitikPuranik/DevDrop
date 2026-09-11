import api from "./axios";

export const aiGenerateAPI = {
  // messages: [{ role: 'user'|'assistant', content: string }]
  // fileData: { files: {path:{code}}, dependencies } | null — the currently
  // generated project, sent back so follow-up prompts can build on it.
  generate: (messages, fileData) =>
    api.post("/ai-generate", { messages, fileData }),
};
