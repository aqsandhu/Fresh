// The door picture (and the delivery proof photo) must leave the app as a real
// multipart upload. In September the body reached the server as the string
// "null": the client's JSON Content-Type made axios JSON-encode the FormData.
// The request interceptor now drops that header for FormData bodies.
import apiService from '../src/services/api';
import taskService from '../src/services/task.service';

describe('photo uploads', () => {
  let seen: { data: unknown; contentType: unknown } | null = null;

  beforeEach(() => {
    seen = null;
    const client = (apiService as unknown as { client: { defaults: { adapter: unknown } } }).client;
    client.defaults.adapter = async (config: { data: unknown; headers: { get?: (k: string) => unknown } & Record<string, unknown> }) => {
      const h = config.headers as any;
      seen = { data: config.data, contentType: typeof h.get === 'function' ? h.get('Content-Type') : h['Content-Type'] };
      return { data: { success: true, data: { url: 'https://cdn.example/door.jpg' } }, status: 200, statusText: 'OK', headers: {}, config };
    };
  });

  it('sends the door picture as FormData, not as JSON text', async () => {
    const url = await taskService.uploadDoorPicture('task-1', 'file:///photo.jpg');
    expect(url).toBe('https://cdn.example/door.jpg');
    expect(seen).not.toBeNull();
    expect(seen!.data).toBeInstanceOf(FormData);
    expect(String(seen!.contentType || '')).not.toMatch(/application\/json/);
  });

  it('ordinary requests are still JSON', async () => {
    await apiService.post('/rider/status', { status: 'available' });
    expect(typeof seen!.data).toBe('string');
    expect(String(seen!.contentType)).toMatch(/application\/json/);
  });
});
