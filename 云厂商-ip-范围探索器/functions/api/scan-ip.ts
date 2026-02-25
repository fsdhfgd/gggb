import { connect } from 'cloudflare:sockets';

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const ip = url.searchParams.get('ip');

  if (!ip) {
    return new Response(JSON.stringify({ error: 'IP is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const ports = [80, 443, 22, 445];
  let isAlive = false;
  let minLatency = 9999;

  // Cloudflare Workers 限制了并发 Socket 数量，我们采用串行探测以保证稳定性
  for (const port of ports) {
    const startTime = Date.now();
    try {
      // 使用 Cloudflare 原生 TCP Socket
      const socket = connect({ hostname: ip, port: port });
      
      // 设置 1.5 秒超时
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 1500)
      );

      // 等待连接建立
      await Promise.race([socket.opened, timeoutPromise]);
      
      isAlive = true;
      minLatency = Math.min(minLatency, Date.now() - startTime);
      
      // 成功后关闭
      await socket.close();
      break; // 只要有一个端口通了就认为是在线
    } catch (e) {
      // 连接失败或超时，继续尝试下一个端口
    }
  }

  return new Response(JSON.stringify({
    ip,
    status: isAlive ? 'online' : 'offline',
    latency: isAlive ? minLatency : null
  }), {
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*' 
    }
  });
}
