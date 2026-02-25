import { connect } from 'cloudflare:sockets';

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // --- 后端 API 逻辑 ---

    // 1. IP 探测接口
    if (url.pathname === '/api/scan-ip') {
      const ip = url.searchParams.get('ip');
      if (!ip) return new Response('IP required', { status: 400 });

      const ports = [80, 443, 22, 445];
      let isAlive = false;
      let minLatency = 9999;

      for (const port of ports) {
        const start = Date.now();
        try {
          const socket = connect({ hostname: ip, port: port });
          const timeout = new Promise((_, reject) => setTimeout(() => reject(), 1200));
          await Promise.race([socket.opened, timeout]);
          isAlive = true;
          minLatency = Math.min(minLatency, Date.now() - start);
          await socket.close();
          break;
        } catch (e) {}
      }

      return new Response(JSON.stringify({
        ip,
        status: isAlive ? 'online' : 'offline',
        latency: isAlive ? minLatency : null
      }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    // 2. 获取厂商列表
    if (url.pathname === '/api/providers') {
      const res = await fetch("https://api.github.com/repos/disposable/cloud-ip-ranges/contents/txt", {
        headers: { 'User-Agent': 'CF-Worker' }
      });
      const data = await res.json();
      const providers = data.filter(f => f.name.endsWith(".txt")).map(f => f.name.replace(".txt", ""));
      return new Response(JSON.stringify(providers), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    // 3. 获取特定厂商 IP 段
    if (url.pathname.startsWith('/api/providers/')) {
      const id = url.pathname.split('/').pop();
      const res = await fetch(`https://raw.githubusercontent.com/disposable/cloud-ip-ranges/master/txt/${id}.txt`);
      const data = await res.text();
      return new Response(data, { headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' } });
    }

    // --- 前端 UI 逻辑 (HTML) ---
    return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }
};

const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>IP 优选器 - Hello World</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap');
        body { font-family: 'Inter', sans-serif; background: #09090b; color: white; }
    </style>
</head>
<body>
    <div id="root"></div>
    <script>
        const { useState, useEffect } = React;

        function App() {
            const [providers, setProviders] = useState([]);
            const [selectedProvider, setSelectedProvider] = useState('');
            const [results, setResults] = useState([]);
            const [isScanning, setIsScanning] = useState(false);
            const [progress, setProgress] = useState('');

            useEffect(() => {
                fetch('/api/providers').then(res => res.json()).then(setProviders);
            }, []);

            const startScan = async () => {
                if (!selectedProvider) return;
                setIsScanning(true);
                setResults([]);
                
                const res = await fetch(\`/api/providers/\${selectedProvider}\`);
                const text = await res.text();
                const cidrs = text.split('\\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
                
                // 简单抽样逻辑：每个段抽 2 个
                const ipsToScan = [];
                cidrs.slice(0, 20).forEach(cidr => {
                    const base = cidr.split('/')[0].split('.').slice(0, 3).join('.');
                    ipsToScan.push(\`\${base}.1\`, \`\${base}.10\`);
                });

                for (let i = 0; i < ipsToScan.length; i++) {
                    const ip = ipsToScan[i];
                    setProgress(\`正在探测: \${ip} (\${i+1}/\${ipsToScan.length})\`);
                    try {
                        const scanRes = await fetch(\`/api/scan-ip?ip=\${ip}\`);
                        const data = await scanRes.json();
                        if (data.status === 'online') {
                            setResults(prev => [...prev, data].sort((a, b) => a.latency - b.latency));
                        }
                    } catch (e) {}
                }
                setIsScanning(false);
                setProgress('扫描完成');
            };

            return React.createElement('div', { className: 'max-w-2xl mx-auto p-8' }, [
                React.createElement('div', { className: 'mb-12 text-center' }, [
                    React.createElement('h1', { className: 'text-3xl font-bold mb-2' }, 'IP 优选器'),
                    React.createElement('span', { className: 'px-2 py-1 bg-blue-600 text-[10px] rounded font-bold' }, 'Hello World - Cloudflare Edition')
                ]),
                React.createElement('div', { className: 'bg-zinc-900 p-6 rounded-2xl border border-zinc-800 mb-8' }, [
                    React.createElement('label', { className: 'block text-xs font-bold text-zinc-500 uppercase mb-2' }, '选择云厂商'),
                    React.createElement('select', {
                        className: 'w-full bg-black border border-zinc-800 p-3 rounded-xl mb-4 text-white',
                        onChange: (e) => setSelectedProvider(e.target.value)
                    }, [
                        React.createElement('option', { value: '' }, '请选择...'),
                        ...providers.map(p => React.createElement('option', { key: p, value: p }, p))
                    ]),
                    React.createElement('button', {
                        className: \`w-full p-4 rounded-xl font-bold transition \${isScanning ? 'bg-zinc-800 text-zinc-500' : 'bg-white text-black hover:bg-zinc-200'}\`,
                        onClick: startScan,
                        disabled: isScanning
                    }, isScanning ? '优选探测中...' : '开始自动优选')
                ]),
                progress && React.createElement('p', { className: 'text-center text-xs text-zinc-500 mb-4' }, progress),
                React.createElement('div', { className: 'space-y-2' }, 
                    results.map((r, i) => React.createElement('div', { key: i, className: 'bg-zinc-900/50 p-4 rounded-xl border border-zinc-800 flex justify-between items-center' }, [
                        React.createElement('span', { className: 'font-mono' }, r.ip),
                        React.createElement('span', { className: 'text-emerald-400 font-bold' }, \`\${r.latency}ms\`)
                    ]))
                )
            ]);
        }

        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(React.createElement(App));
    </script>
</body>
</html>
\`;
