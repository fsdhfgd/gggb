# 影视仓接口聚合平台 (Yingshicang Interface Aggregator)

一个聚合、管理及测试影视仓（TVBox）接口的专业平台。支持接口有效性检测、配置生成与分享。

## 🚀 功能特性

- **接口管理**：支持添加、删除及收藏常用的影视仓接口。
- **状态检测**：实时检测接口的在线状态、响应速度及内容有效性。
- **聚合生成**：选择多个接口，自动合并 `sites` 列表，生成去重后的聚合配置。
- **云端分享**：聚合后的配置可保存至云端，生成短链接直接在影视仓应用中使用。
- **响应式设计**：完美适配桌面端与移动端，提供极致的用户体验。

## 🛠️ 技术栈

- **前端**：React 19, Tailwind CSS 4, Lucide React, Motion
- **后端**：Node.js, Express
- **数据库**：SQLite (better-sqlite3)
- **构建工具**：Vite 6

## 📦 快速开始

### 环境要求

- Node.js 18+
- npm 或 yarn

### 安装步骤

1. 克隆仓库：
   ```bash
   git clone https://github.com/your-username/yingshicang-aggregator.git
   cd yingshicang-aggregator
   ```

2. 安装依赖：
   ```bash
   npm install
   ```

3. 启动开发服务器：
   ```bash
   npm run dev
   ```

4. 构建生产版本：
   ```bash
   npm run build
   ```

## 📖 使用指南

1. **添加接口**：点击右上角“添加接口”，输入名称和 URL。
2. **检测状态**：点击接口卡片下方的刷新图标，查看接口是否在线。
3. **聚合配置**：
   - 切换到“实用工具”标签。
   - 在列表中勾选想要聚合的接口。
   - 点击“开始聚合”。
   - 复制生成的“分享链接”并填入影视仓应用的配置地址中。

## ⚠️ 免责声明

本平台仅作为接口聚合与测试工具，不提供任何影视资源。所有接口内容均来自互联网，本平台不对接口内容的合法性、准确性负责。请遵守当地法律法规，支持正版。

---

Made with ❤️ for the community.
