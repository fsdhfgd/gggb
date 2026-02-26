/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  Download, 
  Shield, 
  Globe, 
  ChevronRight, 
  ExternalLink, 
  Info, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  Copy,
  Terminal,
  Activity,
  Zap,
  Square
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ipaddr from 'ipaddr.js';
import { cn, formatProviderName } from './lib/utils';

type Provider = string;

interface MatchResult {
  provider: string;
  network: string;
}

export default function App() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [providerData, setProviderData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkIp, setCheckIp] = useState('');
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<MatchResult[] | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [allData, setAllData] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'explore' | 'checker' | 'scanner'>('explore');

  // IP Scanner State
  const [scanRange, setScanRange] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanResults, setScanResults] = useState<{ip: string, status: string, latency?: number}[]>([]);
  const [currentScanningIp, setCurrentScanningIp] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const stopScanRef = React.useRef(false);

  useEffect(() => {
    fetch('/api/providers')
      .then((res) => res.json())
      .then((data) => setProviders(data))
      .catch((err) => console.error('获取厂商列表失败', err));

    fetch('/api/status')
      .then((res) => res.json())
      .then((data) => {
        if (data.lastUpdate && data.lastUpdate !== "never") {
          setLastUpdate(new Date(data.lastUpdate).toLocaleString());
        }
      })
      .catch((err) => console.error('获取状态失败', err));
  }, []);

  const filteredProviders = useMemo(() => {
    return providers.filter((p) => 
      p.toLowerCase().includes(searchQuery.toLowerCase()) ||
      formatProviderName(p).toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [providers, searchQuery]);

  const handleSelectProvider = async (id: Provider) => {
    setSelectedProvider(id);
    setLoading(true);
    try {
      const res = await fetch(`/api/providers/${id}?format=txt`);
      const text = await res.text();
      setProviderData(text);
    } catch (err) {
      console.error('获取厂商数据失败', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckIp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkIp) return;

    setChecking(true);
    setCheckError(null);
    setCheckResult(null);

    try {
      if (!ipaddr.isValid(checkIp)) {
        throw new Error('无效的 IP 地址格式');
      }

      const targetIp = ipaddr.parse(checkIp);
      
      let data = allData;
      if (!data) {
        const res = await fetch('/api/check-ip?ip=' + checkIp);
        const json = await res.json();
        data = json.data;
        setAllData(data);
        if (json.lastUpdate) {
          setLastUpdate(new Date(json.lastUpdate).toLocaleString());
        }
      }

      if (!data) throw new Error('无法加载 IP 范围数据');

      const matches: MatchResult[] = [];
      let currentProvider = '';
      
      const lines = data.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith('# Provider:')) {
          currentProvider = trimmed.split(':')[1].trim();
          continue;
        }

        if (trimmed.includes('/') && currentProvider) {
          try {
            const network = ipaddr.parseCIDR(trimmed);
            if (targetIp.kind() === network[0].kind() && targetIp.match(network)) {
              matches.push({ provider: currentProvider, network: trimmed });
            }
          } catch (e) {
          }
        }
      }

      setCheckResult(matches);
    } catch (err: any) {
      setCheckError(err.message || '检查 IP 时发生错误');
    } finally {
      setChecking(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const generateIpRange = (input: string) => {
    setScanError(null);
    const allIps: string[] = [];
    const cidrs = input.split(/[\s,]+/).filter(Boolean);
    
    try {
      // Calculate total potential IPs first
      let totalPotential = 0;
      for (const cidr of cidrs) {
        if (cidr.includes('/')) {
          const bits = parseInt(cidr.split('/')[1]);
          if (!isNaN(bits)) totalPotential += Math.pow(2, 32 - bits);
        } else {
          totalPotential += 1;
        }
      }

      // If total is huge, we sample
      const shouldSample = totalPotential > 50000;
      const maxPerCidr = shouldSample ? Math.max(10, Math.floor(50000 / cidrs.length)) : Infinity;

      for (const cidr of cidrs) {
        if (!cidr.includes('/')) {
          if (ipaddr.isValid(cidr)) {
            allIps.push(cidr);
            continue;
          }
          continue; // Skip invalid
        }

        const [range, bits] = cidr.split('/');
        if (!ipaddr.isValid(range)) continue;
        
        const addr = ipaddr.parse(range);
        if (addr.kind() !== 'ipv4') continue; 
        
        const mask = parseInt(bits);
        if (isNaN(mask) || mask < 0 || mask > 32) continue;
        
        const start = ipaddr.IPv4.parse(range).toByteArray();
        const count = Math.pow(2, 32 - mask);
        
        // Sample logic: if count > maxPerCidr, we pick spread out IPs
        const step = shouldSample && count > maxPerCidr ? Math.floor(count / maxPerCidr) : 1;
        const limit = shouldSample ? Math.min(count, maxPerCidr) : count;

        for (let i = 0; i < limit; i++) {
          const current = [...start];
          let carry = i * step;
          for (let j = 3; j >= 0; j--) {
            const val = current[j] + carry;
            current[j] = val % 256;
            carry = Math.floor(val / 256);
          }
          allIps.push(current.join('.'));
          
          if (allIps.length > 100000) break;
        }
        if (allIps.length > 100000) break;
      }
      return allIps;
    } catch (e: any) {
      setScanError(e.message || '解析 IP 范围时出错');
      return [];
    }
  };

  const startIpScan = async () => {
    if (!scanRange) return;
    setScanError(null);
    const ips = generateIpRange(scanRange);
    if (ips.length === 0) return;

    setIsScanning(true);
    setScanResults([]);
    stopScanRef.current = false;

    // 要扫描的端口列表
    const ports = [80, 8080, 8880, 2052, 2082, 2086, 2095, 443, 2053, 2083, 2087, 2096, 8443];

    // Concurrency control: scan 50 IPs at a time
    const concurrency = 50;
    for (let i = 0; i < ips.length; i += concurrency) {
      if (stopScanRef.current) break;
      const chunk = ips.slice(i, i + concurrency);
      
      await Promise.all(chunk.map(async (ip) => {
        if (stopScanRef.current) return;
        setCurrentScanningIp(ip);
        try {
          // 尝试扫描所有端口
          let lowestLatency = 9999;
          let isOnline = false;
          
          for (const port of ports) {
            if (stopScanRef.current) break;
            try {
              const res = await fetch(`/api/scan-ip?ip=${ip}&port=${port}`);
              if (!res.ok) continue;
              const data = await res.json();
              if (data.status === 'online' && data.latency < lowestLatency) {
                lowestLatency = data.latency;
                isOnline = true;
              }
            } catch (e) {
              continue;
            }
          }
          
          if (isOnline) {
            setScanResults(prev => {
              const newList = [...prev, { ip, status: 'online', latency: lowestLatency }];
              // Sort by latency (lowest first)
              return newList.sort((a, b) => (a.latency || 9999) - (b.latency || 9999));
            });
          } else {
            setScanResults(prev => [...prev, { ip, status: 'offline' }]);
          }
        } catch (e) {
        }
      }));
    }

    setIsScanning(false);
    setCurrentScanningIp(null);
  };

  const stopIpScan = () => {
    stopScanRef.current = true;
    setIsScanning(false);
  };

  const handleSelectProviderForScan = async (id: string) => {
    if (!id) return;
    try {
      const res = await fetch(`/api/providers/${id}?format=txt`);
      const text = await res.text();
      // Get all non-comment lines
      const allCidrs = text.split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));
      
      if (allCidrs.length > 0) {
        setScanRange(allCidrs.join(', '));
      }
    } catch (e) {
      console.error('获取厂商 CIDR 失败', e);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-zinc-900 rounded-xl flex items-center justify-center text-white shadow-lg shadow-zinc-200">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">云厂商 IP 探索器 <span className="text-[10px] bg-blue-500 text-white px-1.5 py-0.5 rounded ml-1 font-bold">Hello World</span></h1>
              <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">基础设施情报工具</p>
            </div>
          </div>
          
          <nav className="flex items-center gap-1 bg-zinc-100 p-1 rounded-lg">
            <button 
              onClick={() => setActiveTab('explore')}
              className={cn(
                "px-4 py-1.5 text-sm font-medium rounded-md transition-all",
                activeTab === 'explore' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
              )}
            >
              探索
            </button>
            <button 
              onClick={() => setActiveTab('checker')}
              className={cn(
                "px-4 py-1.5 text-sm font-medium rounded-md transition-all",
                activeTab === 'checker' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
              )}
            >
              IP 检查器
            </button>
            <button 
              onClick={() => setActiveTab('scanner')}
              className={cn(
                "px-4 py-1.5 text-sm font-medium rounded-md transition-all",
                activeTab === 'scanner' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
              )}
            >
              IP 扫描
            </button>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {activeTab === 'explore' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-4 space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input 
                  type="text" 
                  placeholder="搜索厂商..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-900 transition-all"
                />
              </div>

              <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="p-4 border-b border-zinc-100 bg-zinc-50/50">
                  <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">支持的厂商</h2>
                </div>
                <div className="max-h-[calc(100vh-320px)] overflow-y-auto custom-scrollbar">
                  {filteredProviders.length > 0 ? (
                    filteredProviders.map((id) => (
                      <button
                        key={id}
                        onClick={() => handleSelectProvider(id)}
                        className={cn(
                          "w-full text-left px-4 py-3 text-sm flex items-center justify-between group transition-colors border-b border-zinc-50 last:border-0",
                          selectedProvider === id ? "bg-zinc-900 text-white" : "hover:bg-zinc-50 text-zinc-700"
                        )}
                      >
                        <span className="font-medium">{formatProviderName(id)}</span>
                        <ChevronRight className={cn(
                          "w-4 h-4 transition-transform",
                          selectedProvider === id ? "translate-x-0" : "-translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100"
                        )} />
                      </button>
                    ))
                  ) : (
                    <div className="p-8 text-center text-zinc-400">
                      <p className="text-sm">未找到相关厂商</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="lg:col-span-8">
              <AnimatePresence mode="wait">
                {selectedProvider ? (
                  <motion.div
                    key={selectedProvider}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-6"
                  >
                    <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-zinc-100 rounded-xl flex items-center justify-center text-zinc-900">
                            <Globe className="w-6 h-6" />
                          </div>
                          <div>
                            <h2 className="text-2xl font-bold tracking-tight">{formatProviderName(selectedProvider)}</h2>
                            <p className="text-sm text-zinc-500">公共 IP 范围和 CIDR 块</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <a 
                            href={`https://raw.githubusercontent.com/disposable/cloud-ip-ranges/master/txt/${selectedProvider}.txt`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 transition-colors"
                          >
                            <Download className="w-4 h-4" />
                            原始 TXT
                          </a>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                        <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-100">
                          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">格式</p>
                          <p className="text-sm font-semibold">CIDR / IPv4 / IPv6</p>
                        </div>
                        <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-100">
                          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">来源</p>
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold">GitHub 仓库</span>
                            <ExternalLink className="w-3 h-3 text-zinc-400" />
                          </div>
                        </div>
                        <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-100">
                          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">状态</p>
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                            <span className="text-sm font-semibold">已验证</span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-zinc-900">IP 范围</h3>
                          <button 
                            onClick={() => providerData && copyToClipboard(providerData)}
                            className="text-xs font-medium text-zinc-500 hover:text-zinc-900 flex items-center gap-1.5 transition-colors"
                          >
                            <Copy className="w-3 h-3" />
                            复制全部
                          </button>
                        </div>
                        <div className="relative">
                          {loading ? (
                            <div className="h-64 flex flex-col items-center justify-center bg-zinc-50 rounded-xl border border-dashed border-zinc-200 gap-3">
                              <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
                              <p className="text-sm text-zinc-500">正在获取范围...</p>
                            </div>
                          ) : (
                            <div className="bg-zinc-900 rounded-xl p-4 font-mono text-xs text-zinc-300 h-[400px] overflow-y-auto custom-scrollbar leading-relaxed">
                              {providerData ? (
                                providerData.split('\n').map((line, i) => (
                                  <div key={i} className={cn(
                                    "py-0.5",
                                    line.startsWith('#') ? "text-zinc-500 italic" : "text-zinc-300"
                                  )}>
                                    {line}
                                  </div>
                                ))
                              ) : (
                                <p className="text-zinc-600">暂无数据</p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="bg-zinc-900 rounded-2xl p-6 text-white overflow-hidden relative group">
                      <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-2">
                          <Terminal className="w-4 h-4 text-zinc-400" />
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">CLI 命令</span>
                        </div>
                        <code className="text-sm font-mono block bg-white/5 p-3 rounded-lg border border-white/10">
                          curl -s https://raw.githubusercontent.com/disposable/cloud-ip-ranges/master/txt/{selectedProvider}.txt
                        </code>
                      </div>
                      <div className="absolute top-0 right-0 w-64 h-64 bg-zinc-800 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl opacity-20 group-hover:opacity-30 transition-opacity" />
                    </div>
                  </motion.div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-12 bg-white border border-zinc-200 border-dashed rounded-3xl">
                    <div className="w-16 h-16 bg-zinc-50 rounded-2xl flex items-center justify-center text-zinc-300 mb-4">
                      <Info className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold text-zinc-900">请选择一个厂商</h3>
                    <p className="text-sm text-zinc-500 max-w-xs mx-auto mt-2">
                      从左侧列表中选择一个云厂商，查看其官方 IP 范围和 CIDR 块。
                    </p>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </div>
        ) : activeTab === 'checker' ? (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white border border-zinc-200 rounded-3xl p-8 shadow-sm">
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-zinc-900 rounded-2xl flex items-center justify-center text-white mx-auto mb-4 shadow-xl shadow-zinc-200">
                  <Shield className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight">基础设施检查器</h2>
                <p className="text-sm text-zinc-500 mt-2">识别任何 IP 地址背后的云服务商</p>
              </div>

              <form onSubmit={handleCheckIp} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider ml-1">IP 地址</label>
                  <div className="relative">
                    <input 
                      type="text" 
                      placeholder="例如 8.8.8.8 或 2606:4700::" 
                      value={checkIp}
                      onChange={(e) => setCheckIp(e.target.value)}
                      className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-900 transition-all font-mono"
                    />
                    <button 
                      type="submit"
                      disabled={checking || !checkIp}
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-1.5 bg-zinc-900 text-white text-xs font-bold rounded-lg hover:bg-zinc-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : '检查'}
                    </button>
                  </div>
                </div>
              </form>

              <div className="mt-8">
                <AnimatePresence mode="wait">
                  {checking ? (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="p-12 text-center space-y-3"
                    >
                      <Loader2 className="w-8 h-8 text-zinc-300 animate-spin mx-auto" />
                      <p className="text-sm text-zinc-500 font-medium">正在分析基础设施范围...</p>
                    </motion.div>
                  ) : checkError ? (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-600"
                    >
                      <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold">验证失败</p>
                        <p className="text-xs opacity-80">{checkError}</p>
                      </div>
                    </motion.div>
                  ) : checkResult ? (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-4"
                    >
                      <div className="flex items-center justify-between px-1">
                        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">结果</h3>
                        <span className="text-[10px] font-medium px-2 py-0.5 bg-zinc-100 text-zinc-500 rounded-full">
                          找到 {checkResult.length} 个匹配项
                        </span>
                      </div>
                      
                      {checkResult.length > 0 ? (
                        <div className="space-y-3">
                          {checkResult.map((res, i) => (
                            <div key={i} className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-between group">
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-100">
                                  <CheckCircle2 className="w-5 h-5" />
                                </div>
                                <div>
                                  <p className="text-sm font-bold text-emerald-900">{res.provider}</p>
                                  <p className="text-xs text-emerald-700 font-mono">{res.network}</p>
                                </div>
                              </div>
                              <button 
                                onClick={() => {
                                  const providerId = res.provider.toLowerCase().replace(/\s+/g, '-');
                                  setSelectedProvider(providerId);
                                  setActiveTab('explore');
                                  handleSelectProvider(providerId);
                                }}
                                className="p-2 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors"
                              >
                                <ChevronRight className="w-5 h-5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-8 bg-zinc-50 border border-zinc-100 border-dashed rounded-2xl text-center">
                          <p className="text-sm text-zinc-500">未找到匹配此 IP 的云服务商。</p>
                          <p className="text-xs text-zinc-400 mt-1">该 IP 可能属于私有网络、住宅 ISP 或不在我们数据库中的提供商。</p>
                        </div>
                      )}
                    </motion.div>
                  ) : (
                    <div className="p-12 text-center text-zinc-400 border border-zinc-100 border-dashed rounded-3xl">
                      <Globe className="w-8 h-8 mx-auto mb-3 opacity-20" />
                      <p className="text-sm">输入 IP 地址开始分析</p>
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto">
            <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-8 shadow-2xl text-white">
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white mx-auto mb-4 shadow-xl shadow-blue-900/20">
                  <Activity className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight">IP 扫描器</h2>
                <p className="text-sm text-zinc-400 mt-2">检测指定 IP 范围内的在线主机</p>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider ml-1">选择云厂商开始优选</label>
                  <div className="relative">
                    <select 
                      onChange={(e) => handleSelectProviderForScan(e.target.value)}
                      className="w-full px-4 py-4 bg-zinc-900 border border-zinc-800 rounded-2xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-white appearance-none cursor-pointer shadow-inner"
                    >
                      <option value="">请选择云厂商...</option>
                      {providers.map(p => (
                        <option key={p} value={p}>{formatProviderName(p)}</option>
                      ))}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500">
                      <ChevronRight className="w-5 h-5 rotate-90" />
                    </div>
                  </div>
                  {scanRange && !scanError && (
                    <p className="text-[10px] text-emerald-400 font-medium ml-1 flex items-center gap-1 animate-in fade-in slide-in-from-top-1">
                      <CheckCircle2 className="w-3 h-3" />
                      已成功获取该厂商的 {scanRange.split(',').length} 个 IP 段
                    </p>
                  )}
                  {scanError && (
                    <p className="text-[10px] text-red-400 font-medium ml-1 flex items-center gap-1 animate-in fade-in slide-in-from-top-1">
                      <AlertCircle className="w-3 h-3" />
                      {scanError}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-4 justify-center">
                  <button 
                    onClick={startIpScan}
                    disabled={isScanning || !scanRange}
                    className="flex-1 min-w-[140px] px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <Zap className="w-4 h-4" />
                    开始扫描
                  </button>
                  <button 
                    onClick={stopIpScan}
                    disabled={!isScanning}
                    className="flex-1 min-w-[140px] px-6 py-3 bg-red-500/80 text-white font-bold rounded-xl hover:bg-red-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <Square className="w-4 h-4" />
                    停止扫描
                  </button>
                  <div className="flex-1 min-w-[140px] px-6 py-3 bg-cyan-500/80 text-zinc-900 font-bold rounded-xl flex items-center justify-center gap-2">
                    <Globe className="w-4 h-4" />
                    在线IP {scanResults.filter(r => r.status === 'online').length > 0 && `(${scanResults.filter(r => r.status === 'online').length})`}
                  </div>
                </div>

                <div className="mt-8 space-y-4">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">扫描结果</h3>
                    <div className="flex items-center gap-2">
                      {scanResults.filter(r => r.status === 'online').length > 0 && (
                        <button 
                          onClick={() => {
                            const onlineIPs = scanResults.filter(r => r.status === 'online');
                            let csvContent = 'IP地址,状态,延迟(ms)\n';
                            onlineIPs.forEach(ip => {
                              csvContent += `${ip.ip},${ip.status},${ip.latency || ''}\n`;
                            });
                            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                            const link = document.createElement('a');
                            const url = URL.createObjectURL(blob);
                            link.setAttribute('href', url);
                            link.setAttribute('download', `online-ips-${new Date().toISOString().split('T')[0]}.csv`);
                            link.style.visibility = 'hidden';
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                          }}
                          className="flex items-center gap-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors px-3 py-1.5 bg-emerald-500/10 rounded-lg"
                        >
                          <Download className="w-3 h-3" />
                          导出在线IP
                        </button>
                      )}
                      {isScanning && (
                        <div className="flex items-center gap-2 text-blue-400 text-[10px] font-bold animate-pulse">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          正在扫描: {currentScanningIp}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden min-h-[200px]">
                    {scanResults.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-zinc-800">
                        {scanResults.filter(r => r.status === 'online').map((res, i) => (
                          <div key={`online-${i}`} className="bg-zinc-900 p-4 flex items-center justify-between border-b border-zinc-800 sm:border-r">
                            <div className="flex flex-col">
                              <span className="text-xs font-mono text-zinc-300">{res.ip}</span>
                              <span className="text-[10px] text-emerald-400/70 font-mono mt-0.5">延迟: {res.latency}ms</span>
                            </div>
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
                              在线
                            </span>
                          </div>
                        ))}
                        {scanResults.filter(r => r.status === 'offline').slice(0, 20).map((res, i) => (
                          <div key={`offline-${i}`} className="bg-zinc-900 p-4 flex items-center justify-between opacity-40">
                            <span className="text-xs font-mono text-zinc-300">{res.ip}</span>
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-500">
                              离线
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-12 text-center text-zinc-600">
                        <Activity className="w-8 h-8 mx-auto mb-3 opacity-20" />
                        <p className="text-sm">等待开始扫描...</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 bg-white border border-zinc-200 rounded-2xl flex items-start gap-3">
            <div className="p-2 bg-zinc-50 rounded-lg text-zinc-400">
              <Info className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-zinc-900 mb-1">范围扫描</p>
              <p className="text-[11px] text-zinc-500 leading-relaxed">支持 CIDR 格式（如 /24），自动探测子网内所有存活主机。</p>
            </div>
          </div>
          <div className="p-4 bg-white border border-zinc-200 rounded-2xl flex items-start gap-3">
            <div className="p-2 bg-zinc-50 rounded-lg text-zinc-400">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-zinc-900 mb-1">多端口探测</p>
              <p className="text-[11px] text-zinc-500 leading-relaxed">后台自动尝试 80, 443, 22 等端口，提高在线识别准确率。</p>
            </div>
          </div>
          <div className="p-4 bg-white border border-zinc-200 rounded-2xl flex items-start gap-3">
            <div className="p-2 bg-zinc-50 rounded-lg text-zinc-400">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-zinc-900 mb-1">Cloudflare 部署</p>
              <p className="text-[11px] text-zinc-500 leading-relaxed">本工具支持部署至 Cloudflare Pages，结合 Workers 可实现全球分布式的 IP 优选探测。</p>
            </div>
          </div>
        </div>
      </main>

      <footer className="bg-white border-t border-zinc-200 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-zinc-400">
            <Shield className="w-4 h-4" />
            <span className="text-xs font-medium">云厂商 IP 探索器 &copy; 2026</span>
            {lastUpdate && (
              <span className="text-[10px] bg-zinc-100 px-2 py-0.5 rounded-full ml-2">
                数据更新于: {lastUpdate}
              </span>
            )}
          </div>
          <div className="flex items-center gap-6">
            <a href="https://github.com/disposable/cloud-ip-ranges" target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-zinc-500 hover:text-zinc-900 transition-colors">数据来源</a>
            <a href="#" className="text-xs font-medium text-zinc-500 hover:text-zinc-900 transition-colors">API 文档</a>
            <a href="#" className="text-xs font-medium text-zinc-500 hover:text-zinc-900 transition-colors">隐私政策</a>
          </div>
        </div>
      </footer>
    </div>
  );
}