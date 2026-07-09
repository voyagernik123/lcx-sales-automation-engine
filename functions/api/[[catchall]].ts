// CF Pages Function — catch-all for /api/* when the backend isn't deployed
export async function onRequest(context: {
  request: Request;
  env: Record<string, unknown>;
  params: Record<string, string>;
}): Promise<Response> {
  return new Response(
    JSON.stringify({ error: 'API server not available', code: 'API_NOT_DEPLOYED' }),
    {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
      },
    },
  );
}
