import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import {
  Wallet,
  Presentation,
  MessageSquare,
  Calculator,
  Briefcase,
  Users,
  Clock,
  TrendingUp,
  Shield,
  Calendar,
  Zap,
  Newspaper,
  Plus,
  FileText,
  Settings,
  Bell,
  Search,
  FolderOpen,
  Scale,
  Gavel,
  GripVertical,
} from "lucide-react";
import { motion, useMotionValue, useTransform, animate } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Spin1 } from "@/components/spin1";
import { AppTile } from "@/components/ui/app-tile";
import { BentoCard } from "@/components/ui/bento-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDashboardStats, useContacts, useWallets, useCases, useDocuments } from "@/hooks/use-api";
import { useLocation } from "wouter";

const availableApps = [
  { id: "wallet", title: "ZenWallet", description: "Fiat ve kripto cüzdanlar", icon: Wallet, href: "/os/wallet", color: "bg-gradient-to-br from-emerald-500 to-emerald-600", category: "Finans" },
  { id: "presentations", title: "Sunumlar", description: "PPTX ve PDF sunum hazırlama", icon: Presentation, href: "/os/presentations", color: "bg-gradient-to-br from-blue-500 to-blue-600", category: "Üretkenlik" },
  { id: "communications", title: "İletişim", description: "Güvenli mesajlaşma ve görüntülü görüşme", icon: MessageSquare, href: "/os/communications", color: "bg-gradient-to-br from-violet-500 to-violet-600", category: "İletişim" },
  { id: "accounting", title: "Muhasebe", description: "Finansal yönetim ve raporlama", icon: Calculator, href: "/os/accounting", color: "bg-gradient-to-br from-amber-500 to-amber-600", category: "Finans" },
  { id: "studio", title: "Studio NeoGraph", description: "Universal Legal Graph & Infinite Canvas", icon: Briefcase, href: "/os/studio", color: "bg-gradient-to-br from-indigo-500 to-cyan-600", category: "Hukuk" },
  { id: "cases", title: "Davalar", description: "Dava dosyaları ve takip", icon: Briefcase, href: "/os/studio", color: "bg-gradient-to-br from-indigo-500 to-indigo-600", category: "Hukuk" },
  { id: "documents", title: "Belgeler", description: "Belge yönetimi ve arşiv", icon: FileText, href: "/os/documents", color: "bg-gradient-to-br from-cyan-500 to-cyan-600", category: "Üretkenlik" },
  { id: "clients", title: "Müvekkiller", description: "Müvekkil bilgileri ve iletişim", icon: Users, href: "/os/clients", color: "bg-gradient-to-br from-pink-500 to-pink-600", category: "İletişim" },
  { id: "calendar", title: "Takvim", description: "Duruşma ve randevu takibi", icon: Calendar, href: "/os/calendar", color: "bg-gradient-to-br from-orange-500 to-orange-600", category: "Üretkenlik" },
  { id: "notifications", title: "Bildirimler", description: "Sistem bildirimleri ve uyarılar", icon: Bell, href: "/os/notifications", color: "bg-gradient-to-br from-red-500 to-red-600", category: "Sistem" },
  { id: "settings", title: "Ayarlar", description: "Sistem ve hesap ayarları", icon: Settings, href: "/os/settings", color: "bg-gradient-to-br from-gray-500 to-gray-600", category: "Sistem" },
  { id: "search", title: "Arama", description: "Gelişmiş arama ve filtreleme", icon: Search, href: "/os/search", color: "bg-gradient-to-br from-teal-500 to-teal-600", category: "Sistem" },
  { id: "archive", title: "Arşiv", description: "Geçmiş dosya ve belgeler", icon: FolderOpen, href: "/os/archive", color: "bg-gradient-to-br from-stone-500 to-stone-600", category: "Üretkenlik" },
  { id: "laws", title: "Mevzuat", description: "Kanun ve yönetmelikler", icon: Scale, href: "/os/laws", color: "bg-gradient-to-br from-purple-500 to-purple-600", category: "Hukuk" },
  { id: "courtdates", title: "Duruşmalar", description: "Duruşma takvimleri", icon: Gavel, href: "/os/courtdates", color: "bg-gradient-to-br from-rose-500 to-rose-600", category: "Hukuk" },
];

