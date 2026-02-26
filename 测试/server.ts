import express from "express";
import { createServer as createViteServer } from "vite";
import axios from "axios";

// 数据缓存
let providerCache: string[] = [];
let ipRangesCache: string = "";
let lastUpdateTime: number = 0;

// 优选结果缓存
interface OptimalIP {
  ip: string;
  latency: number;
  provider: string;
}

let optimalIPsCache: OptimalIP[] = [];
let lastOptimizationTime: number = 0;

async function startServer() {
  const app = express();
  const PORT = 3000;

  // 测试单个IP的在线状态和延迟
  const testIP = async (ip: string, provider: string): Promise<OptimalIP | null> => {
    try {
      const net = await import("net");
      const ports = [80, 443, 22, 445];
      let isAlive = false;
      let minLatency = 9999;

      for (const port of ports) {
        const startTime = Date.now();
        const socket = new net.Socket();
        socket.setTimeout(1500);

        const connected = await new Promise<boolean>((resolve) => {
          socket.on("connect", () => {
            resolve(true);
          });
          socket.on("timeout", () => {
            resolve(false);
          });
          socket.on("error", () => {
            resolve(false);
          });
          socket.connect(port, ip);
        });

        if (connected) {
          const latency = Date.now() - startTime;
          if (latency < minLatency) {
            minLatency = latency;
          }
          isAlive = true;
          socket.destroy();
          break;
        } else {
          socket.destroy();
        }
      }

      if (isAlive) {
        return { ip, latency: minLatency, provider };
      }
      return null;
    } catch (error) {
      return null;
    }
  };

  // 自动优选IP
  const optimizeIPs = async () => {
    try {
      console.log(`[${new Date().toISOString()}] 开始自动优选IP...`);
      const newOptimalIPs: OptimalIP[] = [];

      // 为每个厂商选择前几个IP段进行测试
      const testLimit = 5; // 每个厂商测试的IP段数量
      const ipPerCidr = 2; // 每个IP段测试的IP数量

      for (const provider of providerCache.slice(0, 10)) { // 限制测试的厂商数量
        try {
          const response = await axios.get(`https://raw.githubusercontent.com/disposable/cloud-ip-ranges/master/txt/${provider}.txt`);
          const lines = response.data.split('\n');
          const cidrs = lines
            .map((line: string) => line.trim())
            .filter((line: string) => line && !line.startsWith('#'));

          // 测试前几个IP段
          for (const cidr of cidrs.slice(0, testLimit)) {
            try {
              // 从CIDR中提取基本IP并生成测试IP
              const baseIP = cidr.split('/')[0];
              const parts = baseIP.split('.');
              if (parts.length === 4) {
                // 生成几个测试IP
                for (let i = 1; i <= ipPerCidr; i++) {
                  const testIPStr = `${parts[0]}.${parts[1]}.${parts[2]}.${parseInt(parts[3]) + i}`;
                  const result = await testIP(testIPStr, provider);
                  if (result) {
                    newOptimalIPs.push(result);
                  }
                }
              }
            } catch (error) {
              continue;
            }
          }
        } catch (error) {
          continue;
        }
      }

      // 按延迟排序并保留前20个最优IP
      newOptimalIPs.sort((a, b) => a.latency - b.latency);
      optimalIPsCache = newOptimalIPs.slice(0, 20);
      lastOptimizationTime = Date.now();

      console.log(`[${new Date().toISOString()}] IP优选完成。找到 ${optimalIPsCache.length} 个在线IP。`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] IP优选失败:`, error);
    }
  };

  // 定时同步任务
  const syncData = async () => {
    try {
      console.log(`[${new Date().toISOString()}] 正在同步云厂商数据...`);
      
      // 1. 获取厂商列表
      const providersResponse = await axios.get("https://api.github.com/repos/disposable/cloud-ip-ranges/contents/txt");
      providerCache = providersResponse.data
        .filter((file: any) => file.name.endsWith(".txt"))
        .map((file: any) => file.name.replace(".txt", ""));

      // 2. 获取所有合并的 IP 段数据
      const ipRangesResponse = await axios.get("https://raw.githubusercontent.com/disposable/cloud-ip-ranges/master/cloud-ip-ranges.txt");
      ipRangesCache = ipRangesResponse.data;

      lastUpdateTime = Date.now();
      console.log(`[${new Date().toISOString()}] 同步完成。已缓存 ${providerCache.length} 个厂商数据。`);

      // 同步完成后执行IP优选
      await optimizeIPs();
    } catch (error) {
      console.error(`[${new Date().toISOString()}] 同步失败:`, error);
    }
  };

  // 每 2 小时执行一次 (2 * 60 * 60 * 1000 ms)
  setInterval(syncData, 2 * 60 * 60 * 1000);
  // 启动时立即执行一次
  syncData();

  // API Routes
  app.get("/api/providers", async (req, res) => {
    if (providerCache.length > 0) {
      return res.json(providerCache);
    }
    
    try {
      const response = await axios.get("https://api.github.com/repos/disposable/cloud-ip-ranges/contents/txt");
      const providers = response.data
        .filter((file: any) => file.name.endsWith(".txt"))
        .map((file: any) => file.name.replace(".txt", ""));
      providerCache = providers;
      res.json(providers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch providers" });
    }
  });

  app.get("/api/providers/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const response = await axios.get(`https://raw.githubusercontent.com/disposable/cloud-ip-ranges/master/txt/${id}.txt`);
      res.send(response.data);
    } catch (error) {
      res.status(404).json({ error: "Provider not found" });
    }
  });

  app.get("/api/check-ip", async (req, res) => {
    if (ipRangesCache) {
      return res.json({ data: ipRangesCache, lastUpdate: lastUpdateTime });
    }

    try {
      const response = await axios.get("https://raw.githubusercontent.com/disposable/cloud-ip-ranges/master/cloud-ip-ranges.txt");
      ipRangesCache = response.data;
      res.json({ data: response.data });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch IP ranges" });
    }
  });

  app.get("/api/status", (req, res) => {
    res.json({
      status: "online",
      providersCount: providerCache.length,
      lastUpdate: lastUpdateTime ? new Date(lastUpdateTime).toISOString() : "never",
      lastOptimization: lastOptimizationTime ? new Date(lastOptimizationTime).toISOString() : "never",
      optimalIPsCount: optimalIPsCache.length,
      nextUpdate: lastUpdateTime ? new Date(lastUpdateTime + 2 * 60 * 60 * 1000).toISOString() : "pending"
    });
  });

  app.get("/api/optimal-ips", (req, res) => {
    res.json({
      optimalIPs: optimalIPsCache,
      lastOptimization: lastOptimizationTime ? new Date(lastOptimizationTime).toISOString() : "never",
      totalCount: optimalIPsCache.length
    });
  });

  app.get("/api/scan-ip", async (req, res) => {
    const { ip } = req.query;
    if (!ip) {
      return res.status(400).json({ error: "IP is required" });
    }

    const ipStr = ip as string;
    const net = await import("net");
    
    const ports = [80, 443, 22, 445];
    let isAlive = false;
    let checkedCount = 0;
    let minLatency = 9999;

    const checkPort = (port: number) => {
      const socket = new net.Socket();
      const startTime = Date.now();
      socket.setTimeout(1500);
      
      socket.on("connect", () => {
        isAlive = true;
        const latency = Date.now() - startTime;
        if (latency < minLatency) minLatency = latency;
        socket.destroy();
      });

      socket.on("timeout", () => {
        socket.destroy();
      });

      socket.on("error", () => {
        socket.destroy();
      });

      socket.on("close", () => {
        checkedCount++;
        if (isAlive || checkedCount === ports.length) {
          if (!res.headersSent) {
            res.json({ 
              ip: ipStr, 
              status: isAlive ? "online" : "offline",
              latency: isAlive ? minLatency : null
            });
          }
        }
      });

      socket.connect(port, ipStr);
    };

    ports.forEach(checkPort);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
