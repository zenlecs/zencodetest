import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Bell, Moon, Sun, LogOut, User, Settings, Wallet, Calculator, LogIn, Check, CheckCheck, X } from "lucide-react";
import { WindowControls } from "./window-controls";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useTheme } from "@/lib/theme-provider";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
const isElectron = !!window.electron;

interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  icon: string;
  isRead: boolean;
  createdAt: string;
}

import { getNotificationRenderer } from "@/lib/notification-registry";

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Şimdi";
  if (diffMins < 60) return `${diffMins} dk önce`;
  if (diffHours < 24) return `${diffHours} saat önce`;
  if (diffDays < 7) return `${diffDays} gün önce`;
  
  return date.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
}

export function Header() {
  const [, setLocation] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);
  const [showFireEffect, setShowFireEffect] = useState(false);
  const prevUnreadCountRef = useRef(0);

  const { data: notificationData } = useQuery<{ notifications: Notification[]; unreadCount: number }>({
    queryKey: ['/api/notifications'],
    refetchInterval: 30000,
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => apiRequest('PATCH', '/api/notifications/read-all'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
      toast({ title: "Tüm bildirimler okundu işaretlendi" });
    },
    onError: (error: any) => {
      toast({ title: "İşlem başarısız", description: error.message, variant: "destructive" });
    }
  });

  const markReadMutation = useMutation({
    mutationFn: (id: number) => apiRequest('PATCH', `/api/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
    },
    onError: (error: any) => {
      toast({ title: "İşlem başarısız", description: error.message, variant: "destructive" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/notifications/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
    },
    onError: (error: any) => {
      toast({ title: "Bildirim silinemedi", description: error.message, variant: "destructive" });
    }
  });

  const createNotificationMutation = useMutation({
    mutationFn: (payload: any) => apiRequest('POST', `/api/notifications`, payload),
  });

  useEffect(() => {
    if (isElectron) {
      
      window.electron?.receive('updater-status', (data: any) => {
        if (data.status === 'update-available') {
          // Push a system update notification
          const version = data.info?.version ? `(v${data.info.version}) ` : '';
          createNotificationMutation.mutate({
            type: "system_update",
            title: "Sistem Güncellemesi Mevcut",
            message: `Zenlecs için yeni bir sürüm ${version}indirilebilir durumda.`,
          });
        }
      });
    }
    
    return () => {
      if (isElectron) {
        
        window.electron?.removeListener('updater-status', () => {});
      }
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setIsNotificationOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await logout();
  };

  const notifications = notificationData?.notifications || [];
  const unreadCount = notificationData?.unreadCount || 0;

  useEffect(() => {
    if (unreadCount > prevUnreadCountRef.current) {
      prevUnreadCountRef.current = unreadCount;
      setShowFireEffect(true);
    } else if (unreadCount < prevUnreadCountRef.current) {
      prevUnreadCountRef.current = unreadCount;
    }
  }, [unreadCount]);

  useEffect(() => {
    if (!showFireEffect) return;
    const timer = window.setTimeout(() => setShowFireEffect(false), 3000);
    return () => window.clearTimeout(timer);
  }, [showFireEffect]);

  return (
    <header className="h-12 flex items-center justify-between px-4 sticky top-0 z-30" style={{ WebkitAppRegion: 'drag' } as any}>
      {/* Liquid Glass Edge & Reflection */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-white/10 dark:bg-white/5 backdrop-blur-xl pointer-events-none" />

      <div className="w-24" />

      <div className="flex-1" />

      <div className="flex items-center gap-1 h-full">
        <button
          style={{ WebkitAppRegion: 'no-drag' } as any}
          onClick={toggleTheme}
          className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          data-testid="button-theme-toggle"
        >
          {theme === "dark" ? (
            <Sun className="w-4 h-4" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
        </button>

        <div className="relative" ref={notificationRef} style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button 
            onClick={() => setIsNotificationOpen(!isNotificationOpen)}
            className="relative w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors" 
            data-testid="button-notifications"
          >
            <div className="absolute top-[-10px] left-1/2 -translate-x-1/2 pointer-events-none opacity-90" style={{ zIndex: -1 }}>
              <AnimatePresence>
                {showFireEffect && (
                  <>
                    {/* Top Base */}
                    <motion.div
                      key="notif-fire-core"
                      initial={{ opacity: 0, scaleY: 0, x: "-50%" }}
                      animate={{ opacity: 1, scaleY: 1, x: "-50%", transition: { duration: 0.8, ease: "easeOut" } }}
                      exit={{ opacity: 0, scale: 0.5, x: "calc(-50% + 80px)", transition: { duration: 0.8, ease: "backIn" } }}
                      className="absolute top-0 left-1/2 origin-top flex justify-center"
                    >
                      <motion.div
                        animate={{ 
                          scaleX: [1, 1.25, 0.75, 1.3, 0.8, 1.15, 0.9, 1], 
                          scaleY: [1, 0.75, 1.25, 0.7, 1.2, 0.85, 1.1, 1], 
                          x: [0, 15, -10, 20, -5, 12, -15, 0],
                          opacity: [0.7, 1, 0.5, 0.9, 0.6, 1, 0.7, 0.7]
                        }}
                        transition={{ repeat: 0, duration: 3, ease: "easeInOut" }}
                        className="w-[270px] h-[45px] blur-[25px]"
                      >
                        <div className="w-full h-full bg-red-600/70 dark:bg-red-600/80" style={{ clipPath: "polygon(0 0, 100% 0, 50% 100%)" }} />
                      </motion.div>
                    </motion.div>

                    {/* Mid Flame */}
                    <motion.div
                      key="notif-fire-mid"
                      initial={{ opacity: 0, scaleY: 0, x: "-50%" }}
                      animate={{ opacity: 1, scaleY: 1, x: "-50%", transition: { duration: 0.9, delay: 0.1, ease: "easeOut" } }}
                      exit={{ opacity: 0, scale: 0.5, x: "calc(-50% + 100px)", transition: { duration: 0.9, ease: "backIn" } }}
                      className="absolute top-0 left-1/2 origin-top flex justify-center"
                    >
                      <motion.div
                        animate={{ 
                          scaleX: [1, 1.3, 0.7, 1.35, 0.75, 1.25, 0.8, 1], 
                          scaleY: [1, 0.7, 1.3, 0.65, 1.25, 0.75, 1.2, 1], 
                          x: [0, -20, 15, -12, 18, -8, 14, 0],
                          y: [0, -6, 8, -4, 6, -5, 4, 0],
                          opacity: [0.6, 0.95, 0.4, 1, 0.5, 0.9, 0.5, 0.6]
                        }}
                        transition={{ repeat: 0, duration: 3, ease: "easeInOut" }}
                        className="w-[180px] h-[85px] blur-[35px]"
                      >
                        <div className="w-full h-full bg-gradient-to-b from-red-600/60 to-orange-500/40 dark:from-red-600/70 dark:to-orange-500/50" style={{ clipPath: "polygon(0 0, 100% 0, 50% 100%)" }} />
                      </motion.div>
                    </motion.div>

                    {/* Bottom Tip */}
                    <motion.div
                      key="notif-fire-tip"
                      initial={{ opacity: 0, scaleY: 0, x: "-50%" }}
                      animate={{ opacity: 1, scaleY: 1, x: "-50%", transition: { duration: 1.0, delay: 0.2, ease: "easeOut" } }}
                      exit={{ opacity: 0, scale: 0.5, x: "calc(-50% + 120px)", transition: { duration: 1.0, ease: "backIn" } }}
                      className="absolute top-0 left-1/2 origin-top flex justify-center"
                    >
                      <motion.div
                        animate={{ 
                          scaleX: [1, 1.4, 0.6, 1.3, 0.7, 1.35, 0.65, 1], 
                          scaleY: [1, 0.6, 1.4, 0.7, 1.3, 0.65, 1.35, 1], 
                          x: [0, 25, -20, 15, -18, 12, -14, 0],
                          y: [0, 10, -8, 6, -10, 8, -6, 0],
                          opacity: [0.5, 0.85, 0.3, 0.95, 0.4, 0.8, 0.35, 0.5]
                        }}
                        transition={{ repeat: 0, duration: 3, ease: "easeInOut" }}
                        className="w-[120px] h-[120px] blur-[45px]"
                      >
                        <div className="w-full h-full bg-gradient-to-b from-orange-500/40 to-amber-400/30 dark:from-orange-500/50 dark:to-amber-400/40" style={{ clipPath: "polygon(0 0, 100% 0, 50% 100%)" }} />
                      </motion.div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[14px] h-[14px] px-1 bg-destructive rounded-full text-[9px] text-white font-medium flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          <AnimatePresence>
            {isNotificationOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.97 }}
                transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                className="absolute right-0 top-10 w-96 bg-card/90 backdrop-blur-2xl border border-border/50 rounded-2xl shadow-2xl overflow-hidden z-50 ring-1 ring-border/40 origin-top-right"
              >
                {/* Top gradient accent line */}
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent pointer-events-none" />

                {/* Panel header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium">Bildirimler</h3>
                    {unreadCount > 0 && (
                      <span className="bg-primary/10 text-primary text-[11px] font-medium rounded-full px-2 py-0.5" data-testid="badge-unread-count">
                        {unreadCount} yeni
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        markAllReadMutation.mutate();
                      }}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground rounded-full px-2.5 py-1 hover:bg-muted transition-colors"
                      data-testid="button-mark-all-read"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      Tümünü okundu işaretle
                    </button>
                  )}
                </div>

                <ScrollArea className="max-h-[380px]">
                  {notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="w-20 h-20 rounded-full bg-primary/5 flex items-center justify-center mb-4">
                        <Bell className="w-8 h-8 text-muted-foreground/30" />
                      </div>
                      <p className="text-sm text-muted-foreground">Henüz bildirim yok</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">Yeni bildirimler burada görünecek</p>
                    </div>
                  ) : (
                    <div className="p-2">
                      <AnimatePresence initial={false}>
                      {notifications.map((notification, index) => {
                        const renderer = getNotificationRenderer(notification.type);
                        const Icon = renderer.icon;
                        
                        return (
                          <motion.div
                            key={notification.id}
                            initial={{ opacity: 0, x: 8 }}
                            animate={{ opacity: 1, x: 0, transition: { delay: Math.min(index * 0.03, 0.3), duration: 0.25, ease: "easeOut" } }}
                            exit={{ opacity: 0, height: 0, transition: { duration: 0.2 } }}
                            className={cn(
                              "flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors cursor-pointer group relative mx-0.5 my-0.5 overflow-hidden",
                              notification.isRead 
                                ? "hover:bg-muted/40" 
                                : "bg-primary/[0.06] hover:bg-primary/[0.09]"
                            )}
                            onClick={(e) => {
                              // If they click the whole card, we navigate if there's an action
                              if (!notification.isRead) {
                                markReadMutation.mutate(notification.id);
                              }
                              if (renderer.onClick) {
                                renderer.onClick(notification, setLocation);
                                setIsNotificationOpen(false);
                              }
                            }}
                            data-testid={`notification-${notification.id}`}
                          >
                            {/* Unread accent rail */}
                            {!notification.isRead && (
                              <div className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-0.5 bg-primary rounded-full" />
                            )}
                            
                            {/* Icon squircle */}
                            <div className={cn(
                              "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5",
                              renderer.iconBgClass || "bg-muted"
                            )}>
                              <Icon className={cn("w-4 h-4", renderer.iconColorClass)} />
                            </div>
                            
                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <p className={cn(
                                  "text-sm leading-snug",
                                  notification.isRead ? "text-foreground/80" : "font-medium text-foreground"
                                )}>
                                  {notification.title}
                                </p>
                                <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                                  {!notification.isRead && (
                                    <span className="w-1.5 h-1.5 bg-primary rounded-full" />
                                  )}
                                  <span className="text-[10px] text-muted-foreground/60">
                                    {formatTimeAgo(notification.createdAt)}
                                  </span>
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground/80 truncate mt-0.5">
                                {notification.message}
                              </p>
                            </div>
                            
                            {/* Hover actions with gradient fade */}
                            <div className="absolute right-0 top-0 bottom-0 flex items-center pl-8 pr-2 bg-gradient-to-l from-card via-card/95 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                              <div className="flex items-center gap-1 translate-x-2 group-hover:translate-x-0 transition-transform duration-200">
                                {!notification.isRead && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                      markReadMutation.mutate(notification.id);
                                    }}
                                    className="p-1.5 rounded-full bg-background/80 border border-border/50 text-muted-foreground hover:text-primary hover:scale-105 transition-all shadow-sm"
                                    title="Okundu olarak işaretle"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    deleteMutation.mutate(notification.id);
                                  }}
                                  className="p-1.5 rounded-full bg-background/80 border border-border/50 text-muted-foreground hover:text-destructive hover:scale-105 transition-all shadow-sm"
                                  title="Bildirimi sil"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                      </AnimatePresence>
                    </div>
                  )}
                </ScrollArea>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-1.5 pl-1.5 pr-2 h-8 rounded-full bg-card/70 backdrop-blur-xl border border-border/30" data-testid="button-user-menu" style={{ WebkitAppRegion: 'no-drag' } as any}>
              <Avatar className="w-6 h-6">
                <AvatarFallback className="text-[10px] bg-primary text-primary-foreground">
                  {user?.displayName?.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() || "AV"}
                </AvatarFallback>
              </Avatar>
              <span className="hidden sm:block text-xs font-medium" data-testid="text-username">
                {user?.displayName || "Kullanıcı"}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem data-testid="menu-item-profile" className="text-sm">
              <User className="w-4 h-4 mr-2" />
              Profil
            </DropdownMenuItem>
            <DropdownMenuItem 
              data-testid="menu-item-settings" 
              className="text-sm cursor-pointer"
              onClick={() => setLocation("/os/settings")}
            >
              <Settings className="w-4 h-4 mr-2" />
              Ayarlar
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              data-testid="menu-item-logout" 
              className="text-destructive text-sm"
              onClick={handleLogout}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Çıkış Yap
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex items-center gap-1.5 ml-3 pl-3 border-l border-border/30" style={{ WebkitAppRegion: 'no-drag' } as any}>
          <WindowControls />
        </div>
      </div>
    </header>
  );
}