const currencyPairs = [
  { id: 1, pair1: { symbol: "USD/TRY", value: "32.50", change: "+0.12%", positive: true }, pair2: { symbol: "EUR/TRY", value: "35.20", change: "-0.08%", positive: false } },
  { id: 2, pair1: { symbol: "GBP/TRY", value: "41.15", change: "+0.05%", positive: true }, pair2: { symbol: "CHF/TRY", value: "36.80", change: "+0.18%", positive: true } },
  { id: 3, pair1: { symbol: "BTC/USD", value: "67,450", change: "+2.34%", positive: true }, pair2: { symbol: "ETH/USD", value: "3,520", change: "+1.87%", positive: true } },
  { id: 4, pair1: { symbol: "XRP/USD", value: "0.524", change: "-0.45%", positive: false }, pair2: { symbol: "TRX/USD", value: "0.128", change: "+3.12%", positive: true } },
  { id: 5, pair1: { symbol: "SOL/USD", value: "145.80", change: "+4.56%", positive: true }, pair2: { symbol: "BNB/USD", value: "612.40", change: "+0.92%", positive: true } },
  { id: 6, pair1: { symbol: "ADA/USD", value: "0.458", change: "-1.23%", positive: false }, pair2: { symbol: "AVAX/USD", value: "38.90", change: "+2.78%", positive: true } },
];

const legalNewsItems = [
  { 
    id: 1,
    title: "ABD Yüksek Mahkemesi AI Telif Kararı", 
    summary: "Yapay zeka tarafından oluşturulan eserlerin telif hakkı koruması kapsamında olmadığına karar verildi.",
    source: "Reuters",
    url: "https://www.reuters.com"
  },
  { 
    id: 2,
    title: "AB Veri Koruma Yönetmeliği Güncellendi", 
    summary: "GDPR kapsamında yeni ceza miktarları ve şirket yükümlülükleri belirlendi.",
    source: "EU Law",
    url: "https://eur-lex.europa.eu"
  },
  { 
    id: 3,
    title: "Anayasa Mahkemesi Bireysel Başvuru Kararı", 
    summary: "Kişisel verilerin korunması hakkında emsal niteliğinde karar açıklandı.",
    source: "Resmi Gazete",
    url: "https://www.resmigazete.gov.tr"
  },
  { 
    id: 4,
    title: "İngiltere Tahkim Süreci Başladı", 
    summary: "Brexit sonrası ticaret anlaşmazlıklarında uluslararası tahkim mekanizması devreye girdi.",
    source: "BBC News",
    url: "https://www.bbc.com"
  },
  { 
    id: 5,
    title: "UCM Yeni Soruşturma Açtı", 
    summary: "Uluslararası Ceza Mahkemesi savaş suçları iddialarını incelemeye aldı.",
    source: "ICC",
    url: "https://www.icc-cpi.int"
  },
  { 
    id: 6,
    title: "Almanya Dijital Miras Hakları Genişledi", 
    summary: "Sosyal medya hesapları ve dijital varlıklar miras kapsamına alındı.",
    source: "DW",
    url: "https://www.dw.com"
  },
];

function NewsTickerVertical() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % legalNewsItems.length);
        setIsAnimating(false);
      }, 300);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const currentNews = legalNewsItems[currentIndex];

  return (
    <div className="news-ticker-bar" data-testid="news-feed-bar">
      <div className="news-ticker-icon">
        <Newspaper className="w-4 h-4" />
      </div>
      <div className="news-ticker-vertical-track">
        <a
          href={currentNews.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`news-ticker-vertical-item ${isAnimating ? "news-ticker-slide-out" : "news-ticker-slide-in"}`}
          data-testid={`news-item-${currentNews.id}`}
        >
          <div className="news-ticker-vertical-content">
            <span className="news-ticker-vertical-title">{currentNews.title}</span>
            <span className="news-ticker-vertical-separator">—</span>
            <span className="news-ticker-vertical-summary">{currentNews.summary}</span>
          </div>
        </a>
      </div>
    </div>
  );
}

