import express from "express";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import Database from "better-sqlite3";
import { randomUUID } from "crypto";

const db = new Database("data.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS aggregations (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // API Route: Proxy to check if an interface URL is valid and fetch its content
  app.get("/api/check-interface", async (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "URL is required" });
    }

    try {
      const response = await axios.get(url, { timeout: 5000 });
      const isJson = typeof response.data === 'object';
      const hasSites = response.data && Array.isArray(response.data.sites);
      
      res.json({
        status: "online",
        statusCode: response.status,
        isJson,
        hasSites,
        content: isJson ? response.data : null,
        size: JSON.stringify(response.data).length
      });
    } catch (error: any) {
      res.json({
        status: "offline",
        error: error.message
      });
    }
  });

  // Save aggregated config
  app.post("/api/aggregate/save", (req, res) => {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: "Content is required" });
    
    const id = randomUUID().slice(0, 8);
    const stmt = db.prepare("INSERT INTO aggregations (id, content) VALUES (?, ?)");
    stmt.run(id, JSON.stringify(content));
    
    res.json({ id });
  });

  // Serve aggregated config
  app.get("/api/config/:id", (req, res) => {
    const { id } = req.params;
    const stmt = db.prepare("SELECT content FROM aggregations WHERE id = ?");
    const row = stmt.get(id) as { content: string } | undefined;
    
    if (!row) return res.status(404).send("Config not found");
    
    res.setHeader("Content-Type", "application/json");
    res.send(row.content);
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
