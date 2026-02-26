export async function onRequest(context) {
  try {
    // 转发请求到 GitHub 获取厂商列表
    const response = await fetch("https://api.github.com/repos/disposable/cloud-ip-ranges/contents/txt", {
      headers: {
        'User-Agent': 'Cloudflare-Worker'
      }
    });
    
    if (!response.ok) throw new Error('Failed to fetch from GitHub');
    
    const data = await response.json();
    const providers = data
      .filter((file: any) => file.name.endsWith(".txt"))
      .map((file: any) => file.name.replace(".txt", ""));
      
    return new Response(JSON.stringify(providers), {
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