function CurrencyRateSlider() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % currencyPairs.length);
        setIsAnimating(false);
      }, 300);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const currentPair = currencyPairs[currentIndex];

  return (
    <div className="currency-rate-bar" data-testid="currency-rate-bar">
      <div className="currency-rate-icon">
        <TrendingUp className="w-4 h-4" />
      </div>
      <div className="currency-rate-track">
        <div 
          className={`currency-rate-slide ${isAnimating ? "currency-slide-out" : "currency-slide-in"}`}
          data-testid={`currency-pair-${currentPair.id}`}
        >
          <div className="currency-rate-item">
            <span className="currency-rate-label">{currentPair.pair1.symbol}</span>
            <span className="currency-rate-value font-price">{currentPair.pair1.value}</span>
            <span className={`currency-rate-change ${currentPair.pair1.positive ? "positive" : "negative"}`}>
              {currentPair.pair1.change}
            </span>
          </div>
          <div className="currency-rate-divider" />
          <div className="currency-rate-item">
            <span className="currency-rate-label">{currentPair.pair2.symbol}</span>
            <span className="currency-rate-value font-price">{currentPair.pair2.value}</span>
            <span className={`currency-rate-change ${currentPair.pair2.positive ? "positive" : "negative"}`}>
              {currentPair.pair2.change}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

interface SortableAppTileProps {
  id: string;
  children: React.ReactNode;
}

function SortableAppTile({ id, children }: SortableAppTileProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      {children}
      <div
        {...attributes}
        {...listeners}
        className="absolute right-2 top-2 w-6 h-6 flex items-center justify-center cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity rounded-md"
        data-testid={`drag-handle-${id}`}
      >
        <GripVertical className="w-4 h-4 text-slate-500 dark:text-white/70" />
      </div>
    </div>
  );
}

