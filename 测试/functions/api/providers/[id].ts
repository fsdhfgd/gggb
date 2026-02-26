export async function onRequest(context) {
  const { params } = context;
  const id = params.id;

  try {
    const response = await fetch(`https://raw.githubusercontent.com/disposable/cloud-ip-ranges/master/txt/${id}.txt`);
    
    if (!response.ok) throw new Error('Provider not found');
    
    const data = await response.text();
      
    return new Response(data, {
      headers: { 
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*' 
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
