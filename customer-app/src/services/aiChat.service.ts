import apiClient from './api';

export type ChatRole = 'user' | 'assistant';
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export const aiChatService = {
  async getStatus(): Promise<{ enabled: boolean }> {
    try {
      const res = await apiClient.get('/ai-chat/status');
      return res.data?.data || res.data || { enabled: false };
    } catch {
      return { enabled: false };
    }
  },

  async sendMessage(messages: ChatMessage[]): Promise<{ reply: string }> {
    const res = await apiClient.post('/ai-chat/message', { messages });
    return res.data?.data || res.data;
  },
};

export default aiChatService;