const PULL_MAX = 52;
const PULL_TRIGGER = 34;
const PULL_SPRING = { type: "spring" as const, stiffness: 420, damping: 34, mass: 0.7 };

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: contacts } = useContacts();
  const { data: wallets } = useWallets();
  const { data: cases } = useCases();
  const { data: documents } = useDocuments();
  const queryClient = useQueryClient();

  // Pull-to-refresh state. Travel is capped so a long drag cannot keep tilting the page.
  const [isRefreshing, setIsRefreshing] = useState(false);
  const pullY = useMotionValue(0);

  const rotateX = useTransform(pullY, [0, PULL_MAX], [0, 3.5]);
  const scale = useTransform(pullY, [0, PULL_MAX], [1, 0.988]);
  const loaderY = useTransform(pullY, [0, PULL_MAX], [-16, 12]);
  const loaderOpacity = useTransform(pullY, [0, 16, PULL_MAX], [0, 1, 1]);

  useEffect(() => {
    const container = document.getElementById('dashboard-scroll-viewport');
    if (!container) return;

    let startY = 0;
    let isPulling = false;

    const onTouchStart = (e: TouchEvent) => {
      if (container.scrollTop <= 0) {
        startY = e.touches[0].clientY;
        isPulling = true;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isPulling || isRefreshing) return;
      const currentY = e.touches[0].clientY;
      const deltaY = currentY - startY;

      if (deltaY > 0 && container.scrollTop <= 0) {
        if (e.cancelable) e.preventDefault();
        pullY.set(Math.min(PULL_MAX, deltaY * 0.28));
      } else {
        isPulling = false;
      }
    };

    const triggerRefresh = async () => {
      setIsRefreshing(true);
      animate(pullY, PULL_MAX, PULL_SPRING);
      
      await queryClient.invalidateQueries();
      await new Promise(r => setTimeout(r, 1200)); // artificial delay to show off animation
      
      setIsRefreshing(false);
      animate(pullY, 0, PULL_SPRING);
    };

    const onTouchEnd = () => {
      if (!isPulling) return;
      isPulling = false;
      
      if (pullY.get() >= PULL_TRIGGER && !isRefreshing) {
        triggerRefresh();
      } else {
        animate(pullY, 0, PULL_SPRING);
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (container.scrollTop <= 0 && e.deltaY < 0 && !isRefreshing) {
        const newY = Math.min(PULL_MAX, pullY.get() - e.deltaY * 0.18);
        if (newY > 0) {
          if (e.cancelable) e.preventDefault();
          pullY.set(newY);
          
          clearTimeout((window as any).wheelTimeout);
          (window as any).wheelTimeout = setTimeout(() => {
            if (pullY.get() >= PULL_TRIGGER) {
              triggerRefresh();
            } else {
              animate(pullY, 0, PULL_SPRING);
            }
          }, 150);
        }
      }
    };

    container.addEventListener('touchstart', onTouchStart, { passive: false });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd);
    container.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
      container.removeEventListener('wheel', onWheel);
    };
  }, [isRefreshing, pullY, queryClient]);

  const { user } = useAuth();
  const fullName = user?.displayName || "Kullanıcı";
  const userName = fullName.split(' ')[0];
  const [showWelcome, setShowWelcome] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => setShowWelcome(true), 100);
    return () => clearTimeout(timer);
  }, []);
  
  const [currentSlide, setCurrentSlide] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [pinnedApps, setPinnedApps] = useState<string[]>(["wallet", "presentations", "accounting"]);
  const [isAddAppModalOpen, setIsAddAppModalOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setPinnedApps((items) => {
        const oldIndex = items.indexOf(active.id as string);
        const newIndex = items.indexOf(over.id as string);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleAddApp = (appId: string) => {
    if (!pinnedApps.includes(appId)) {
      setPinnedApps([...pinnedApps, appId]);
    }
    setIsAddAppModalOpen(false);
  };

  const unpinnedApps = availableApps.filter(app => !pinnedApps.includes(app.id));
  const pinnedAppsList = pinnedApps.map(id => availableApps.find(app => app.id === id)).filter(Boolean);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const slides = [
    { id: 1, title: "ZenFile: Gizlilik elimizde", subtitle: "Dosyalarınız güvende", hasPattern: true },
    { id: 2, title: "Slider İçeriği 2", subtitle: "İçerik daha sonra belirlenecek", hasPattern: false },
    { id: 3, title: "Slider İçeriği 3", subtitle: "İçerik daha sonra belirlenecek", hasPattern: false },
  ];

  const nextSlide = () => setCurrentSlide((prev) => (prev + 1) % slides.length);
  const prevSlide = () => setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);

  const onlineContacts = contacts?.filter((c) => c.status === "online" || c.status === "away").slice(0, 3) || [];
  
  const totalFiat = wallets?.filter((w) => w.type === "fiat").reduce((acc, w) => {
    if (w.currency === "TRY") return acc + w.balance;
    if (w.currency === "USD") return acc + w.balance * 32.5;
    if (w.currency === "EUR") return acc + w.balance * 35.2;
    return acc;
  }, 0) || 0;

  const totalCrypto = wallets?.filter((w) => w.type === "crypto").reduce((acc, w) => {
    if (w.currency === "BTC") return acc + w.balance * 42500;
    if (w.currency === "ETH") return acc + w.balance * 2000;
    if (w.currency === "USDT") return acc + w.balance;
    return acc;
  }, 0) || 0;

  const recentActivities: { id: string; action: string; target: string; time: string; type: string }[] = [];

  const upcomingEvents: { id: string; title: string; time: string; date: string }[] = [
  ];

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  };

  return (
    <div className="w-full h-full relative" style={{ perspective: "1400px" }}>
      <motion.div
        className="absolute left-7 top-3 z-50 pointer-events-none"
        style={{ y: loaderY, opacity: loaderOpacity }}
      >
        <Spin1 />
      </motion.div>

      <motion.div
        style={{
          rotateX,
          scale,
          y: pullY,
          transformOrigin: "top center",
          height: "100%",
          width: "100%",
          willChange: "transform",
          backgroundColor: "var(--background)",
          overflow: "hidden"
        }}
      >
        <ScrollArea viewportProps={{ id: 'dashboard-scroll-viewport' }} className="h-full">
          <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-col gap-1">
          <h1 
            className={`text-3xl tracking-tight transition-all duration-700 ease-out ${
              showWelcome 
                ? 'opacity-100 translate-y-0' 
                : 'opacity-0 translate-y-4'
            }`} 
            style={{ fontFamily: 'Montserrat, sans-serif' }} 
            data-testid="text-welcome"
          >
            <span style={{ fontWeight: 400 }}>Hoş Geldin </span>
            <span style={{ fontWeight: 200 }}>{userName}</span>
          </h1>
        </div>

        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 lg:col-span-8 row-span-2 relative" style={{ minHeight: '280px' }}>
            {/* Liquid Glass Center Stroke */}
            <div 
              className={`absolute inset-[-1px] pointer-events-none rounded-[16px] z-20`}
              style={{ 
                padding: '2px',
                WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                WebkitMaskComposite: 'xor',
                mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                maskComposite: 'exclude',
              }}
            >
              <div 
                className="absolute inset-0 overflow-hidden rounded-[16px] bg-black/5 dark:bg-white/10 backdrop-blur-xl"
                style={{
                  WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 20px, transparent 120px)',
                  maskImage: 'linear-gradient(to bottom, black 0%, black 20px, transparent 120px)'
                }}
              >
                {/* Fire Edge Glow (Blue from Search) */}
                <div 
                  className="absolute inset-0 pointer-events-none mix-blend-screen"
                  style={{ 
                    opacity: 'var(--fire-active, 0)',
                    background: 'radial-gradient(800px 300px at 75% 0px, rgba(37,99,235,0.7) 0%, rgba(56,189,248,0.3) 45%, transparent 80%)' 
                  }} 
                />
                {/* Fire Edge Glow (Red from Notification) */}
                <div 
                  className="absolute inset-0 pointer-events-none mix-blend-screen"
                  style={{ 
                    opacity: 'var(--fire-active-red, 0)',
                    background: 'radial-gradient(600px 300px at 135% 0px, rgba(220,38,38,0.7) 0%, rgba(249,115,22,0.3) 45%, transparent 80%)' 
                  }} 
                />
              </div>
            </div>
            <Card 
              className="w-full h-full relative overflow-hidden border-slate-200/50 dark:border-white/5 bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 dark:from-[#0a0a0c] dark:via-[#0d1117] dark:to-[#0a0a0c] shadow-lg z-10"
              data-testid="slider-container"
            >
            {slides[currentSlide].hasPattern ? (
              <div className="absolute inset-0 transition-all duration-700 ease-in-out">
                <div className="zenfile-pattern" />
                <div className="absolute inset-0 flex items-center justify-center z-10">
                  <div className="text-center space-y-2">
                    <h2 className="text-2xl font-semibold text-white drop-shadow-lg" style={{ fontFamily: 'Montserrat, sans-serif' }}>
                      {slides[currentSlide].title}
                    </h2>
                    <p className="text-white/80 text-sm" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 300 }}>
                      {slides[currentSlide].subtitle}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center transition-all duration-700 ease-in-out bg-gradient-to-br from-primary/5 to-primary/10">
                <div className="text-center space-y-2">
                  <h2 className="text-2xl font-medium text-foreground/80">{slides[currentSlide].title}</h2>
                  <p className="text-muted-foreground">{slides[currentSlide].subtitle}</p>
                </div>
              </div>
            )}
            
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
              {slides.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentSlide(index)}
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    index === currentSlide ? "bg-primary w-6" : "bg-muted-foreground/30"
                  }`}
                  data-testid={`button-slider-dot-${index}`}
                />
              ))}
            </div>
          </Card>
          </div>

          <div className="col-span-12 lg:col-span-4 row-span-2 relative" style={{ minHeight: '280px' }}>
            {/* Liquid Glass Center Stroke */}
            <div 
              className={`absolute inset-[-1px] pointer-events-none rounded-[16px] z-20`}
              style={{ 
                padding: '2px',
                WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                WebkitMaskComposite: 'xor',
                mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                maskComposite: 'exclude',
              }}
            >
              <div 
                className="absolute inset-0 overflow-hidden rounded-[16px] bg-black/5 dark:bg-white/10 backdrop-blur-xl"
                style={{
                  WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 20px, transparent 120px)',
                  maskImage: 'linear-gradient(to bottom, black 0%, black 20px, transparent 120px)'
                }}
              >
                {/* Fire Edge Glow (Blue from Search) */}
                <div 
                  className="absolute inset-0 pointer-events-none mix-blend-screen"
                  style={{ 
                    opacity: 'var(--fire-active, 0)',
                    background: 'radial-gradient(800px 300px at -50% 0px, rgba(37,99,235,0.7) 0%, rgba(56,189,248,0.3) 45%, transparent 80%)' 
                  }} 
                />
                {/* Fire Edge Glow (Red from Notification) */}
                <div 
                  className="absolute inset-0 pointer-events-none mix-blend-screen"
                  style={{ 
                    opacity: 'var(--fire-active-red, 0)',
                    background: 'radial-gradient(600px 300px at 55% 0px, rgba(220,38,38,0.7) 0%, rgba(249,115,22,0.3) 45%, transparent 80%)' 
                  }} 
                />
              </div>
            </div>
            <Card 
              className="w-full h-full p-0 border-slate-200/50 dark:border-white/5 overflow-hidden shadow-lg relative z-10"
              data-testid="widget-weather-landscape"
            >
            <div className="weather-landscape-card rainy">
              <section className="landscape-section">
                <div className="sky" />
                <div className="sun" />
                <div className="clouds">
                  <div className="cloud cloud-1" />
                  <div className="cloud cloud-2" />
                  <div className="cloud cloud-3" />
                </div>
                <div className="rain-container">
                  <div className="rain-drop" />
                  <div className="rain-drop" />
                  <div className="rain-drop" />
                  <div className="rain-drop" />
                  <div className="rain-drop" />
                </div>
                <div className="hill-1" />
                <div className="hill-2" />
                <div className="ocean">
                  <div className="reflection" />
                  <div className="reflection" />
                  <div className="reflection" />
                  <div className="reflection" />
                  <div className="reflection" />
                  <div className="shadow-hill-1" />
                  <div className="shadow-hill-2" />
                </div>
                <div className="hill-3" />
                <div className="hill-4" />
                <div className="tree-1">
                  <svg strokeWidth="0.00064" stroke="#b77873" fill="#b77873" xmlSpace="preserve" viewBox="0 0 64.00 64.00" xmlns="http://www.w3.org/2000/svg">
                    <path d="M32,0C18.148,0,12,23.188,12,32c0,9.656,6.883,17.734,16,19.594V60c0,2.211,1.789,4,4,4s4-1.789,4-4v-8.406 C45.117,49.734,52,41.656,52,32C52,22.891,46.051,0,32,0z" fill="#b77873" />
                  </svg>
                </div>
                <div className="tree-2">
                  <svg strokeWidth="0.00064" stroke="#b77873" fill="#b77873" xmlSpace="preserve" viewBox="0 0 64.00 64.00" xmlns="http://www.w3.org/2000/svg">
                    <path d="M32,0C18.148,0,12,23.188,12,32c0,9.656,6.883,17.734,16,19.594V60c0,2.211,1.789,4,4,4s4-1.789,4-4v-8.406 C45.117,49.734,52,41.656,52,32C52,22.891,46.051,0,32,0z" fill="#b77873" />
                  </svg>
                </div>
                <div className="tree-3">
                  <svg viewBox="0 0 64.00 64.00" xmlns="http://www.w3.org/2000/svg" fill="#a16773" stroke="#a16773" strokeWidth="0.00064">
                    <path fill="#a16773" d="M32,0C18.148,0,12,23.188,12,32c0,9.656,6.883,17.734,16,19.594V60c0,2.211,1.789,4,4,4s4-1.789,4-4v-8.406 C45.117,49.734,52,41.656,52,32C52,22.891,46.051,0,32,0z" />
                  </svg>
                </div>
                <div className="landscape-filter" />
              </section>
              <div className="weather-info-overlay">
                <div className="weather-left-side">
                  <div className="weather-icon">
                    <svg stroke="#ffffff" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeWidth="1.5" stroke="#ffffff" d="M20 15.8C20 18.1196 18.0899 20 15.7333 20H8.8C5.7072 20 3.2 17.5316 3.2 14.4857C3.2 11.9618 4.9432 9.84714 7.3172 9.23714C7.4532 6.29029 9.8956 4 12.8667 4C15.7476 4 18.1333 6.15714 18.4 9.00857" />
                      <path strokeLinecap="round" strokeWidth="1.5" stroke="#ffffff" d="M8 15L7 18M12 15L11 18M16 15L15 18" />
                    </svg>
                  </div>
                  <p style={{ fontFamily: 'Montserrat, sans-serif' }}>Yağmurlu</p>
                </div>
                <div className="weather-right-side">
                  <div className="weather-location">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14px" height="14px" viewBox="0 0 64 64" fill="#ffffff">
                      <path fill="#ffffff" d="M32,0C18.746,0,8,10.746,8,24c0,5.219,1.711,10.008,4.555,13.93c0.051,0.094,0.059,0.199,0.117,0.289l16,24 C29.414,63.332,30.664,64,32,64s2.586-0.668,3.328-1.781l16-24c0.059-0.09,0.066-0.195,0.117-0.289C54.289,34.008,56,29.219,56,24 C56,10.746,45.254,0,32,0z M32,32c-4.418,0-8-3.582-8-8s3.582-8,8-8s8,3.582,8,8S36.418,32,32,32z" />
                    </svg>
                    <span style={{ fontFamily: 'Montserrat, sans-serif' }}>İstanbul</span>
                  </div>
                  <p className="weather-date" style={{ fontFamily: 'Montserrat, sans-serif' }}>
                    {currentTime.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" })}
                  </p>
                  <p className="weather-temperature" style={{ fontFamily: 'Montserrat, sans-serif' }}>16°C</p>
                </div>
              </div>
              <section className="weather-content-section">
                <div className="weather-forecast">
                  <div>
                    <p style={{ fontFamily: 'Montserrat, sans-serif' }}>
                      {new Date(currentTime.getTime() + 86400000).toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" })}
                    </p>
                    <p style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 600 }}>22°C</p>
                  </div>
                  <div className="weather-separator" />
                  <div>
                    <p style={{ fontFamily: 'Montserrat, sans-serif' }}>
                      {new Date(currentTime.getTime() + 172800000).toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" })}
                    </p>
                    <p style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 600 }}>26°C</p>
                  </div>
                  <div className="weather-separator" />
                  <div>
                    <p style={{ fontFamily: 'Montserrat, sans-serif' }}>
                      {new Date(currentTime.getTime() + 259200000).toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" })}
                    </p>
                    <p style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 600 }}>20°C</p>
                  </div>
                </div>
              </section>
            </div>
          </Card>
          </div>

          <div className="col-span-12 lg:col-span-8">
            <NewsTickerVertical />
          </div>

          <div className="col-span-12 lg:col-span-4">
            <CurrencyRateSlider />
          </div>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={pinnedApps} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
              {pinnedAppsList.map((app) => {
                if (!app) return null;
                const IconComponent = app.icon;
                const getStats = () => {
                  if (app.id === "wallet") {
                    return [
                      { label: "Toplam", value: `₺${totalFiat.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}` },
                      { label: "Kripto", value: `$${totalCrypto.toLocaleString("en-US", { maximumFractionDigits: 0 })}` },
                    ];
                  }
                  if (app.id === "accounting") {
                    return [
                      { label: "Bu Ay", value: `₺${(stats?.monthlyIncome ?? 0).toLocaleString("tr-TR")}` },
                      { label: "Gider", value: "₺12,800" },
                    ];
                  }
                  if (app.id === "presentations") {
                    return [{ label: "Toplam", value: 4 }, { label: "PPTX", value: 2 }];
                  }
                  if (app.id === "communications") {
                    return [
                      { label: "Çevrimiçi", value: onlineContacts.length },
                      { label: "Kişiler", value: contacts?.length || 0 },
                    ];
                  }
                  if (app.id === "cases") {
                    return [{ label: "Aktif", value: cases?.length || 0 }];
                  }
                  if (app.id === "documents") {
                    return [{ label: "Toplam", value: documents?.length || 0 }];
                  }
                  return [];
                };
                return (
                  <SortableAppTile key={app.id} id={app.id}>
                    <AppTile
                      title={app.title}
                      description={app.description}
                      icon={<IconComponent className="w-6 h-6" />}
                      href={app.href}
                      color={app.color}
                      size="medium"
                      stats={getStats()}
                      data-testid={`app-tile-${app.id}`}
                    />
                  </SortableAppTile>
                );
              })}
              
              <Card
                className="relative flex flex-col items-center justify-center p-4 border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30 transition-all cursor-pointer min-h-[140px]"
                onClick={() => setIsAddAppModalOpen(true)}
                data-testid="app-tile-add"
              >
                <div className="w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center mb-2">
                  <Plus className="w-6 h-6 text-muted-foreground" />
                </div>
                <span className="text-sm text-muted-foreground font-medium">Uygulama Ekle</span>
              </Card>
            </div>
          </SortableContext>
        </DndContext>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <BentoCard
            title="Son Aktiviteler"
            icon={<Clock className="w-4 h-4" />}
            span="col-2"
            data-testid="card-recent-activities"
          >
            <div className="space-y-2">
              {recentActivities.length > 0 ? (
                recentActivities.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                    data-testid={`activity-${activity.id}`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0" data-testid={`activity-icon-${activity.id}`}>
                      {activity.type === "document" && <Presentation className="w-4 h-4 text-primary" />}
                      {activity.type === "wallet" && <Wallet className="w-4 h-4 text-emerald-500" />}
                      {activity.type === "message" && <MessageSquare className="w-4 h-4 text-violet-500" />}
                      {activity.type === "calendar" && <Calendar className="w-4 h-4 text-amber-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate leading-tight" data-testid={`activity-action-${activity.id}`}>{activity.action}</p>
                      <p className="text-xs text-muted-foreground truncate leading-tight mt-0.5" data-testid={`activity-target-${activity.id}`}>{activity.target}</p>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0" data-testid={`activity-time-${activity.id}`}>{activity.time}</span>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <Clock className="w-8 h-8 text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">Henüz aktivite yok</p>
                </div>
              )}
            </div>
          </BentoCard>

          <BentoCard
            title="Yaklaşan Etkinlikler"
            icon={<Calendar className="w-4 h-4" />}
            data-testid="card-upcoming-events"
          >
            <div className="space-y-2">
              {upcomingEvents.length > 0 ? (
                upcomingEvents.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                    data-testid={`event-${event.id}`}
                  >
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex flex-col items-center justify-center flex-shrink-0" data-testid={`event-date-${event.id}`}>
                      <span className="text-[10px] font-medium text-primary leading-tight">{event.date}</span>
                      <span className="text-xs font-bold leading-tight">{event.time}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate leading-tight" data-testid={`event-title-${event.id}`}>{event.title}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <Calendar className="w-8 h-8 text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">Etkinlik yok</p>
                </div>
              )}
            </div>
          </BentoCard>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <BentoCard
            title="Çevrimiçi Kişiler"
            icon={<Users className="w-4 h-4" />}
            data-testid="card-online-contacts"
          >
            <div className="space-y-1">
              {onlineContacts.length > 0 ? (
                onlineContacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => setLocation("/os/communications")}
                    data-testid={`online-contact-${contact.id}`}
                  >
                    <div className="relative flex-shrink-0">
                      <Avatar className="w-8 h-8">
                        <AvatarFallback className="text-xs bg-muted" data-testid={`contact-avatar-${contact.id}`}>
                          {((contact as any).name || "K").split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <StatusBadge
                        status={contact.status}
                        size="sm"
                        className="absolute -bottom-0.5 -right-0.5"
                      />
                    </div>
                    <span className="text-sm font-medium truncate" data-testid={`contact-name-${contact.id}`}>{(contact as any).name || `Kişi ${contact.targetUserId || ''}`}</span>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-online-contacts">
                  Çevrimiçi kişi bulunamadı
                </div>
              )}
            </div>
          </BentoCard>

          <BentoCard
            title="Hızlı İşlemler"
            icon={<Zap className="w-4 h-4" />}
            data-testid="card-quick-actions"
          >
            <div className="grid grid-cols-2 gap-2">
              <button
                className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                onClick={() => setLocation("/os/presentations")}
                data-testid="button-quick-new-presentation"
              >
                <Presentation className="w-5 h-5 text-muted-foreground" />
                <span className="text-xs font-medium text-center leading-tight">Yeni Sunum</span>
              </button>
              <button
                className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                data-testid="button-quick-new-case"
              >
                <Briefcase className="w-5 h-5 text-muted-foreground" />
                <span className="text-xs font-medium text-center leading-tight">Yeni Dava</span>
              </button>
              <button
                className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                onClick={() => setLocation("/os/communications")}
                data-testid="button-quick-send-message"
              >
                <MessageSquare className="w-5 h-5 text-muted-foreground" />
                <span className="text-xs font-medium text-center leading-tight">Mesaj Gönder</span>
              </button>
              <button
                className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                onClick={() => setLocation("/os/accounting")}
                data-testid="button-quick-new-invoice"
              >
                <Calculator className="w-5 h-5 text-muted-foreground" />
                <span className="text-xs font-medium text-center leading-tight">Fatura Kes</span>
              </button>
            </div>
          </BentoCard>

          <BentoCard
            title="Güvenlik Durumu"
            icon={<Shield className="w-4 h-4" />}
            data-testid="card-security-status"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-status-online/10" data-testid="security-encryption">
                <div className="flex items-center gap-2 min-w-0">
                  <Shield className="w-4 h-4 text-status-online flex-shrink-0" />
                  <span className="text-sm font-medium truncate">E2E Şifreleme</span>
                </div>
                <StatusBadge status="online" showLabel />
              </div>
              <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-muted/30" data-testid="security-last-login">
                <span className="text-sm text-muted-foreground truncate">Son giriş</span>
                <span className="text-sm font-medium whitespace-nowrap">Bugün 09:15</span>
              </div>
              <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-muted/30" data-testid="security-active-sessions">
                <span className="text-sm text-muted-foreground truncate">Aktif oturumlar</span>
                <span className="text-sm font-medium whitespace-nowrap">2 cihaz</span>
              </div>
            </div>
          </BentoCard>
        </div>
      </div>

      <Dialog open={isAddAppModalOpen} onOpenChange={setIsAddAppModalOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Uygulama Ekle</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[60vh] pr-4">
            <div className="space-y-6">
              {["Hukuk", "Finans", "Üretkenlik", "İletişim", "Sistem"].map((category) => {
                const categoryApps = unpinnedApps.filter(app => app.category === category);
                if (categoryApps.length === 0) return null;
                return (
                  <div key={category}>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-3">{category}</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {categoryApps.map((app) => {
                        const IconComponent = app.icon;
                        return (
                          <button
                            key={app.id}
                            onClick={() => handleAddApp(app.id)}
                            className="flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-muted/30 transition-all text-left"
                            data-testid={`add-app-${app.id}`}
                          >
                            <div className={`w-10 h-10 rounded-lg ${app.color} flex items-center justify-center text-white`}>
                              <IconComponent className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{app.title}</p>
                              <p className="text-xs text-muted-foreground truncate">{app.description}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {unpinnedApps.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  Tüm uygulamalar zaten eklenmiş
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
        </ScrollArea>
      </motion.div>
    </div>
  );
}
