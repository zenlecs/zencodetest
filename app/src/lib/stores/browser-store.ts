import { create } from 'zustand';

export interface BrowserTab {
  id: string;
  url: string;
  title: string;
  favicon: string;
  isLoading: boolean;
}

interface BrowserStore {
  tabs: BrowserTab[];
  activeTabId: string | null;
  torEnabled: boolean;
  history: { url: string; title: string; timestamp: number }[];
  bookmarks: { url: string; title: string; favicon: string }[];
  addTab: (url: string) => void;
  removeTab: (id: string) => void;
  setActiveTab: (id: string | null) => void;
  updateTab: (id: string, updates: Partial<BrowserTab>) => void;
  toggleTor: () => void;
  addToHistory: (url: string, title: string) => void;
  addBookmark: (url: string, title: string, favicon: string) => void;
  removeBookmark: (url: string) => void;
}

const generateId = () => Math.random().toString(36).substring(2, 9);

export const useBrowserStore = create<BrowserStore>((set) => ({
  tabs: [],
  activeTabId: null,
  torEnabled: false,
  history: [],
  bookmarks: [
    { url: 'https://duckduckgo.com', title: 'DuckDuckGo', favicon: 'https://duckduckgo.com/favicon.ico' },
    { url: 'https://github.com', title: 'GitHub', favicon: 'https://github.com/fluidicon.png' },
    { url: 'https://news.ycombinator.com', title: 'Hacker News', favicon: 'https://news.ycombinator.com/favicon.ico' },
  ],
  addTab: (url: string) =>
    set((state) => {
      const newTab = {
        id: generateId(),
        url,
        title: 'Yeni Sekme',
        favicon: '',
        isLoading: true,
      };
      return {
        tabs: [...state.tabs, newTab],
        activeTabId: newTab.id,
      };
    }),
  removeTab: (id) =>
    set((state) => {
      const newTabs = state.tabs.filter((t) => t.id !== id);
      return {
        tabs: newTabs,
        activeTabId: state.activeTabId === id ? (newTabs[newTabs.length - 1]?.id || null) : state.activeTabId,
      };
    }),
  setActiveTab: (id) => set({ activeTabId: id }),
  updateTab: (id, updates) =>
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),
  toggleTor: () => set((state) => ({ torEnabled: !state.torEnabled })),
  addToHistory: (url, title) =>
    set((state) => ({
      history: [{ url, title, timestamp: Date.now() }, ...state.history].slice(0, 100),
    })),
  addBookmark: (url, title, favicon) =>
    set((state) => ({
      bookmarks: [...state.bookmarks, { url, title, favicon }],
    })),
  removeBookmark: (url) =>
    set((state) => ({
      bookmarks: state.bookmarks.filter((b) => b.url !== url),
    })),
}));
