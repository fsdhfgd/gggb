import { connect } from 'cloudflare:sockets';

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // --- 后端 API ---
    if (url.pathname === '/api/scan-ip') {
      const ip = url.searchParams.get('ip');
      if (!ip) return new Response('IP required', { status: 400 });
      const ports = [443, 80, 22, 445];
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
      return new Response(JSON.stringify({ ip, status: isAlive ? "online" : "offline", latency: isAlive ? minLatency : null }), { 
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } 
      });
    }

    if (url.pathname === '/api/providers') {
      try {
        const res = await fetch("https://api.github.com/repos/disposable/cloud-ip-ranges/contents/txt", { 
          headers: { 'User-Agent': 'CF-Scanner' },
          cf: { cacheTtl: 3600 }
        });
        const data = await res.json();
        const providers = data.filter(f => f.name.endsWith(".txt")).map(f => f.name.replace(".txt", ""));
        return new Response(JSON.stringify(providers), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      } catch (e) {
        const fallbacks = ["cloudflare", "amazon", "google", "microsoft", "alibaba", "tencent"];
        return new Response(JSON.stringify(fallbacks), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      }
    }

    if (url.pathname.startsWith('/api/providers/')) {
      const id = url.pathname.split('/').pop();
      const res = await fetch(`https://raw.githubusercontent.com/disposable/cloud-ip-ranges/master/txt/${id}.txt`);
      const data = await res.text();
      return new Response(data, { headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' } });
    }

    return new Response(UI_HTML, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }
};

const UI_HTML = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>IP 扫描器 - 基础设施情报工具</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background: #09090b; color: #fafafa; font-family: system-ui, -apple-system, sans-serif; }
        .card { background: #0c0c0e; border: 1px solid #1f1f23; border-radius: 1.5rem; }
        .pulse-icon { background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); box-shadow: 0 0 20px rgba(59, 130, 246, 0.4); }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #27272a; border-radius: 10px; }
    </style>
</head>
<body class="min-h-screen flex items-center justify-center p-4">
    <div class="w-full max-w-2xl">
        <div class="card p-10 shadow-2xl">
            <div class="flex flex-col items-center mb-10">
                <div class="w-16 h-16 pulse-icon rounded-2xl flex items-center justify-center mb-6">
                    <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                    </svg>
                </div>
                <h1 class="text-3xl font-bold tracking-tight mb-2">IP 扫描器</h1>
                <p class="text-zinc-500 text-sm">检测指定 IP 范围内的在线主机</p>
            </div>

            <div class="space-y-6">
                <div>
                    <label class="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3 ml-1">选择云厂商开始优选</label>
                    <select id="ps" class="w-full bg-zinc-900/50 border border-zinc-800 p-4 rounded-2xl text-white outline-none focus:ring-2 focus:ring-blue-500/20 transition-all cursor-pointer">
                        <option value="">正在加载云厂商...</option>
                    </select>
                </div>

                <div class="grid grid-cols-3 gap-3">
                    <button id="startBtn" class="flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-600 text-white py-4 rounded-2xl font-bold transition-all disabled:opacity-50">
                        开始扫描
                    </button>
                    <button id="stopBtn" class="flex items-center justify-center gap-2 bg-red-900/30 hover:bg-red-900/50 text-red-500 py-4 rounded-2xl font-bold transition-all">
                        停止扫描
                    </button>
                    <button id="viewBtn" class="flex items-center justify-center gap-2 bg-cyan-700 hover:bg-cyan-600 text-white py-4 rounded-2xl font-bold transition-all">
                        在线IP
                    </button>
                </div>
            </div>

            <div id="st" class="mt-8 text-center text-xs font-mono text-zinc-500 hidden animate-pulse"></div>
            <div id="rs" class="mt-6 space-y-3 max-h-80 overflow-y-auto pr-2 custom-scrollbar"></div>
        </div>
    </div>

    <script>
        const $ = id => document.getElementById(id);
        let isScanning = false;

        fetch('/api/providers').then(r => r.json()).then(d => {
            $('ps').innerHTML = '<option value="">请选择云厂商...</option>' + d.map(p => '<option value="'+p+'">'+p+'</option>').join('');
        });

        // 核心优选逻辑：集成图片中的智能抽样算法
        function generateSampleIps(cidrs) {
            let totalPotential = 0;
            cidrs.forEach(cidr => {
                const bits = parseInt(cidr.split('/')[1]) || 32;
                totalPotential += Math.pow(2, 32 - bits);
            });

            const shouldSample = totalPotential > 50000;
            const maxPerCidr = shouldSample ? Math.max(5, Math.floor(50000 / cidrs.length)) : 256;
            
            const finalIps = [];
            cidrs.forEach(cidr => {
                const [ip, maskStr] = cidr.split('/');
                const mask = parseInt(maskStr) || 32;
                const count = Math.pow(2, 32 - mask);
                const step = (shouldSample && count > maxPerCidr) ? Math.floor(count / maxPerCidr) : 1;
                const limit = shouldSample ? Math.min(count, maxPerCidr) : count;

                const parts = ip.split('.').map(Number);
                for (let i = 0; i < limit; i++) {
                    let carry = i * step;
                    const current = [...parts];
                    for (let j = 3; j >= 0; j--) {
                        const val = current[j] + carry;
                        current[j] = val % 256;
                        carry = Math.floor(val / 256);
                    }
                    finalIps.push(current.join('.'));
                    if (finalIps.length > 100000) return;
                }
            });
            return finalIps;
        }

        $('startBtn').onclick = async () => {
            const p = $('ps').value;
            if(!p || isScanning) return;
            
            isScanning = true;
            $('startBtn').disabled = true;
            $('st').classList.remove('hidden');
            $('rs').innerHTML = '';
            
            try {
                const res = await fetch('/api/providers/' + p);
                const text = await res.text();
                const cidrs = text.split('\\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
                
                // 执行图片中的“全网段覆盖”抽样逻辑
                const ips = generateSampleIps(cidrs);
                
                const onlineResults = [];
                for(let i = 0; i < ips.length; i++) {
                    if(!isScanning) break;
                    $('st').innerText = '正在探测: ' + ips[i] + ' ('+(i+1)+'/'+ips.length+')';
                    
                    try {
                        const scanRes = await fetch('/api/scan-ip?ip=' + ips[i]);
                        const data = await scanRes.json();
                        if(data.status === 'online') {
                            onlineResults.push(data);
                            onlineResults.sort((a,b) => a.latency - b.latency);
                            renderResults(onlineResults);
                        }
                    } catch(e) {}
                }
                $('st').innerText = isScanning ? '优选完成' : '扫描已停止';
            } catch (e) {
                $('st').innerText = '获取数据失败';
            }
            isScanning = false;
            $('startBtn').disabled = false;
        };

        $('stopBtn').onclick = () => {
            isScanning = false;
            $('startBtn').disabled = false;
        };

        function renderResults(data) {
            $('rs').innerHTML = data.map(r => \`
                <div class="bg-zinc-900/50 border border-zinc-800 p-4 rounded-xl flex justify-between items-center">
                    <div class="flex flex-col">
                        <span class="font-mono text-sm text-zinc-200">\${r.ip}</span>
                        <span class="text-[10px] text-zinc-600 uppercase mt-1 tracking-widest">在线主机</span>
                    </div>
                    <span class="text-emerald-400 font-bold text-lg">\${r.latency}ms</span>
                </div>
            \`).join('');
        }
    </script>
</body>
</html>
`;
