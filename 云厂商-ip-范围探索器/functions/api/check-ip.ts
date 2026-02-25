export async function onRequest(context) {
  try {
    const response = await fetch("https://raw.githubusercontent.com/disposable/cloud-ip-ranges/master/cloud-ip-ranges.txt");
    
    if (!response.ok) throw new Error('Failed to fetch IP ranges');
    
    const data = await response.text();
      
    return new Response(JSON.stringify({ data }), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*' 
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
