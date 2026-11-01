import { useState } from "react";
import { useLocation } from "wouter";
import { MessageCircle, Phone, X, Send, Video, Mic, MicOff } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const recentChats: { id: number; name: string; lastMessage: string; time: string; unread: number; online: boolean }[] = [];

export function LiveChatToggle() {
  const [location, setLocation] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "call">("chat");
  const [selectedChat, setSelectedChat] = useState<typeof recentChats[0] | null>(null);
  const [message, setMessage] = useState("");

  if (location === "/os/communications") {
    return null;
  }

  const totalUnread = recentChats.reduce((sum, chat) => sum + chat.unread, 0);

  const handleSendMessage = () => {
    if (message.trim()) {
      setMessage("");
    }
  };

  return (
    <>
      <motion.div
        className="fixed right-0 top-[60%] -translate-y-1/2 z-50"
        initial={{ x: 0 }}
        animate={{ x: isOpen ? -320 : 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      >
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "relative flex flex-col items-center justify-center gap-2 py-6 px-2 rounded-l-2xl",
            "bg-primary hover:bg-primary/90",
            "shadow-lg shadow-primary/30 transition-all duration-300",
            "border-l border-t border-b border-primary/30"
          )}
          data-testid="button-live-chat-toggle"
        >
          <div className="relative">
            <MessageCircle className="w-5 h-5 text-white" />
            {totalUnread > 0 && (
              <span className="absolute -top-2 -right-2 w-4 h-4 bg-red-500 rounded-full text-[10px] text-white font-bold flex items-center justify-center">
                {totalUnread}
              </span>
            )}
          </div>
          <div className="w-px h-4 bg-white/30" />
          <Phone className="w-4 h-4 text-white/80" />
        </button>
      </motion.div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ x: 320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 320, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed right-0 top-0 bottom-0 w-80 z-40 flex flex-col bg-card border-l border-border shadow-2xl"
            data-testid="panel-live-chat"
          >
            <div className="flex items-center justify-between p-3 border-b border-primary/20 bg-primary">
              <div className="flex items-center gap-2">
                <div className="flex bg-white/20 rounded-lg p-0.5">
                  <button
                    onClick={() => { setActiveTab("chat"); setSelectedChat(null); }}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                      activeTab === "chat" 
                        ? "bg-white text-primary shadow-sm" 
                        : "text-white/80 hover:text-white"
                    )}
                    data-testid="button-tab-chat"
                  >
                    Mesajlar
                  </button>
                  <button
                    onClick={() => { setActiveTab("call"); setSelectedChat(null); }}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                      activeTab === "call" 
                        ? "bg-white text-primary shadow-sm" 
                        : "text-white/80 hover:text-white"
                    )}
                    data-testid="button-tab-call"
                  >
                    Aramalar
                  </button>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
                data-testid="button-close-chat"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            {activeTab === "chat" && !selectedChat && (
              <ScrollArea className="flex-1">
                <div className="p-2">
                  {recentChats.length > 0 ? (
                    recentChats.map((chat) => (
                      <button
                        key={chat.id}
                        onClick={() => setSelectedChat(chat)}
                        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors text-left"
                        data-testid={`chat-item-${chat.id}`}
                      >
                        <div className="relative">
                          <Avatar className="w-10 h-10">
                            <AvatarFallback className="bg-primary text-white text-sm">
                              {chat.name.split(" ").map(n => n[0]).join("")}
                            </AvatarFallback>
                          </Avatar>
                          {chat.online && (
                            <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-card rounded-full" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium truncate">{chat.name}</span>
                            <span className="text-xs text-muted-foreground">{chat.time}</span>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{chat.lastMessage}</p>
                        </div>
                        {chat.unread > 0 && (
                          <span className="w-5 h-5 bg-primary rounded-full text-[10px] text-white font-bold flex items-center justify-center">
                            {chat.unread}
                          </span>
                        )}
                      </button>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <MessageCircle className="w-12 h-12 text-muted-foreground/30 mb-3" />
                      <p className="text-sm text-muted-foreground">Henüz mesaj yok</p>
                      <p className="text-xs text-muted-foreground/70 mt-1">Yeni bir sohbet başlatın</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            )}

            {activeTab === "chat" && selectedChat && (
              <div className="flex-1 flex flex-col">
                <div className="flex items-center gap-3 p-3 border-b border-border">
                  <button
                    onClick={() => setSelectedChat(null)}
                    className="p-1 rounded-lg hover:bg-muted transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="bg-gradient-to-br from-blue-500 to-blue-600 text-white text-xs">
                      {selectedChat.name.split(" ").map(n => n[0]).join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{selectedChat.name}</p>
                    <p className="text-xs text-green-500">Çevrimiçi</p>
                  </div>
                  <Button size="icon" variant="ghost" className="w-8 h-8">
                    <Phone className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="w-8 h-8">
                    <Video className="w-4 h-4" />
                  </Button>
                </div>

                <ScrollArea className="flex-1 p-3">
                  <div className="space-y-3">
                    <div className="flex justify-start">
                      <div className="max-w-[80%] bg-muted rounded-2xl rounded-bl-md px-3 py-2">
                        <p className="text-sm">{selectedChat.lastMessage}</p>
                        <span className="text-[10px] text-muted-foreground">{selectedChat.time}</span>
                      </div>
                    </div>
                  </div>
                </ScrollArea>

                <div className="p-3 border-t border-border">
                  <div className="flex items-center gap-2">
                    <Input
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Mesaj yazın..."
                      className="flex-1 h-9 text-sm"
                      onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                      data-testid="input-chat-message"
                    />
                    <Button 
                      size="icon" 
                      className="w-9 h-9 bg-primary hover:bg-primary/90"
                      onClick={handleSendMessage}
                      data-testid="button-send-message"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "call" && (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-4">
                  <Phone className="w-8 h-8 text-primary" />
                </div>
                <h3 className="font-medium mb-1">Hızlı Arama</h3>
                <p className="text-sm text-muted-foreground">Henüz çevrimiçi kişi yok</p>
              </div>
            )}

            <div className="p-3 border-t border-border">
              <Button
                variant="outline"
                className="w-full text-sm"
                onClick={() => {
                  setIsOpen(false);
                  setTimeout(() => {
                    setLocation("/os/communications");
                  }, 400);
                }}
                data-testid="button-open-full-communications"
              >
                Tüm Mesajları Aç
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
