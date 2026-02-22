export interface InterfaceSource {
  id: string;
  name: string;
  url: string;
  author?: string;
  description?: string;
  tags: string[];
  lastChecked?: string;
  status?: 'online' | 'offline' | 'unknown';
}

export interface AggregatedConfig {
  sites: any[];
  lives?: any[];
  parses?: any[];
  flags?: string[];
  wallpaper?: string;
}
