import { useState } from "react";
import {
  CreditCard,
  Plus,
  Eye,
  EyeOff,
  Copy,
  MoreHorizontal,
  Snowflake,
  Settings,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SiVisa, SiMastercard } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";

interface PaymentCard {
  id: string;
  type: "physical" | "virtual";
  brand: "visa" | "mastercard";
  last4: string;
  expiryMonth: string;
  expiryYear: string;
  holderName: string;
  status: "active" | "frozen" | "expired";
  limit: number;
  spent: number;
  linkedWallet?: string;
}

const mockCards: PaymentCard[] = [
  {
    id: "card-1",
    type: "physical",
    brand: "visa",
    last4: "4523",
    expiryMonth: "12",
    expiryYear: "26",
    holderName: "AHMET YILMAZ",
    status: "active",
    limit: 50000,
    spent: 12500,
    linkedWallet: "TL Hesabı",
  },
  {
    id: "card-2",
    type: "virtual",
    brand: "mastercard",
    last4: "8891",
    expiryMonth: "08",
    expiryYear: "25",
    holderName: "AHMET YILMAZ",
    status: "active",
    limit: 25000,
    spent: 3200,
    linkedWallet: "USD Hesabı",
  },
  {
    id: "card-3",
    type: "virtual",
    brand: "visa",
    last4: "2156",
    expiryMonth: "03",
    expiryYear: "24",
    holderName: "AHMET YILMAZ",
    status: "expired",
    limit: 10000,
    spent: 0,
  },
];

