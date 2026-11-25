export class MultipartBodyTooLargeError extends Error {
  constructor() {
    super('Multipart request body exceeds the allowed size.');
    this.name = 'MultipartBodyTooLargeError';
  }
}

export function withMultipartBodyLimit(request: Request, maxBytes: number): Request {
  const reader = request.body?.getReader();
  if (!reader) return request;

  let bytesRead = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        bytesRead += value.byteLength;
        if (bytesRead > maxBytes) {
          try {
            await reader.cancel();
          } finally {
            controller.error(new MultipartBodyTooLargeError());
          }
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        controller.error(error);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });

  const headers = new Headers();
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  const init: RequestInit & { duplex: 'half' } = {
    method: request.method,
    headers,
    body,
    duplex: 'half',
  };
  return new Request(request.url, init);
}
