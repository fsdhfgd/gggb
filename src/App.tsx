import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  Plus, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  Copy, 
  ExternalLink, 
  Trash2, 
  ShieldCheck,
  Zap,
  Globe,
  Settings2,
  Layers,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { InterfaceSource } from './types';
import { RECOMMENDED_SOURCES } from './constants';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [sources, setSources] = useState<InterfaceSource[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newSource, setNewSource] = useState({ name: '', url: '' });
  const [checkingIds, setCheckingIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'all' | 'favorites' | 'tools'>('all');
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  
  // Aggregation states
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isAggregating, setIsAggregating] = useState(false);
  const [aggregatedResult, setAggregatedResult] = useState<string | null>(null);

  // Load sources from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('yingshicang_sources');
    if (saved) {
      setSources(JSON.parse(saved));
    } else {
      setSources(RECOMMENDED_SOURCES);
    }
    
    const savedFavs = localStorage.getItem('yingshicang_favorites');
    if (savedFavs) {
      setFavorites(new Set(JSON.parse(savedFavs)));
    }
  }, []);

  // Save sources to localStorage whenever they change
  useEffect(() => {
    if (sources.length > 0) {
      localStorage.setItem('yingshicang_sources', JSON.stringify(sources));
    }
  }, [sources]);

  useEffect(() => {
    localStorage.setItem('yingshicang_favorites', JSON.stringify(Array.from(favorites)));
  }, [favorites]);

  const filteredSources = useMemo(() => {
    let result = sources;
    if (activeTab === 'favorites') {
      result = sources.filter(s => favorites.has(s.id));
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(s => 
        s.name.toLowerCase().includes(q) || 
        s.url.toLowerCase().includes(q) ||
        s.tags.some(t => t.toLowerCase().includes(q))
      );
    }
    return result;
  }, [sources, searchQuery, activeTab, favorites]);

  const handleAddSource = () => {
    if (!newSource.name || !newSource.url) return;
    const source: InterfaceSource = {
      id: crypto.randomUUID(),
      name: newSource.name,
      url: newSource.url,
      tags: ['自定义'],
      status: 'unknown'
    };
    setSources([source, ...sources]);
    setNewSource({ name: '', url: '' });
    setIsAdding(false);
  };

  const handleDeleteSource = (id: string) => {
    setSources(sources.filter(s => s.id !== id));
    const newFavs = new Set(favorites);
    newFavs.delete(id);
    setFavorites(newFavs);
  };

  const toggleFavorite = (id: string) => {
    const newFavs = new Set(favorites);
    if (newFavs.has(id)) newFavs.delete(id);
    else newFavs.add(id);
    setFavorites(newFavs);
  };

  const checkSource = async (id: string) => {
    const source = sources.find(s => s.id === id);
    if (!source) return;

    setCheckingIds(prev => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/check-interface?url=${encodeURIComponent(source.url)}`);
      const data = await res.json();
      
      setSources(prev => prev.map(s => 
        s.id === id ? { ...s, status: data.status, lastChecked: new Date().toLocaleString() } : s
      ));
    } catch (error) {
      setSources(prev => prev.map(s => 
        s.id === id ? { ...s, status: 'offline', lastChecked: new Date().toLocaleString() } : s
      ));
    } finally {
      setCheckingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const handleAggregate = async () => {
    if (selectedIds.size === 0) return;
    setIsAggregating(true);
    setAggregatedResult(null);
    setShareUrl(null);

    try {
      const results = await Promise.all(
        Array.from(selectedIds).map(async (id) => {
          const source = sources.find(s => s.id === id);
          if (!source) return null;
          const res = await fetch(`/api/check-interface?url=${encodeURIComponent(source.url)}`);
          const data = await res.json();
          return data.content;
        })
      );

      const allSites: any[] = [];
      const seenNames = new Set();

      results.forEach(config => {
        if (config && Array.isArray(config.sites)) {
          config.sites.forEach((site: any) => {
            const identifier = site.key || site.name;
            if (identifier && !seenNames.has(identifier)) {
              allSites.push(site);
              seenNames.add(identifier);
            }
          });
        }
      });

      const finalConfig = {
        sites: allSites,
        wallpaper: "https://picsum.photos/1920/1080?blur=2"
      };

      const jsonStr = JSON.stringify(finalConfig, null, 2);
      setAggregatedResult(jsonStr);

      // Save to backend
      const saveRes = await fetch('/api/aggregate/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: finalConfig })
      });
      const saveData = await saveRes.json();
      if (saveData.id) {
        setShareUrl(`${window.location.origin}/api/config/${saveData.id}`);
      }

    } catch (error) {
      console.error("Aggregation failed", error);
    } finally {
      setIsAggregating(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
              <Layers size={24} />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">影视仓接口聚合</h1>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="搜索接口、标签..." 
                className="pl-10 pr-4 py-2 bg-slate-100 border-none rounded-full text-sm w-64 focus:ring-2 focus:ring-indigo-500 transition-all"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button 
              onClick={() => setIsAdding(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 transition-colors shadow-md shadow-indigo-100"
            >
              <Plus size={18} />
              <span>添加接口</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 mb-8 bg-slate-100 p-1 rounded-xl w-fit">
          <button 
            onClick={() => setActiveTab('all')}
            className={cn(
              "px-6 py-2 rounded-lg text-sm font-medium transition-all",
              activeTab === 'all' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            全部接口
          </button>
          <button 
            onClick={() => setActiveTab('favorites')}
            className={cn(
              "px-6 py-2 rounded-lg text-sm font-medium transition-all",
              activeTab === 'favorites' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            我的收藏
          </button>
          <button 
            onClick={() => setActiveTab('tools')}
            className={cn(
              "px-6 py-2 rounded-lg text-sm font-medium transition-all",
              activeTab === 'tools' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            实用工具
          </button>
        </div>

        {activeTab !== 'tools' ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <AnimatePresence mode="popLayout">
                {filteredSources.map((source) => (
                  <motion.div
                    key={source.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="group bg-white rounded-2xl border border-slate-200 p-5 hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-50/50 transition-all duration-300"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center",
                          source.status === 'online' ? "bg-emerald-50 text-emerald-600" : 
                          source.status === 'offline' ? "bg-rose-50 text-rose-600" : "bg-slate-50 text-slate-400"
                        )}>
                          {source.status === 'online' ? <ShieldCheck size={20} /> : 
                           source.status === 'offline' ? <XCircle size={20} /> : <Globe size={20} />}
                        </div>
                        <div>
                          <h3 className="font-semibold text-slate-900">{source.name}</h3>
                          <p className="text-xs text-slate-500">{source.author || '未知作者'}</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => toggleFavorite(source.id)}
                        className={cn(
                          "p-2 rounded-lg transition-colors",
                          favorites.has(source.id) ? "text-amber-500 bg-amber-50" : "text-slate-300 hover:bg-slate-50 hover:text-slate-400"
                        )}
                      >
                        <Zap size={18} fill={favorites.has(source.id) ? "currentColor" : "none"} />
                      </button>
                    </div>

                    <p className="text-sm text-slate-600 mb-4 line-clamp-2 min-h-[2.5rem]">
                      {source.description || '暂无描述信息。'}
                    </p>

                    <div className="flex flex-wrap gap-2 mb-6">
                      {source.tags.map(tag => (
                        <span key={tag} className="px-2 py-1 bg-slate-100 text-slate-500 text-[10px] font-bold uppercase tracking-wider rounded-md">
                          {tag}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => checkSource(source.id)}
                          disabled={checkingIds.has(source.id)}
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all disabled:opacity-50"
                          title="检测状态"
                        >
                          <RefreshCw size={16} className={cn(checkingIds.has(source.id) && "animate-spin")} />
                        </button>
                        <button 
                          onClick={() => copyToClipboard(source.url)}
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                          title="复制链接"
                        >
                          <Copy size={16} />
                        </button>
                        <a 
                          href={source.url} 
                          target="_blank" 
                          rel="noreferrer"
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                          title="浏览器打开"
                        >
                          <ExternalLink size={16} />
                        </a>
                      </div>
                      <button 
                        onClick={() => handleDeleteSource(source.id)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        title="删除"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    
                    {source.lastChecked && (
                      <div className="mt-3 text-[10px] text-slate-400 flex items-center gap-1">
                        <Info size={10} />
                        上次检测: {source.lastChecked}
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            {filteredSources.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <Layers size={64} strokeWidth={1} className="mb-4 opacity-20" />
                <p className="text-lg">没有找到相关接口</p>
                <button 
                  onClick={() => setSearchQuery('')}
                  className="mt-2 text-indigo-600 hover:underline"
                >
                  清除搜索
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="max-w-4xl mx-auto space-y-8">
            <section className="bg-white rounded-2xl border border-slate-200 p-8">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Settings2 className="text-indigo-600" />
                接口聚合生成器
              </h2>
              <p className="text-slate-600 mb-6">
                选择多个接口，我们将尝试为您生成一个聚合配置。
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8 max-h-64 overflow-y-auto p-2 border border-slate-100 rounded-xl">
                {sources.map(source => (
                  <div 
                    key={source.id}
                    onClick={() => toggleSelect(source.id)}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-all",
                      selectedIds.has(source.id) ? "bg-indigo-50 border-indigo-200" : "bg-slate-50 border-transparent hover:bg-slate-100"
                    )}
                  >
                    <div className={cn(
                      "w-5 h-5 rounded flex items-center justify-center border",
                      selectedIds.has(source.id) ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-slate-300"
                    )}>
                      {selectedIds.has(source.id) && <CheckCircle2 size={14} />}
                    </div>
                    <span className="text-sm font-medium text-slate-700 truncate">{source.name}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100 text-indigo-700 text-sm">
                  聚合功能目前支持合并多个接口的 <code>sites</code> 列表。已选择 {selectedIds.size} 个接口。
                </div>
                <button 
                  onClick={handleAggregate}
                  disabled={selectedIds.size === 0 || isAggregating}
                  className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-100 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isAggregating ? <RefreshCw size={18} className="animate-spin" /> : <Layers size={18} />}
                  {isAggregating ? "正在聚合..." : "开始聚合"}
                </button>
              </div>

              {shareUrl && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-8 p-4 bg-emerald-50 border border-emerald-100 rounded-xl"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold text-emerald-700 flex items-center gap-2">
                      <CheckCircle2 size={16} /> 聚合成功！分享链接：
                    </h3>
                    <button 
                      onClick={() => copyToClipboard(shareUrl)}
                      className="text-xs text-emerald-600 hover:underline flex items-center gap-1"
                    >
                      <Copy size={12} /> 复制链接
                    </button>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-emerald-200 text-xs font-mono text-slate-600 break-all">
                    {shareUrl}
                  </div>
                  <p className="mt-2 text-[10px] text-emerald-600">
                    您可以直接在影视仓等应用中填入此链接。
                  </p>
                </motion.div>
              )}

              {aggregatedResult && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-8"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold text-slate-700">预览配置 (JSON)</h3>
                    <button 
                      onClick={() => copyToClipboard(aggregatedResult)}
                      className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
                    >
                      <Copy size={12} /> 复制全部
                    </button>
                  </div>
                  <pre className="bg-slate-900 text-slate-300 p-4 rounded-xl text-xs overflow-x-auto max-h-96 font-mono">
                    {aggregatedResult}
                  </pre>
                </motion.div>
              )}
            </section>

            <section className="bg-white rounded-2xl border border-slate-200 p-8">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <CheckCircle2 className="text-emerald-600" />
                批量检测
              </h2>
              <p className="text-slate-600 mb-6">
                一次性检测所有已保存接口的可用性。
              </p>
              <button 
                onClick={() => sources.forEach(s => checkSource(s.id))}
                className="px-6 py-3 border-2 border-slate-200 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 transition-colors"
              >
                开始批量检测
              </button>
            </section>
          </div>
        )}
      </main>

      {/* Add Source Modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAdding(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md p-8"
            >
              <h2 className="text-2xl font-bold text-slate-900 mb-6">添加新接口</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">接口名称</label>
                  <input 
                    type="text" 
                    placeholder="例如: 饭太硬"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    value={newSource.name}
                    onChange={(e) => setNewSource({ ...newSource, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">接口链接 (URL)</label>
                  <input 
                    type="text" 
                    placeholder="http://..."
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    value={newSource.url}
                    onChange={(e) => setNewSource({ ...newSource, url: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-8">
                <button 
                  onClick={() => setIsAdding(false)}
                  className="flex-1 py-3 px-4 border border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 transition-all"
                >
                  取消
                </button>
                <button 
                  onClick={handleAddSource}
                  className="flex-1 py-3 px-4 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                >
                  确认添加
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-12">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Layers size={20} className="text-indigo-600" />
            <span className="font-bold text-slate-900">影视仓聚合平台</span>
          </div>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            本平台仅作为接口聚合与测试工具，不提供任何影视资源。请遵守当地法律法规，支持正版。
          </p>
          <div className="mt-8 pt-8 border-t border-slate-100 text-xs text-slate-400">
            &copy; {new Date().getFullYear()} 影视仓接口聚合平台. Crafted with precision.
          </div>
        </div>
      </footer>
    </div>
  );
}
