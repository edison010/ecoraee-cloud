export class ApiError extends Error {
  constructor(message, fields = {}) {
    super(message);
    this.name = 'ApiError';
    this.fields = fields;
  }
}

// En S3 el frontend llama a la API de EC2; en local usa el mismo origen.
export const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
export const fileUrl = (id) => `${API_URL}/api/evidencia/${id}/archivo`;

export async function api(path, { method = 'GET', body, signal, file } = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}/api/${path}`, {
      method,
      headers: file ? { 'content-type': file.type } : body === undefined ? undefined : { 'content-type': 'application/json' },
      body: file ?? (body === undefined ? undefined : JSON.stringify(body)),
      signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('No hay conexión con el servidor. Revisa que esté en ejecución.');
  }

  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.error || 'Ocurrió un error inesperado.', data.fields);
  return data;
}
