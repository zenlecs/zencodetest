import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useBrowserStore } from '@/lib/stores/browser-store';
import { Search, Shield, ShieldOff, Star, ArrowLeft, ArrowRight, RotateCw, Plus, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
function NativeSearchTab({ url, tabId, onResultClick }: { url: string, tabId: string, onResultClick: (url: string) => void }) {
  const [results, setResults] = useState<{title: string, url: string, snippet: string, isMock?: boolean}[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const initialQuery = new URL(url.replace('zenium://', 'http://')).searchParams.get('q') || '';
  const [localQuery, setLocalQuery] = useState(initialQuery);
  const [currentPage, setCurrentPage] = useState(1);
  const { updateTab } = useBrowserStore();

  useEffect(() => {
    const fetchResults = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(initialQuery)}&page=${currentPage}`);
        const data = await res.json();
        if (data.results) {
          setResults(data.results);
        }
      } catch (e) {
        console.error("Search failed", e);
      } finally {
        setIsLoading(false);
      }
    };
    if (initialQuery) fetchResults();
  }, [initialQuery, currentPage]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!localQuery.trim()) return;
    updateTab(tabId, { url: `zenium://search?q=${encodeURIComponent(localQuery)}` });
  };

  return (
    <div className="w-full h-full bg-background overflow-y-auto custom-scrollbar pt-12 pb-32 px-12">
      <div className="max-w-6xl mx-auto">
        <form onSubmit={handleSearchSubmit} className="mb-12">
          <div className="flex items-center bg-transparent border-b border-white/10 px-2 py-4 transition-all duration-300 focus-within:border-primary/50">
            <Search className="w-8 h-8 text-primary mr-4 flex-shrink-0" />
            <input
              type="text"
              value={localQuery}
              onChange={(e) => setLocalQuery(e.target.value)}
              className="flex-1 bg-transparent border-none outline-none text-foreground text-3xl font-['Montserrat'] font-normal leading-normal h-12 placeholder:text-muted-foreground/40 placeholder:font-normal"
              placeholder="Dive deep with Zenium..."
            />
            <button 
              type="submit" 
              className="flex items-center justify-center text-muted-foreground/60 transition-colors flex-shrink-0 ml-4 outline-none"
            >
              <ArrowRight className="w-6 h-6" />
            </button>
          </div>
        </form>

        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="w-12 h-12 text-primary animate-spin opacity-50" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {results.length === 0 ? (
              <div className="text-center text-muted-foreground py-20 bg-card/20 rounded-2xl border border-white/5">
                Sonuç bulunamadı.
              </div>
            ) : (
              results.map((res, i) => (
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  key={i}
                  onClick={() => onResultClick(res.url)}
                  className="group flex flex-col text-left bg-transparent p-6 rounded-2xl transition-all duration-300 hover:bg-card/20 hover:-translate-y-1"
                >
                  <div className="text-primary/80 text-sm font-medium mb-1.5 group-hover:text-primary transition-colors truncate max-w-full">
                    {res.url}
                  </div>
                  <h3 className="text-2xl font-semibold text-card-foreground group-hover:text-primary mb-2.5">
                    {res.isMock ? "örnek · " : ""}{res.title}
                  </h3>
                  <p className="text-muted-foreground text-base line-clamp-2 leading-relaxed">
                    {res.snippet}
                  </p>
                </motion.button>
              ))
            )}
          </div>
        )}

        {/* Pagination */}
        {!isLoading && results.length > 0 && (
          <div className="flex justify-center items-center gap-2 mt-16 mb-8">
            <button 
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="w-12 h-12 flex items-center justify-center rounded-full bg-card hover:bg-card/80 border border-border disabled:opacity-50 disabled:pointer-events-none transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </button>
            {[1, 2, 3, 4, 5].map(p => (
              <button
                key={p}
                onClick={() => setCurrentPage(p)}
                className={cn(
                  "w-12 h-12 flex items-center justify-center rounded-full text-base font-medium transition-colors border",
                  currentPage === p 
                    ? "bg-primary text-primary-foreground border-primary" 
                    : "bg-card hover:bg-card/80 border-border text-foreground hover:border-primary/50"
                )}
              >
                {p}
              </button>
            ))}
            <button 
              onClick={() => setCurrentPage(p => p + 1)}
              className="w-12 h-12 flex items-center justify-center rounded-full bg-card hover:bg-card/80 border border-border transition-colors hover:border-primary/50"
            >
              <ArrowRight className="w-5 h-5 text-foreground" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function BrowserPage() {
  const { tabs, activeTabId, torEnabled, bookmarks, addTab, updateTab, toggleTor, addBookmark, removeBookmark } = useBrowserStore();
  const [urlInput, setUrlInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const webviewRefs = useRef<Record<string, any>>({});

  const activeTab = tabs.find(t => t.id === activeTabId);

  // Sync url input with active tab
  useEffect(() => {
    if (activeTab && !isFocused) {
      setUrlInput(activeTab.url);
    }
  }, [activeTab, isFocused]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTabId) {
      addTab(urlInput);
      return;
    }
    
    let targetUrl = urlInput;
    if (!urlInput.startsWith('http://') && !urlInput.startsWith('https://')) {
      if (urlInput.includes('.') && !urlInput.includes(' ')) {
        targetUrl = 'https://' + urlInput;
      } else {
        targetUrl = 'zenium://search?q=' + encodeURIComponent(urlInput);
      }
    }
    
    updateTab(activeTabId, { url: targetUrl });
    const wv = webviewRefs.current[activeTabId];
    if (wv) wv.loadURL(targetUrl);
    setIsFocused(false);
  };

  const handleWebviewDidFinishLoad = (id: string, e: any) => {
    const wv = webviewRefs.current[id];
    if (wv) {
      updateTab(id, {
        title: wv.getTitle(),
        url: wv.getURL(),
        isLoading: false,
      });
    }
  };

  const handleWebviewDidStartLoad = (id: string) => {
    updateTab(id, { isLoading: true });
  };

  const handleWebviewPageFaviconUpdated = (id: string, e: any) => {
    if (e.favicons && e.favicons.length > 0) {
      updateTab(id, { favicon: e.favicons[0] });
    }
  };

  const goBack = () => {
    if (activeTabId && webviewRefs.current[activeTabId]) {
      webviewRefs.current[activeTabId].goBack();
    }
  };

  const goForward = () => {
    if (activeTabId && webviewRefs.current[activeTabId]) {
      webviewRefs.current[activeTabId].goForward();
    }
  };

  const reload = () => {
    if (activeTabId && webviewRefs.current[activeTabId]) {
      webviewRefs.current[activeTabId].reload();
    }
  };

  const isBookmarked = activeTab ? bookmarks.some(b => b.url === activeTab.url) : false;

  const toggleBookmark = () => {
    if (!activeTab) return;
    if (isBookmarked) {
      removeBookmark(activeTab.url);
    } else {
      addBookmark(activeTab.url, activeTab.title, activeTab.favicon);
    }
  };

  const handleHomeSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;

    let targetUrl = urlInput;
    if (!urlInput.startsWith('http://') && !urlInput.startsWith('https://')) {
      if (urlInput.includes('.') && !urlInput.includes(' ')) {
        targetUrl = 'https://' + urlInput;
      } else {
        targetUrl = 'zenium://search?q=' + encodeURIComponent(urlInput);
      }
    }
    
    addTab(targetUrl);
    setUrlInput('');
  };

  if (!activeTabId) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-8 pb-[35vh] relative overflow-hidden bg-background/50">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center z-10 w-full max-w-2xl"
        >
          <div 
            className="w-80 max-w-full mx-auto mb-6 flex items-center justify-center relative"
          >
            <img 
              src="/ZeniumDark.svg" 
              alt="Zenium Logo" 
              className="hidden dark:block w-full h-auto drop-shadow-[0_0_30px_rgba(var(--primary),0.2)]" 
              style={{ WebkitMaskImage: 'linear-gradient(to top, transparent 0%, black 80%)', maskImage: 'linear-gradient(to top, transparent 0%, black 80%)' }}
            />
            <img 
              src="/ZeniumLight.svg" 
              alt="Zenium Logo" 
              className="block dark:hidden w-full h-auto drop-shadow-[0_0_30px_rgba(var(--primary),0.2)]" 
              style={{ WebkitMaskImage: 'linear-gradient(to top, transparent 0%, black 80%)', maskImage: 'linear-gradient(to top, transparent 0%, black 80%)' }}
            />
          </div>
          
          <form onSubmit={handleHomeSearch} className="relative group w-full max-w-xl mx-auto">
            <div className={cn(
              "absolute inset-0 bg-gradient-to-r from-primary/30 via-transparent to-primary/30 rounded-full blur-xl transition-opacity duration-500",
              isFocused ? "opacity-100" : "opacity-0"
            )} />
            <div className="relative flex items-center bg-background/60 hover:bg-background/80 backdrop-blur-2xl border border-white/20 rounded-full px-6 py-4 transition-all duration-300 shadow-2xl overflow-hidden focus-within:border-primary/50">
              <Search className={cn("w-6 h-6 mr-4 transition-colors duration-300 flex-shrink-0", isFocused ? "text-primary" : "text-muted-foreground")} />
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                className="flex-1 bg-transparent border-none outline-none text-foreground text-xl font-['Montserrat'] font-normal leading-normal h-8 placeholder:text-muted-foreground/60 placeholder:font-normal"
                placeholder="Dive deep with Zenium..."
                autoFocus
              />
              <button 
                type="submit" 
                className="flex items-center justify-center text-muted-foreground/60 transition-colors flex-shrink-0 ml-4 outline-none"
              >
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col relative bg-transparent">
      {/* Floating Glassmorphic Header - Hidden on Search Results */}
      {!(activeTab?.url.startsWith('zenium://search')) && (
        <motion.div 
          initial={{ y: -100 }}
          animate={{ y: 0 }}
          className="absolute top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-4xl flex items-center gap-3 px-4"
        >
        {/* Navigation Controls */}
        <div className="flex items-center gap-1 bg-background/40 backdrop-blur-2xl p-1.5 rounded-full border border-white/10 shadow-2xl">
          <Button variant="ghost" size="icon" onClick={goBack} className="rounded-full w-10 h-10 hover:bg-white/10">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={goForward} className="rounded-full w-10 h-10 hover:bg-white/10">
            <ArrowRight className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={reload} className="rounded-full w-10 h-10 hover:bg-white/10">
            <RotateCw className={cn("w-4 h-4", activeTab?.isLoading && "animate-spin")} />
          </Button>
        </div>

        {/* Floating Omnibox */}
        <form 
          onSubmit={handleSearch} 
          className="flex-1 relative group"
        >
          <div className={cn(
            "absolute inset-0 bg-gradient-to-r from-primary/20 via-transparent to-primary/20 rounded-full blur-xl transition-opacity duration-500",
            isFocused ? "opacity-100" : "opacity-0"
          )} />
          <div className="relative flex items-center bg-background/40 hover:bg-background/60 backdrop-blur-2xl border border-white/10 rounded-full px-4 py-3 transition-all duration-300 shadow-2xl overflow-hidden">
            <Search className={cn("w-5 h-5 mr-3 transition-colors duration-300", isFocused ? "text-primary" : "text-muted-foreground")} />
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              className="flex-1 bg-transparent border-none outline-none text-foreground text-lg placeholder:text-muted-foreground/50"
              placeholder="DuckDuckGo'da ara veya URL girin..."
            />
            
            {activeTab && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={toggleBookmark}
                className="w-8 h-8 rounded-full hover:bg-white/10 ml-2"
              >
                <Star className={cn("w-4 h-4", isBookmarked ? "fill-yellow-500 text-yellow-500" : "text-muted-foreground")} />
              </Button>
            )}
          </div>
        </form>

        {/* Tor VPN Toggle */}
        <div className="bg-background/40 backdrop-blur-2xl p-1.5 rounded-full border border-white/10 shadow-2xl">
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={toggleTor}
                  className={cn(
                    "rounded-full w-12 h-12 transition-all duration-500 relative",
                    torEnabled ? "bg-purple-500/20 hover:bg-purple-500/30 text-purple-400" : "hover:bg-white/10 text-muted-foreground"
                  )}
                >
                  {torEnabled && (
                    <motion.div 
                      layoutId="vpn-glow"
                      className="absolute inset-0 rounded-full bg-purple-500/30 blur-md animate-pulse"
                    />
                  )}
                  {torEnabled ? <Shield className="w-5 h-5 relative z-10" /> : <ShieldOff className="w-5 h-5 relative z-10" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={10}>
                {torEnabled ? 'Tor Ağı (VPN) Aktif' : 'Tor Ağı (VPN) Kapalı'}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </motion.div>
      )}

      {/* Floating Bookmarks */}
      {bookmarks.length > 0 && activeTab?.url.includes('duckduckgo.com') && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute top-28 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 bg-background/30 backdrop-blur-xl px-6 py-3 rounded-full border border-white/5"
        >
          {bookmarks.map((bookmark) => (
            <button
              key={bookmark.url}
              onClick={() => {
                updateTab(activeTab.id, { url: bookmark.url });
                webviewRefs.current[activeTab.id]?.loadURL(bookmark.url);
              }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-white/10 transition-colors group"
            >
              {bookmark.favicon ? (
                <img src={bookmark.favicon} className="w-4 h-4 rounded-sm object-contain" alt="" />
              ) : (
                <div className="w-4 h-4 bg-primary/20 rounded-sm flex items-center justify-center">
                  <Star className="w-2.5 h-2.5 text-primary" />
                </div>
              )}
              <span className="text-sm font-medium text-foreground/80 group-hover:text-foreground transition-colors">
                {bookmark.title}
              </span>
            </button>
          ))}
        </motion.div>
      )}

      {/* Webview Pool */}
      <div className="flex-1 w-full h-full pt-20">
        {tabs.map((tab) => (
          <div 
            key={tab.id}
            className={cn(
              "w-full h-full rounded-2xl overflow-hidden shadow-2xl transition-all duration-500",
              tab.url.startsWith('zenium://search') ? 'bg-background' : 'bg-white',
              activeTabId === tab.id ? "opacity-100 scale-100 relative z-10" : "opacity-0 scale-95 absolute inset-0 pointer-events-none -z-10"
            )}
          >
            {tab.url.startsWith('zenium://search') ? (
              <NativeSearchTab 
                url={tab.url} 
                tabId={tab.id} 
                onResultClick={(clickedUrl) => updateTab(tab.id, { url: clickedUrl, title: 'Yükleniyor...' })} 
              />
            ) : (
              
              <webview
                ref={(el: any) => {
                  if (el) {
                    webviewRefs.current[tab.id] = el;
                    
                    // Clean up previous listeners if any to avoid duplicates
                    el.removeEventListener('did-finish-load', () => handleWebviewDidFinishLoad(tab.id, null));
                    el.removeEventListener('did-start-loading', () => handleWebviewDidStartLoad(tab.id));
                    el.removeEventListener('page-favicon-updated', (e: any) => handleWebviewPageFaviconUpdated(tab.id, e));
                    
                    el.addEventListener('did-finish-load', (e: any) => handleWebviewDidFinishLoad(tab.id, e));
                    el.addEventListener('did-start-loading', () => handleWebviewDidStartLoad(tab.id));
                    el.addEventListener('page-favicon-updated', (e: any) => handleWebviewPageFaviconUpdated(tab.id, e));
                  }
                }}
                src={tab.url}
                className="w-full h-full border-none bg-white"
                allowpopups={true}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Globe2(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </svg>
  );
}
