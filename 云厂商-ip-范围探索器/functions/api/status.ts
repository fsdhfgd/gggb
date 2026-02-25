export async function onRequest(context) {
  return new Response(JSON.stringify({
    status: "online",
    platform: "Cloudflare Pages Functions",
    message: "Hello World from Cloudflare Edge"
  }), {
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*' 
    }
  });
}
