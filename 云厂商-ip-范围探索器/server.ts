import express from "express";
import { createServer as createViteServer } from "vite";
import axios from "axios";

// 数据缓存
let providerCache: string[] = [];
let ipRangesCache: string = "";
let lastUpdateTime: number = 0;

async function startServer() {
  const app = express();
  const PORT = 3000;

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
    } catch (error) {
      console.error(`[${new Date().toISOString()}] 同步失败:`, error);
    }
  };

  // 每 30 分钟执行一次 (30 * 60 * 1000 ms)
  setInterval(syncData, 30 * 60 * 1000);
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
      nextUpdate: lastUpdateTime ? new Date(lastUpdateTime + 30 * 60 * 1000).toISOString() : "pending"
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
