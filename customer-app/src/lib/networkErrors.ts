// What a customer should read when a request fails. Raw axios messages
// ("Network Error", "timeout of 30000ms exceeded") and server 500 texts used to
// reach the screen as they were.
import axios from 'axios';

export const OFFLINE_MESSAGE = 'No internet connection. Please check your connection and try again.';
export const TIMEOUT_MESSAGE = 'The server is taking too long to answer. Please try again.';
export const SERVER_MESSAGE = 'Something went wrong on our side. Please try again in a moment.';
export const BUSY_MESSAGE = 'Too many attempts. Please wait a moment and try again.';

export function isNetworkFailure(error: unknown): boolean {
  return axios.isAxiosError(error) && !error.response;
}

export function friendlyErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      const timedOut = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || /timeout/i.test(error.message || '');
      return timedOut ? TIMEOUT_MESSAGE : OFFLINE_MESSAGE;
    }
    const status = error.response.status;
    const serverMessage = (error.response.data as { message?: unknown } | undefined)?.message;
    if (status >= 500) return SERVER_MESSAGE;
    if (status === 429) return typeof serverMessage === 'string' && serverMessage ? serverMessage : BUSY_MESSAGE;
    if (typeof serverMessage === 'string' && serverMessage) return serverMessage;
    return error.message || SERVER_MESSAGE;
  }
  return (error as { message?: string })?.message || SERVER_MESSAGE;
}
