import { useState, useEffect, useRef, useCallback } from "react";
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  Plus,
  TrendingUp,
  TrendingDown,
  Bitcoin,
  DollarSign,
  Euro,
  MoreHorizontal,
  Search,
  Download,
  Settings,
  CreditCard,
  Coins,
  Eye,
  EyeOff,
  Copy,
  ChevronRight,
} from "lucide-react";
import { BentoCard } from "@/components/ui/bento-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWallets, useTransactions } from "@/hooks/use-api";
import { WalletSetupWizard } from "@/components/wallet/wallet-setup-wizard";
import { DraggableModal } from "@/components/wallet/draggable-modal";
import { SendModalContent } from "@/components/wallet/send-modal";
import { ReceiveModalContent } from "@/components/wallet/receive-modal";
import type { Wallet as WalletType } from "@shared/schema";

export default function WalletPage() {
  const [activeTab, setActiveTab] = useState("fiat");
  const [selectedWalletId, setSelectedWalletId] = useState<string>("");
  const [setupWizardOpen, setSetupWizardOpen] = useState(false);
  const [setupWizardType, setSetupWizardType] = useState<"fiat" | "crypto">("fiat");
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [displayCurrency, setDisplayCurrency] = useState<"TRY" | "USD" | "EUR">("TRY");
  const [gridOrder, setGridOrder] = useState<string[]>(["fiat", "crypto", "transactions"]);
  const [isEditingLayout, setIsEditingLayout] = useState(false);
  const [draggedGrid, setDraggedGrid] = useState<string | null>(null);
  const gridsContainerRef = useRef<HTMLDivElement>(null);
  const [showTitle, setShowTitle] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => setShowTitle(true), 100);
    return () => clearTimeout(timer);
  }, []);
  
  const { data: wallets, isLoading: walletsLoading } = useWallets();
  const { data: transactions, isLoading: transactionsLoading } = useTransactions(selectedWalletId);

  useEffect(() => {
    if (wallets && wallets.length > 0 && !selectedWalletId) {
      setSelectedWalletId(wallets[0].id);
    }
  }, [wallets, selectedWalletId]);

  // Handle layout settings click - scroll to grids and enable editing
  const handleLayoutSettings = useCallback(() => {
    setIsEditingLayout(true);
    setTimeout(() => {
      gridsContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
    // Auto-disable after 10 seconds
    setTimeout(() => {
      setIsEditingLayout(false);
    }, 10000);
  }, []);

  // Drag and drop handlers
  const handleDragStart = (gridId: string) => {
    if (!isEditingLayout) return;
    setDraggedGrid(gridId);
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!isEditingLayout || !draggedGrid || draggedGrid === targetId) return;
  };

  const handleDrop = (targetId: string) => {
    if (!isEditingLayout || !draggedGrid || draggedGrid === targetId) return;
    
    const newOrder = [...gridOrder];
    const draggedIndex = newOrder.indexOf(draggedGrid);
    const targetIndex = newOrder.indexOf(targetId);
    
    newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, draggedGrid);
    
    setGridOrder(newOrder);
    setDraggedGrid(null);
  };

  const handleDragEnd = () => {
    setDraggedGrid(null);
  };

  const fiatWallets = wallets?.filter((w) => w.type === "fiat") || [];
  const cryptoWallets = wallets?.filter((w) => w.type === "crypto") || [];

  // Exchange rates
  const exchangeRates = {
    TRY_USD: 0.0308, // 1 TRY = 0.0308 USD
    TRY_EUR: 0.0284, // 1 TRY = 0.0284 EUR
    USD_TRY: 32.5,   // 1 USD = 32.5 TRY
    USD_EUR: 0.92,   // 1 USD = 0.92 EUR
    EUR_TRY: 35.2,   // 1 EUR = 35.2 TRY
    EUR_USD: 1.09,   // 1 EUR = 1.09 USD
  };

  // Calculate total in TRY first
  const totalFiatTRY = fiatWallets.reduce((acc, w) => {
    if (w.currency === "TRY") return acc + w.balance;
    if (w.currency === "USD") return acc + w.balance * exchangeRates.USD_TRY;
    if (w.currency === "EUR") return acc + w.balance * exchangeRates.EUR_TRY;
    return acc;
  }, 0);

  // Convert total to display currency
  const getDisplayTotal = () => {
    if (displayCurrency === "TRY") return totalFiatTRY;
    if (displayCurrency === "USD") return totalFiatTRY * exchangeRates.TRY_USD;
    if (displayCurrency === "EUR") return totalFiatTRY * exchangeRates.TRY_EUR;
    return totalFiatTRY;
  };

  const getCurrencySymbol = (currency: string) => {
    if (currency === "TRY") return "₺";
    if (currency === "USD") return "$";
    if (currency === "EUR") return "€";
    return "₺";
  };

  const getCurrencyFlag = (currency: string) => {
    if (currency === "TRY") return "🇹🇷";
    if (currency === "USD") return "🇺🇸";
    if (currency === "EUR") return "🇪🇺";
    return "🇹🇷";
  };

  const totalCryptoUSD = cryptoWallets.reduce((acc, w) => {
    if (w.currency === "BTC") return acc + w.balance * 42500;
    if (w.currency === "ETH") return acc + w.balance * 2000;
    if (w.currency === "USDT") return acc + w.balance;
    return acc;
  }, 0);

  const getCurrencyIcon = (currency: string) => {
    switch (currency) {
      case "TRY": return <span className="text-sm font-bold">₺</span>;
      case "USD": return <DollarSign className="w-4 h-4" />;
      case "EUR": return <Euro className="w-4 h-4" />;
      case "BTC": return <Bitcoin className="w-4 h-4 text-amber-500" />;
      case "ETH": return <span className="text-sm font-bold text-violet-500">Ξ</span>;
      case "USDT": return <span className="text-sm font-bold text-emerald-500">₮</span>;
      default: return <DollarSign className="w-4 h-4" />;
    }
  };

  const formatBalance = (wallet: WalletType) => {
    if (wallet.type === "crypto") {
      return `${(wallet as any).balance ?? '0'} ${wallet.currency}`;
    }
    const symbol = wallet.currency === "TRY" ? "₺" : wallet.currency === "USD" ? "$" : "€";
    return `${symbol}${(wallet as any).balance.toLocaleString("tr-TR")}`;
  };

  const openFiatSetup = () => {
    setSetupWizardType("fiat");
    setSetupWizardOpen(true);
  };

  const openCryptoSetup = () => {
    setSetupWizardType("crypto");
    setSetupWizardOpen(true);
  };

  const mockCards = [
    { id: 1, type: "physical" as const, lastFour: "4532", name: "Kurumsal Kart", balance: 12500, currency: "TRY", color: "from-slate-900 via-slate-800 to-slate-700", cardBrand: "visa" as const },
    { id: 2, type: "virtual" as const, lastFour: "8821", name: "Online Alışveriş", balance: 3200, currency: "TRY", color: "from-violet-600 via-purple-600 to-indigo-700", cardBrand: "mastercard" as const },
    { id: 3, type: "physical" as const, lastFour: "1199", name: "Yedek Kart", balance: 850, currency: "USD", color: "from-emerald-500 via-teal-600 to-cyan-700", cardBrand: "visa" as const },
  ];

  const VisaLogo = () => (
    <svg viewBox="0 0 48 16" className="h-6 w-auto" fill="white">
      <path d="M19.5 1.5L16.5 14.5H13L16 1.5H19.5ZM34.5 9.5C34.5 6 32 4.5 29 4.5C25.5 4.5 22.5 6.5 22.5 10C22.5 13.5 25 15 28.5 15C31 15 33 14 34 13L32.5 10.5C32 11 30.5 11.5 29 11.5C27.5 11.5 26.5 11 26.5 9.5H34.5ZM29 7C30 7 31 7.5 31 8.5H26.5C26.5 7.5 27.5 7 29 7ZM44.5 4.5L42 14.5H38.5L39 12.5C38 14 36.5 15 34.5 15C32 15 30.5 13 30.5 10C30.5 6.5 33 4.5 36 4.5C37.5 4.5 39 5 39.5 6L40 4.5H44.5ZM37 11.5C38.5 11.5 39.5 10 40 8.5C39.5 8 38.5 7.5 37.5 7.5C35.5 7.5 34.5 9 34.5 10.5C34.5 11.5 35.5 11.5 37 11.5ZM10.5 1.5L6 14.5H2L4 8.5L1.5 1.5H5.5L7 6.5L10.5 1.5Z"/>
    </svg>
  );

  const MastercardLogo = () => (
    <svg viewBox="0 0 48 30" className="h-6 w-auto">
      <circle cx="18" cy="15" r="12" fill="#EB001B" opacity="0.9"/>
      <circle cx="30" cy="15" r="12" fill="#F79E1B" opacity="0.9"/>
      <path d="M24 6C26.5 8 28 11.5 28 15C28 18.5 26.5 22 24 24C21.5 22 20 18.5 20 15C20 11.5 21.5 8 24 6Z" fill="#FF5F00"/>
    </svg>
  );

  const [activeCardIndex, setActiveCardIndex] = useState(0);

  const nextCard = () => setActiveCardIndex((prev) => (prev + 1) % mockCards.length);
  const prevCard = () => setActiveCardIndex((prev) => (prev - 1 + mockCards.length) % mockCards.length);

  return (
    <ScrollArea className="h-full">
      <div className="p-6 md:p-8 max-w-[1600px] mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 
            className={`text-2xl tracking-tight transition-all duration-700 ease-out ${
              showTitle 
                ? 'opacity-100 translate-y-0' 
                : 'opacity-0 translate-y-4'
            }`} 
            style={{ fontFamily: 'Montserrat, sans-serif' }}
            data-testid="text-wallet-title"
          >
            <span style={{ fontWeight: 500 }}>Zen</span>
            <span style={{ fontWeight: 200 }}>Wallet</span>
          </h1>
          <div className="flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-10 px-3 rounded-full" data-testid="button-currency-selector">
                  <span className="text-sm mr-1">{getCurrencyFlag(displayCurrency)}</span>
                  {displayCurrency}
                  <ChevronRight className="w-4 h-4 ml-1 rotate-90" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-xl">
                <DropdownMenuItem 
                  className={`rounded-lg ${displayCurrency === "TRY" ? "bg-primary/10" : ""}`}
                  onClick={() => setDisplayCurrency("TRY")}
                >
                  🇹🇷 TRY
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className={`rounded-lg ${displayCurrency === "USD" ? "bg-primary/10" : ""}`}
                  onClick={() => setDisplayCurrency("USD")}
                >
                  🇺🇸 USD
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className={`rounded-lg ${displayCurrency === "EUR" ? "bg-primary/10" : ""}`}
                  onClick={() => setDisplayCurrency("EUR")}
                >
                  🇪🇺 EUR
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button 
              variant="ghost" 
              size="icon" 
              className={`h-10 w-10 rounded-full ${isEditingLayout ? 'bg-primary text-primary-foreground' : ''}`}
              onClick={handleLayoutSettings}
              data-testid="button-layout-settings"
            >
              <Settings className={`w-5 h-5 ${isEditingLayout ? 'animate-spin' : ''}`} />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="h-10 px-4 rounded-full shadow-md" data-testid="button-add-wallet">
                  <Plus className="w-4 h-4 mr-1.5" />
                  Ekle
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-xl">
                <DropdownMenuItem onClick={openFiatSetup} className="rounded-lg" data-testid="menu-add-fiat">
                  <CreditCard className="w-4 h-4 mr-2" />
                  Fiat Cüzdan
                </DropdownMenuItem>
                <DropdownMenuItem onClick={openCryptoSetup} className="rounded-lg" data-testid="menu-add-crypto">
                  <Coins className="w-4 h-4 mr-2" />
                  Kripto Cüzdan
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex items-center justify-between" data-testid="balance-section">
          {walletsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-5 w-28 rounded-full" />
              <Skeleton className="h-14 w-64 rounded-xl" />
              <Skeleton className="h-5 w-40 rounded-full" />
            </div>
          ) : (
            <div data-testid="total-balance-section">
              <span className="text-sm text-muted-foreground" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 400 }}>
                Toplam Bakiye ({displayCurrency})
              </span>
              <div className="flex items-baseline gap-3">
                <span 
                  className="text-5xl font-price tracking-tight" 
                  data-testid="text-fiat-total"
                >
                  {getCurrencySymbol(displayCurrency)}{getDisplayTotal().toLocaleString(displayCurrency === "TRY" ? "tr-TR" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-base text-status-online flex items-center font-medium" data-testid="badge-fiat-trend">
                  <TrendingUp className="w-4 h-4 mr-1" />
                  +5.2%
                </span>
              </div>
              <div className="flex items-center gap-4 mt-2">
                <span className="text-base text-muted-foreground" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 300 }}>
                  Kripto: <span className="font-price text-foreground">${totalCryptoUSD.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  <span className="text-status-online ml-2 text-sm font-medium" data-testid="badge-crypto-trend">+2.4%</span>
                </span>
              </div>
            </div>
          )}
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSendModalOpen(true)}
              className="w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 active:scale-95"
              data-testid="button-fab-send"
            >
              <ArrowUpRight className="w-6 h-6" />
            </button>
            <button
              onClick={() => setReceiveModalOpen(true)}
              className="w-14 h-14 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 active:scale-95"
              data-testid="button-fab-receive"
            >
              <ArrowDownLeft className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-6 py-4">
          {/* Cards Section - Compact */}
          <div className="col-span-12 lg:col-span-3" data-testid="cards-slider-section">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-medium" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 500 }}>Kartlarım</h2>
              <Button variant="ghost" size="sm" className="h-7 text-xs rounded-full px-2">
                Tümü
                <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
              </Button>
            </div>
            <div className="relative">
              <div className="overflow-hidden rounded-xl">
                <div 
                  className="flex transition-transform duration-500 ease-out"
                  style={{ transform: `translateX(-${activeCardIndex * 100}%)` }}
                >
                  {mockCards.map((card) => (
                  <div
                    key={card.id}
                    className="flex-shrink-0 w-full"
                    data-testid={`card-slider-${card.id}`}
                  >
                    <div 
                      className={`w-full rounded-xl bg-gradient-to-br ${card.color} p-4 text-white shadow-lg cursor-pointer transition-all duration-300`}
                      style={{ aspectRatio: '1.586 / 1' }}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="w-8 h-5 bg-gradient-to-br from-amber-300 to-amber-500 rounded-sm shadow-inner" />
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-medium opacity-80 bg-white/10 px-1.5 py-0.5 rounded-full backdrop-blur-sm">
                            {card.type === "physical" ? "Fiziksel" : "Sanal"}
                          </span>
                          {card.cardBrand === "visa" ? <VisaLogo /> : <MastercardLogo />}
                        </div>
                      </div>
                      <div className="text-sm font-mono tracking-[0.15em] mb-2">•••• {card.lastFour}</div>
                      <div className="flex justify-between items-end">
                        <div>
                          <span className="text-[9px] opacity-70 block mb-0.5 uppercase tracking-wider">Kart Adı</span>
                          <span className="text-xs font-medium">{card.name}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[9px] opacity-70 block mb-0.5 uppercase tracking-wider">Bakiye</span>
                          <span className="text-sm font-price">
                            {card.currency === "TRY" ? "₺" : "$"}{card.balance.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-center gap-1 mt-2">
                {mockCards.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveCardIndex(idx)}
                    className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                      idx === activeCardIndex ? 'bg-primary w-3' : 'bg-muted-foreground/30'
                    }`}
                    data-testid={`card-indicator-${idx}`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Statistics Table Section */}
          <div className="col-span-12 lg:col-span-6" data-testid="wallet-stats-section">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-medium" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 500 }}>Bakiye Takibi</h2>
              <Button variant="ghost" size="sm" className="h-7 text-xs rounded-full px-2">
                Detaylar
                <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
              </Button>
            </div>
            <div className="relative">
              <Card className="rounded-xl border-0 bg-card/50 backdrop-blur-sm shadow-sm overflow-hidden">
                <CardContent className="p-0">
                  <div className="overflow-y-auto max-h-[320px]" style={{ scrollbarWidth: 'thin' }}>
                    <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/30">
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider" style={{ fontFamily: 'Montserrat, sans-serif' }}>Hesap</th>
                        <th className="text-right py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider" style={{ fontFamily: 'Montserrat, sans-serif' }}>Bakiye</th>
                        <th className="text-right py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider hidden md:table-cell" style={{ fontFamily: 'Montserrat, sans-serif' }}>TRY</th>
                        <th className="text-right py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider hidden lg:table-cell" style={{ fontFamily: 'Montserrat, sans-serif' }}>USD</th>
                        <th className="text-center py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider" style={{ fontFamily: 'Montserrat, sans-serif' }}>Trend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fiatWallets.map((wallet) => {
                        const tryValue = wallet.currency === "TRY" ? wallet.balance : 
                          wallet.currency === "USD" ? wallet.balance * exchangeRates.USD_TRY : 
                          wallet.balance * exchangeRates.EUR_TRY;
                        const usdValue = tryValue * exchangeRates.TRY_USD;
                        return (
                          <tr key={wallet.id} className="border-b border-border/20 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setSelectedWalletId(wallet.id)}>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                                  {getCurrencyIcon(wallet.currency)}
                                </div>
                                <div>
                                  <p className="font-medium text-sm" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 500 }}>{wallet.name}</p>
                                  <p className="text-xs text-muted-foreground">{wallet.currency}</p>
                                </div>
                              </div>
                            </td>
                            <td className="text-right py-3 px-4 font-price text-base">{formatBalance(wallet)}</td>
                            <td className="text-right py-3 px-4 font-price text-muted-foreground hidden md:table-cell">₺{tryValue.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}</td>
                            <td className="text-right py-3 px-4 font-price text-muted-foreground hidden lg:table-cell">${usdValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
                            <td className="text-center py-3 px-4">
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-500">
                                <TrendingUp className="w-3 h-3" />
                                +5.2%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                      {cryptoWallets.slice(0, 3).map((wallet) => {
                        const usdValue = wallet.currency === "BTC" ? wallet.balance * 42500 :
                          wallet.currency === "ETH" ? wallet.balance * 2000 : wallet.balance;
                        const tryValue = usdValue * exchangeRates.USD_TRY;
                        return (
                          <tr key={wallet.id} className="border-b border-border/20 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setSelectedWalletId(wallet.id)}>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/5 flex items-center justify-center">
                                  {getCurrencyIcon(wallet.currency)}
                                </div>
                                <div>
                                  <p className="font-medium text-sm" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 500 }}>{wallet.name}</p>
                                  <p className="text-xs text-muted-foreground">{wallet.currency}</p>
                                </div>
                              </div>
                            </td>
                            <td className="text-right py-3 px-4 font-price text-base">{formatBalance(wallet)}</td>
                            <td className="text-right py-3 px-4 font-price text-muted-foreground hidden md:table-cell">₺{tryValue.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}</td>
                            <td className="text-right py-3 px-4 font-price text-muted-foreground hidden lg:table-cell">${usdValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
                            <td className="text-center py-3 px-4">
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-500">
                                <TrendingUp className="w-3 h-3" />
                                +3.8%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-muted/20">
                        <td className="py-3 px-4 font-medium text-sm" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 500 }}>Toplam</td>
                        <td className="text-right py-3 px-4 font-price text-base font-semibold">{getCurrencySymbol(displayCurrency)}{getDisplayTotal().toLocaleString(displayCurrency === "TRY" ? "tr-TR" : "en-US", { maximumFractionDigits: 0 })}</td>
                        <td className="text-right py-3 px-4 font-price font-medium hidden md:table-cell">₺{totalFiatTRY.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}</td>
                        <td className="text-right py-3 px-4 font-price font-medium hidden lg:table-cell">${(totalFiatTRY * exchangeRates.TRY_USD + totalCryptoUSD).toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
                        <td className="text-center py-3 px-4">
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-500">
                            <TrendingUp className="w-3 h-3" />
                            +4.5%
                          </span>
                        </td>
                      </tr>
                    </tfoot>
                    </table>
                  </div>
                </CardContent>
              </Card>
              <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-background to-transparent pointer-events-none rounded-b-xl" />
            </div>
          </div>

          {/* Campaigns Section - Narrow Column */}
          <div className="col-span-12 lg:col-span-3" data-testid="campaigns-section">
            <div className="mb-3">
              <h2 className="text-base font-medium" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 500 }}>Kampanyalar</h2>
            </div>
            <div className="relative">
              <div className="overflow-y-auto max-h-[320px] space-y-2 pr-1" style={{ scrollbarWidth: 'thin' }}>
                <div className="p-3 rounded-xl bg-gradient-to-br from-violet-500/10 to-purple-500/5 border border-violet-500/20 cursor-pointer hover:border-violet-500/40 transition-colors">
                  <div className="flex items-start gap-2">
                    <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm">%</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xs font-medium mb-0.5 truncate" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 500 }}>Hoş Geldin Bonusu</h3>
                      <p className="text-[10px] text-muted-foreground line-clamp-2">İlk transferde %5 bonus</p>
                    </div>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border border-emerald-500/20 cursor-pointer hover:border-emerald-500/40 transition-colors">
                  <div className="flex items-start gap-2">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                      <RefreshCw className="w-4 h-4 text-emerald-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xs font-medium mb-0.5 truncate" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 500 }}>Ücretsiz Transfer</h3>
                      <p className="text-[10px] text-muted-foreground line-clamp-2">Ay sonuna kadar ücretsiz</p>
                    </div>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/5 border border-amber-500/20 cursor-pointer hover:border-amber-500/40 transition-colors">
                  <div className="flex items-start gap-2">
                    <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                      <Bitcoin className="w-4 h-4 text-amber-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xs font-medium mb-0.5 truncate" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 500 }}>Kripto Cashback</h3>
                      <p className="text-[10px] text-muted-foreground line-clamp-2">Alımlarda %2 geri ödeme</p>
                    </div>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500/10 to-indigo-500/5 border border-blue-500/20 cursor-pointer hover:border-blue-500/40 transition-colors">
                  <div className="flex items-start gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                      <TrendingUp className="w-4 h-4 text-blue-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xs font-medium mb-0.5 truncate" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 500 }}>Avans %10 Cashback</h3>
                      <p className="text-[10px] text-muted-foreground line-clamp-2">Avans ödemelerinde fırsat</p>
                    </div>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-gradient-to-br from-rose-500/10 to-pink-500/5 border border-rose-500/20 cursor-pointer hover:border-rose-500/40 transition-colors">
                  <div className="flex items-start gap-2">
                    <div className="w-8 h-8 rounded-full bg-rose-500/20 flex items-center justify-center flex-shrink-0">
                      <CreditCard className="w-4 h-4 text-rose-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xs font-medium mb-0.5 truncate" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 500 }}>Harcama Bonusu</h3>
                      <p className="text-[10px] text-muted-foreground line-clamp-2">5000₺ üzeri %3 bonus</p>
                    </div>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-gradient-to-br from-cyan-500/10 to-sky-500/5 border border-cyan-500/20 cursor-pointer hover:border-cyan-500/40 transition-colors">
                  <div className="flex items-start gap-2">
                    <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center flex-shrink-0">
                      <Coins className="w-4 h-4 text-cyan-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xs font-medium mb-0.5 truncate" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 500 }}>Döviz Avantajı</h3>
                      <p className="text-[10px] text-muted-foreground line-clamp-2">Komisyon indirimi</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-background to-transparent pointer-events-none" />
            </div>
          </div>
        </div>

        <div ref={gridsContainerRef} className="space-y-6" data-testid="reorderable-grids-container">
        {isEditingLayout && (
          <div className="flex items-center justify-between p-3 rounded-xl bg-primary/10 border border-primary/20">
            <span className="text-sm text-primary" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 500 }}>
              Düzenleme modu aktif - Gridleri sürükleyerek yerlerini değiştirin
            </span>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-8 rounded-full"
              onClick={() => setIsEditingLayout(false)}
              data-testid="button-done-editing"
            >
              Tamam
            </Button>
          </div>
        )}

        <div className="grid grid-cols-12 gap-6">
          {gridOrder.map((gridId, index) => {
            const isFullWidth = index === 2;
            const gridColClass = isFullWidth ? 'col-span-12' : 'col-span-12 lg:col-span-6';
            
            if (gridId === "fiat") {
              return (
          <div 
            key="fiat"
            className={`${gridColClass} transition-all duration-300 ${isEditingLayout ? 'grid-editing grid-shake' : ''} ${draggedGrid === 'fiat' ? 'grid-dragging' : ''}`}
            data-testid="fiat-wallets-section"
            draggable={isEditingLayout}
            onDragStart={() => handleDragStart('fiat')}
            onDragOver={(e) => handleDragOver(e, 'fiat')}
            onDrop={() => handleDrop('fiat')}
            onDragEnd={handleDragEnd}
          >
            <div className="rounded-xl overflow-hidden shadow-lg bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 dark:from-[#0a0a0c] dark:via-[#0d1117] dark:to-[#0a0a0c] border border-slate-200/50 dark:border-white/5">
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-200/50 dark:bg-black/20 border-b border-slate-300/50 dark:border-white/10">
                <DollarSign className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-slate-800 dark:text-white/90" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 500 }}>Fiat Cüzdanlar</span>
              </div>
              <div className="p-3">
                {walletsLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-14 rounded-lg" data-testid="skeleton-wallet-1" />
                    <Skeleton className="h-14 rounded-lg" data-testid="skeleton-wallet-2" />
                  </div>
                ) : fiatWallets.length > 0 ? (
                  <div className="space-y-2">
                    {fiatWallets.map((wallet) => (
                      <div
                        key={wallet.id}
                        className="wallet-item p-3 rounded-lg cursor-pointer transition-all duration-200"
                        onClick={() => setSelectedWalletId(wallet.id)}
                        data-testid={`wallet-${wallet.currency.toLowerCase()}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center" data-testid={`wallet-icon-${wallet.id}`}>
                              {getCurrencyIcon(wallet.currency)}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-slate-800 dark:text-white/90" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 500 }} data-testid={`wallet-name-${wallet.id}`}>{wallet.name}</p>
                              <p className="text-xs text-slate-500 dark:text-white/50">{wallet.currency}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="text-right">
                              <p className="text-base font-price text-slate-900 dark:text-white" data-testid={`wallet-balance-${wallet.id}`}>
                                {formatBalance(wallet)}
                              </p>
                              <div className="flex items-center gap-1 justify-end">
                                <TrendingUp className="w-3 h-3 text-emerald-500 dark:text-emerald-400" />
                                <span className="text-[10px] font-medium text-emerald-500 dark:text-emerald-400">+5.2%</span>
                              </div>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-slate-500 dark:text-white/70 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-white/10" data-testid={`button-wallet-menu-${wallet.id}`}>
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="rounded-xl">
                                <DropdownMenuItem className="rounded-lg text-sm" data-testid={`menu-send-${wallet.id}`}>
                                  <ArrowUpRight className="w-4 h-4 mr-2" />
                                  Para Gönder
                                </DropdownMenuItem>
                                <DropdownMenuItem className="rounded-lg text-sm" data-testid={`menu-receive-${wallet.id}`}>
                                  <ArrowDownLeft className="w-4 h-4 mr-2" />
                                  Para Al
                                </DropdownMenuItem>
                                <DropdownMenuItem className="rounded-lg text-sm" data-testid={`menu-details-${wallet.id}`}>
                                  <Eye className="w-4 h-4 mr-2" />
                                  Detaylar
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 text-center">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center mx-auto mb-3">
                      <CreditCard className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="text-sm font-medium mb-1 text-slate-800 dark:text-white/90" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 500 }}>Fiat Cüzdan Yok</h3>
                    <p className="text-xs text-slate-500 dark:text-white/50 mb-3">Fiat varlıklarınızı takip edin</p>
                    <Button size="sm" className="h-8 text-xs px-4 rounded-full" onClick={openFiatSetup} data-testid="button-setup-fiat">
                      <Plus className="w-3.5 h-3.5 mr-1" />
                      Cüzdan Ekle
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
              );
            }
            if (gridId === "crypto") {
              return (
          <div 
            key="crypto"
            className={`${gridColClass} transition-all duration-300 ${isEditingLayout ? 'grid-editing grid-shake' : ''} ${draggedGrid === 'crypto' ? 'grid-dragging' : ''}`}
            data-testid="crypto-wallets-section"
            draggable={isEditingLayout}
            onDragStart={() => handleDragStart('crypto')}
            onDragOver={(e) => handleDragOver(e, 'crypto')}
            onDrop={() => handleDrop('crypto')}
            onDragEnd={handleDragEnd}
          >
            <div className="rounded-xl overflow-hidden shadow-lg bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 dark:from-[#0a0a0c] dark:via-[#0d1117] dark:to-[#0a0a0c] border border-slate-200/50 dark:border-white/5">
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-200/50 dark:bg-black/20 border-b border-slate-300/50 dark:border-white/10">
                <Bitcoin className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-medium text-slate-800 dark:text-white/90" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 500 }}>Kripto Cüzdanlar</span>
              </div>
              <div className="p-3">
                {walletsLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-14 rounded-lg" data-testid="skeleton-crypto-1" />
                    <Skeleton className="h-14 rounded-lg" data-testid="skeleton-crypto-2" />
                  </div>
                ) : cryptoWallets.length > 0 ? (
                  <div className="space-y-2">
                    {cryptoWallets.map((wallet) => {
                      const usdValue = wallet.currency === "BTC" ? wallet.balance * 42500 :
                        wallet.currency === "ETH" ? wallet.balance * 2000 : wallet.balance;
                      return (
                        <div
                          key={wallet.id}
                          className="wallet-item p-3 rounded-lg cursor-pointer transition-all duration-200"
                          onClick={() => setSelectedWalletId(wallet.id)}
                          data-testid={`wallet-${wallet.currency.toLowerCase()}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500/30 to-orange-500/10 flex items-center justify-center" data-testid={`wallet-icon-${wallet.id}`}>
                                {getCurrencyIcon(wallet.currency)}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-slate-800 dark:text-white/90" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 500 }} data-testid={`wallet-name-${wallet.id}`}>{wallet.name}</p>
                                <p className="text-xs text-slate-500 dark:text-white/50 font-price">≈ ${usdValue.toLocaleString()}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="text-right">
                                <p className="text-base font-price text-slate-900 dark:text-white" data-testid={`wallet-balance-${wallet.id}`}>
                                  {formatBalance(wallet)}
                                </p>
                                <div className="flex items-center gap-1 justify-end">
                                  <TrendingUp className="w-3 h-3 text-emerald-500 dark:text-emerald-400" />
                                  <span className="text-[10px] font-medium text-emerald-500 dark:text-emerald-400">+3.8%</span>
                                </div>
                              </div>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                  <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-slate-500 dark:text-white/70 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-white/10" data-testid={`button-wallet-menu-${wallet.id}`}>
                                    <MoreHorizontal className="w-4 h-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="rounded-xl">
                                  <DropdownMenuItem className="rounded-lg text-sm" data-testid={`menu-send-${wallet.id}`}>
                                    <ArrowUpRight className="w-4 h-4 mr-2" />
                                    Gönder
                                  </DropdownMenuItem>
                                  <DropdownMenuItem className="rounded-lg text-sm" data-testid={`menu-receive-${wallet.id}`}>
                                    <ArrowDownLeft className="w-4 h-4 mr-2" />
                                    Al
                                  </DropdownMenuItem>
                                  <DropdownMenuItem className="rounded-lg text-sm" data-testid={`menu-swap-${wallet.id}`}>
                                    <RefreshCw className="w-4 h-4 mr-2" />
                                    Takas Et
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-6 text-center">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-500/30 to-orange-500/10 flex items-center justify-center mx-auto mb-3">
                      <Bitcoin className="w-6 h-6 text-amber-500" />
                    </div>
                    <h3 className="text-sm font-medium mb-1 text-slate-800 dark:text-white/90" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 500 }}>Kripto Cüzdan Yok</h3>
                    <p className="text-xs text-slate-500 dark:text-white/50 mb-3">Kripto varlıklarınızı takip edin</p>
                    <Button size="sm" className="h-8 text-xs px-4 rounded-full" onClick={openCryptoSetup} data-testid="button-setup-crypto">
                      <Plus className="w-3.5 h-3.5 mr-1" />
                      Cüzdan Ekle
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
              );
            }
            if (gridId === "transactions") {
              return (
          <div 
            key="transactions"
            className={`${gridColClass} transition-all duration-300 ${isEditingLayout ? 'grid-editing grid-shake' : ''} ${draggedGrid === 'transactions' ? 'grid-dragging' : ''}`}
            data-testid="card-recent-transactions"
            draggable={isEditingLayout}
            onDragStart={() => handleDragStart('transactions')}
            onDragOver={(e) => handleDragOver(e, 'transactions')}
            onDrop={() => handleDrop('transactions')}
            onDragEnd={handleDragEnd}
          >
          <div className="rounded-xl overflow-hidden shadow-lg h-full bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 dark:from-[#0a0a0c] dark:via-[#0d1117] dark:to-[#0a0a0c] border border-slate-200/50 dark:border-white/5">
          <div className="flex items-center justify-between px-3 py-2 bg-slate-200/50 dark:bg-black/20 border-b border-slate-300/50 dark:border-white/10">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-slate-800 dark:text-white/90" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 500 }}>Son İşlemler</span>
            </div>
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 rounded text-slate-500 dark:text-white/60 hover:text-slate-700 dark:hover:text-white hover:bg-slate-300/50 dark:hover:bg-white/10" data-testid="button-view-all-transactions">
              Tümünü Gör
              <ChevronRight className="w-3 h-3 ml-0.5" />
            </Button>
          </div>
          <div className="p-3">
            {transactionsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 rounded-lg" data-testid="skeleton-tx-1" />
                <Skeleton className="h-12 rounded-lg" data-testid="skeleton-tx-2" />
              </div>
            ) : transactions && transactions.length > 0 ? (
              <div className="space-y-2">
                {transactions.slice(0, isFullWidth ? 4 : 3).map((tx) => (
                  <div
                    key={tx.id}
                    className="tx-item flex items-center justify-between p-3 rounded-lg transition-colors duration-200 cursor-pointer"
                    data-testid={`transaction-${tx.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                        tx.type === "income" ? "bg-emerald-500/20" :
                        tx.type === "expense" ? "bg-red-500/20" :
                        "bg-primary/20"
                      }`} data-testid={`tx-icon-${tx.id}`}>
                        {tx.type === "income" && <ArrowDownLeft className="w-4 h-4 text-emerald-400" />}
                        {tx.type === "expense" && <ArrowUpRight className="w-4 h-4 text-red-400" />}
                        {tx.type === "transfer" && <RefreshCw className="w-4 h-4 text-primary" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-800 dark:text-white/90" data-testid={`tx-desc-${tx.id}`}>{tx.description}</p>
                        <p className="text-xs text-slate-500 dark:text-white/50">{tx.category} • {tx.date}</p>
                      </div>
                    </div>
                    <div className={`text-sm font-price ${
                      tx.type === "income" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                    }`} data-testid={`tx-amount-${tx.id}`}>
                      {tx.type === "income" ? "+" : "-"}₺{tx.amount.toLocaleString("tr-TR")}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-slate-500 dark:text-white/50 text-sm" data-testid="text-no-transactions">
                Bu cüzdan için işlem bulunamadı
              </div>
            )}
          </div>
        </div>
        </div>
              );
            }
            return null;
          })}
        </div>
      </div>
      </div>

      <WalletSetupWizard
        open={setupWizardOpen}
        onOpenChange={setSetupWizardOpen}
        walletType={setupWizardType}
      />

      <DraggableModal
        isOpen={sendModalOpen}
        onClose={() => setSendModalOpen(false)}
        title="Para Gönder"
        variant="send"
        initialPosition={{ x: window.innerWidth / 2 - 160, y: 150 }}
      >
        <SendModalContent onClose={() => setSendModalOpen(false)} />
      </DraggableModal>

      <DraggableModal
        isOpen={receiveModalOpen}
        onClose={() => setReceiveModalOpen(false)}
        title="Para Al"
        variant="receive"
        initialPosition={{ x: window.innerWidth / 2 + 20, y: 150 }}
      >
        <ReceiveModalContent onClose={() => setReceiveModalOpen(false)} />
      </DraggableModal>
    </ScrollArea>
  );
}