export function CardsPanel() {
  const [cards, setCards] = useState<PaymentCard[]>(mockCards);
  const [selectedCard, setSelectedCard] = useState<PaymentCard | null>(null);
  const [showCardNumber, setShowCardNumber] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("physical");
  const { toast } = useToast();

  const physicalCards = cards.filter((c) => c.type === "physical");
  const virtualCards = cards.filter((c) => c.type === "virtual");

  const getBrandIcon = (brand: string) => {
    if (brand === "visa") {
      return <SiVisa className="w-5 h-3 text-blue-600" />;
    }
    return <SiMastercard className="w-5 h-3 text-orange-500" />;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge variant="outline" className="text-status-online text-[9px] px-1 py-0">Aktif</Badge>;
      case "frozen":
        return <Badge variant="outline" className="text-blue-500 text-[9px] px-1 py-0">Donduruldu</Badge>;
      case "expired":
        return <Badge variant="outline" className="text-destructive text-[9px] px-1 py-0">Süresi Doldu</Badge>;
      default:
        return null;
    }
  };

  const handleCopyCardNumber = () => {
    if (selectedCard) {
      navigator.clipboard.writeText(`**** **** **** ${selectedCard.last4}`);
      toast({
        title: "Kopyalandı",
        description: "Kart numarası panoya kopyalandı",
      });
    }
  };

  const handleFreezeCard = (cardId: string) => {
    setCards(cards.map(c => 
      c.id === cardId 
        ? { ...c, status: c.status === "frozen" ? "active" : "frozen" } 
        : c
    ));
    toast({
      title: "Kart Güncellendi",
      description: "Kart durumu değiştirildi",
    });
  };

  const renderCardItem = (card: PaymentCard) => (
    <div
      key={card.id}
      className={`p-2 rounded-md border cursor-pointer transition-all ${
        selectedCard?.id === card.id
          ? "border-primary bg-primary/5"
          : "border-border hover-elevate"
      }`}
      onClick={() => setSelectedCard(card)}
      data-testid={`card-item-${card.id}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className="w-7 h-7 rounded bg-gradient-to-br from-slate-800 to-slate-600 flex items-center justify-center">
            <CreditCard className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-1">
              {getBrandIcon(card.brand)}
              <span className="text-[11px] font-medium" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                •••• {card.last4}
              </span>
            </div>
            <p className="text-[9px] text-muted-foreground">{card.linkedWallet || "Bağlı Hesap Yok"}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {getStatusBadge(card.status)}
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button size="icon" variant="ghost" className="h-5 w-5">
                <MoreHorizontal className="w-2.5 h-2.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSelectedCard(card)}>
                <Eye className="w-3 h-3 mr-1.5" />
                Detaylar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleFreezeCard(card.id)}>
                <Snowflake className="w-3 h-3 mr-1.5" />
                {card.status === "frozen" ? "Aktif Et" : "Dondur"}
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Settings className="w-3 h-3 mr-1.5" />
                Ayarlar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <Card data-testid="card-cards-panel">
        <CardHeader className="p-2.5 pb-1.5 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-xs font-medium flex items-center gap-1.5" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 400 }}>
            <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />
            Kartlarım
          </CardTitle>
          <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setAddDialogOpen(true)} data-testid="button-add-card">
            <Plus className="w-3 h-3 mr-0.5" />
            Ekle
          </Button>
        </CardHeader>
        <CardContent className="p-2.5 pt-0 space-y-2">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2 h-7">
              <TabsTrigger value="physical" className="text-[10px]" data-testid="tab-physical-cards">
                Fiziksel ({physicalCards.length})
              </TabsTrigger>
              <TabsTrigger value="virtual" className="text-[10px]" data-testid="tab-virtual-cards">
                Sanal ({virtualCards.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="physical" className="mt-1.5 space-y-1.5">
              {physicalCards.length > 0 ? (
                physicalCards.map(renderCardItem)
              ) : (
                <div className="text-center py-3 text-[10px] text-muted-foreground">
                  Fiziksel kart bulunamadı
                </div>
              )}
            </TabsContent>

            <TabsContent value="virtual" className="mt-1.5 space-y-1.5">
              {virtualCards.length > 0 ? (
                virtualCards.map(renderCardItem)
              ) : (
                <div className="text-center py-3 text-[10px] text-muted-foreground">
                  Sanal kart bulunamadı
                </div>
              )}
            </TabsContent>
          </Tabs>

          {selectedCard && (
            <div className="pt-1.5 border-t space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">Kart Detayları</span>
                <Button 
                  size="icon" 
                  variant="ghost" 
                  className="h-5 w-5"
                  onClick={() => setSelectedCard(null)}
                  data-testid="button-close-card-details"
                >
                  <span className="text-[10px]">×</span>
                </Button>
              </div>
              
              <div className="p-2 rounded-md bg-gradient-to-br from-slate-800 to-slate-600 text-white">
                <div className="flex items-center justify-between mb-2">
                  {getBrandIcon(selectedCard.brand)}
                  {getStatusBadge(selectedCard.status)}
                </div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span 
                    className="text-[11px] tracking-wider" 
                    style={{ fontFamily: 'JetBrains Mono, monospace' }}
                    data-testid="text-card-number"
                  >
                    {showCardNumber ? `•••• •••• •••• ${selectedCard.last4}` : "•••• •••• •••• ••••"}
                  </span>
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="h-4 w-4 text-white/70 hover:text-white"
                    onClick={() => setShowCardNumber(!showCardNumber)}
                    data-testid="button-toggle-card-number"
                  >
                    {showCardNumber ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </Button>
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="h-5 w-5 text-white/70 hover:text-white"
                    onClick={handleCopyCardNumber}
                    data-testid="button-copy-card-number"
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-white/70">{selectedCard.holderName}</span>
                  <span className="text-white/70">{selectedCard.expiryMonth}/{selectedCard.expiryYear}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                <div className="p-1.5 rounded bg-muted/50">
                  <span className="text-muted-foreground">Limit</span>
                  <p className="font-medium text-[11px]">₺{selectedCard.limit.toLocaleString("tr-TR")}</p>
                </div>
                <div className="p-1.5 rounded bg-muted/50">
                  <span className="text-muted-foreground">Harcanan</span>
                  <p className="font-medium text-[11px]">₺{selectedCard.spent.toLocaleString("tr-TR")}</p>
                </div>
              </div>

              <div className="flex gap-1.5">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1 h-6 text-[10px]"
                  onClick={() => handleFreezeCard(selectedCard.id)}
                  data-testid="button-freeze-card"
                >
                  <Snowflake className="w-3 h-3 mr-0.5" />
                  {selectedCard.status === "frozen" ? "Aktif Et" : "Dondur"}
                </Button>
                <Button variant="outline" size="sm" className="flex-1 h-6 text-[10px]" data-testid="button-card-settings">
                  <Settings className="w-3 h-3 mr-0.5" />
                  Ayarlar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 400 }}>
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                Yeni Kart Ekle
              </div>
            </DialogTitle>
            <DialogDescription style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 300 }}>
              Fiziksel veya sanal kartınızı ekleyin
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-xs">Kart Türü</Label>
              <Select defaultValue="physical">
                <SelectTrigger data-testid="select-card-type">
                  <SelectValue placeholder="Kart türü seçin" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="physical">Fiziksel Kart</SelectItem>
                  <SelectItem value="virtual">Sanal Kart</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Kart Numarası</Label>
              <Input 
                placeholder="1234 5678 9012 3456" 
                className="font-mono"
                data-testid="input-card-number"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Son Kullanma</Label>
                <Input 
                  placeholder="MM/YY" 
                  className="font-mono"
                  data-testid="input-card-expiry"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">CVV</Label>
                <Input 
                  placeholder="123" 
                  type="password"
                  className="font-mono"
                  data-testid="input-card-cvv"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Kart Sahibi</Label>
              <Input 
                placeholder="AD SOYAD" 
                className="uppercase"
                data-testid="input-card-holder"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Bağlı Cüzdan</Label>
              <Select>
                <SelectTrigger data-testid="select-linked-wallet">
                  <SelectValue placeholder="Cüzdan seçin (opsiyonel)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="wallet-1">TL Hesabı</SelectItem>
                  <SelectItem value="wallet-2">USD Hesabı</SelectItem>
                  <SelectItem value="wallet-3">EUR Hesabı</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)} data-testid="button-cancel-add-card">
              İptal
            </Button>
            <Button onClick={() => {
              toast({
                title: "Kart Eklendi",
                description: "Yeni kartınız başarıyla eklendi",
              });
              setAddDialogOpen(false);
            }} data-testid="button-save-card">
              Kartı Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
