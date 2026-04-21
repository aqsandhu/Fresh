import apiClient, { handleApiError } from './api';

class ChatService {
  async getMessages(orderId: string) {
    try {
      const response = await apiClient.get(`/chat/${orderId}`);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async sendMessage(orderId: string, message: string) {
    try {
      const response = await apiClient.post(`/chat/${orderId}`, { message });
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  }
}

export const chatService = new ChatService();
