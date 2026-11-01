import { useState, useEffect } from "react";
import {
  Calculator,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownLeft,
  Plus,
  Download,
  Search,
  Calendar,
  FileText,
  PieChart,
  BarChart3,
  Wallet,
  MoreHorizontal,
} from "lucide-react";
import { BentoCard } from "@/components/ui/bento-card";
import { StatTile } from "@/components/ui/stat-tile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useAccountingEntries, useCreateAccountingEntry, useDeleteAccountingEntry, useWallets } from "@/hooks/use-api";
import type { AccountingEntry } from "@shared/schema";

export default function AccountingPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [dateRange, setDateRange] = useState("month");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newEntryType, setNewEntryType] = useState<"income" | "expense">("income");
  const [newEntryCategory, setNewEntryCategory] = useState("income");
  const [newEntryDescription, setNewEntryDescription] = useState("");
  const [newEntryAmount, setNewEntryAmount] = useState("");
  const [newEntryWallet, setNewEntryWallet] = useState("");
  const [showTitle, setShowTitle] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => setShowTitle(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const { data: entries, isLoading: entriesLoading } = useAccountingEntries();
  const { data: wallets, isLoading: walletsLoading } = useWallets();
  const createEntry = useCreateAccountingEntry();
  const deleteEntry = useDeleteAccountingEntry();

  const incomeEntries = entries?.filter((e) => e.category === "income") || [];
  const expenseEntries = entries?.filter((e) => e.category === "expense") || [];
  
  const totalIncome = incomeEntries.reduce((sum, e) => sum + e.amount, 0);
  const totalExpense = expenseEntries.reduce((sum, e) => sum + e.amount, 0);
  const netProfit = totalIncome - totalExpense;

  const incomeByDescription = incomeEntries.reduce((acc, e) => {
    const key = e.description.includes("Vekalet") ? "Vekalet Ücreti" :
                e.description.includes("Danışmanlık") ? "Danışmanlık" :
                e.description.includes("Prim") ? "Prim/Bonus" : "Diğer";
    acc[key] = (acc[key] || 0) + e.amount;
    return acc;
  }, {} as Record<string, number>);

  const incomeCategories = Object.entries(incomeByDescription).map(([name, amount]: [string, any]) => ({
    name,
    amount,
    percentage: Math.round((amount / totalIncome) * 100) || 0,
    color: name === "Vekalet Ücreti" ? "bg-emerald-500" :
           name === "Danışmanlık" ? "bg-blue-500" :
           name === "Prim/Bonus" ? "bg-violet-500" : "bg-gray-500",
  }));

  const expenseByDescription = expenseEntries.reduce((acc, e) => {
    const key = e.description.includes("Ofis") || e.description.includes("Kira") ? "Ofis Giderleri" :
                e.description.includes("Harç") || e.description.includes("Mahkeme") ? "Mahkeme Harçları" :
                e.description.includes("Taksi") || e.description.includes("Ulaşım") ? "Ulaşım" : "Diğer";
    acc[key] = (acc[key] || 0) + e.amount;
    return acc;
  }, {} as Record<string, number>);

  const expenseCategories = Object.entries(expenseByDescription).map(([name, amount]: [string, any]) => ({
    name,
    amount,
    percentage: Math.round((amount / totalExpense) * 100) || 0,
    color: name === "Ofis Giderleri" ? "bg-rose-500" :
           name === "Mahkeme Harçları" ? "bg-amber-500" :
           name === "Ulaşım" ? "bg-cyan-500" : "bg-gray-500",
  }));

  const fiatWallets = wallets?.filter((w) => w.type === "fiat") || [];

  const handleCreateEntry = async () => {
    if (!newEntryDescription.trim() || !newEntryAmount) return;

    await createEntry.mutateAsync({
      category: newEntryType,
      description: newEntryDescription,
      amount: parseFloat(newEntryAmount),
      date: new Date().toISOString().split("T")[0],
      walletId: newEntryWallet || undefined,
      tags: [],
    });

    setNewEntryDescription("");
    setNewEntryAmount("");
    setNewEntryWallet("");
    setDialogOpen(false);
  };

  const handleDeleteEntry = async (id: string) => {
    await deleteEntry.mutateAsync(id);
  };

  const pendingInvoices = [
    { id: "1", client: "ABC Ltd.", amount: 5000, dueDate: "2024-01-15", status: "pending" },
    { id: "2", client: "XYZ Holding", amount: 3500, dueDate: "2024-01-20", status: "pending" },
  ];

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div
            className={`transition-all duration-700 ease-out ${
              showTitle ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            <h1 className="text-3xl font-bold tracking-tight" data-testid="text-accounting-title">Muhasebe</h1>
            <p className="text-muted-foreground">Finansal yönetim ve raporlama</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-36" data-testid="select-date-range">
                <Calendar className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Bu Hafta</SelectItem>
                <SelectItem value="month">Bu Ay</SelectItem>
                <SelectItem value="quarter">Bu Çeyrek</SelectItem>
                <SelectItem value="year">Bu Yıl</SelectItem>
              </SelectContent>
            </Select>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" data-testid="button-new-entry">
                  <Plus className="w-4 h-4 mr-2" />
                  Yeni Kayıt
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Yeni Muhasebe Kaydı</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Tür</Label>
                      <Select value={newEntryType} onValueChange={(v) => setNewEntryType(v as "income" | "expense")}>
                        <SelectTrigger data-testid="select-entry-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="income">Gelir</SelectItem>
                          <SelectItem value="expense">Gider</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Cüzdan</Label>
                      <Select value={newEntryWallet} onValueChange={setNewEntryWallet}>
                        <SelectTrigger data-testid="select-entry-wallet">
                          <SelectValue placeholder="Cüzdan Seç" />
                        </SelectTrigger>
                        <SelectContent>
                          {fiatWallets.map((w) => (
                            <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Açıklama</Label>
                    <Input
                      placeholder="İşlem açıklaması"
                      value={newEntryDescription}
                      onChange={(e) => setNewEntryDescription(e.target.value)}
                      data-testid="input-entry-description"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tutar (₺)</Label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={newEntryAmount}
                      onChange={(e) => setNewEntryAmount(e.target.value)}
                      data-testid="input-entry-amount"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>İptal</Button>
                    <Button
                      onClick={handleCreateEntry}
                      disabled={createEntry.isPending || !newEntryDescription.trim() || !newEntryAmount}
                      data-testid="button-save-entry"
                    >
                      {createEntry.isPending ? "Kaydediliyor..." : "Kaydet"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {entriesLoading ? (
            <>
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
            </>
          ) : (
            <>
              <StatTile
                label="Toplam Gelir"
                value={`₺${totalIncome.toLocaleString("tr-TR")}`}
                icon={<TrendingUp className="w-4 h-4 text-status-online" />}
                trend={{ value: 12, direction: "up" }}
                data-testid="stat-total-income"
              />
              <StatTile
                label="Toplam Gider"
                value={`₺${totalExpense.toLocaleString("tr-TR")}`}
                icon={<TrendingDown className="w-4 h-4 text-destructive" />}
                trend={{ value: 5, direction: "down" }}
                data-testid="stat-total-expense"
              />
              <StatTile
                label="Net Kâr"
                value={`₺${netProfit.toLocaleString("tr-TR")}`}
                icon={<Calculator className="w-4 h-4 text-primary" />}
                trend={{ value: 18, direction: "up" }}
                data-testid="stat-net-profit"
              />
              <StatTile
                label="Bekleyen Ödemeler"
                value={`₺${pendingInvoices.reduce((s, i) => s + i.amount, 0).toLocaleString("tr-TR")}`}
                icon={<Wallet className="w-4 h-4 text-amber-500" />}
                data-testid="stat-pending-payments"
              />
            </>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview" data-testid="tab-overview">
              <PieChart className="w-4 h-4 mr-2" />
              Genel Bakış
            </TabsTrigger>
            <TabsTrigger value="transactions" data-testid="tab-transactions">
              <BarChart3 className="w-4 h-4 mr-2" />
              İşlemler
            </TabsTrigger>
            <TabsTrigger value="invoices" data-testid="tab-invoices">
              <FileText className="w-4 h-4 mr-2" />
              Faturalar
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <BentoCard
                title="Gelir Dağılımı"
                icon={<ArrowDownLeft className="w-4 h-4 text-status-online" />}
                data-testid="card-income-distribution"
              >
                {incomeCategories.length > 0 ? (
                  <div className="space-y-4">
                    {incomeCategories.map((cat) => (
                      <div key={cat.name} className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{cat.name}</span>
                          <span className="text-muted-foreground font-price">
                            ₺{(cat.amount as number).toLocaleString("tr-TR")} ({cat.percentage}%)
                          </span>
                        </div>
                        <Progress value={cat.percentage} className={`h-2 ${cat.color}`} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    Henüz gelir kaydı yok
                  </div>
                )}
              </BentoCard>

              <BentoCard
                title="Gider Dağılımı"
                icon={<ArrowUpRight className="w-4 h-4 text-destructive" />}
                data-testid="card-expense-distribution"
              >
                {expenseCategories.length > 0 ? (
                  <div className="space-y-4">
                    {expenseCategories.map((cat) => (
                      <div key={cat.name} className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{cat.name}</span>
                          <span className="text-muted-foreground font-price">
                            ₺{(cat.amount as number).toLocaleString("tr-TR")} ({cat.percentage}%)
                          </span>
                        </div>
                        <Progress value={cat.percentage} className={`h-2 ${cat.color}`} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    Henüz gider kaydı yok
                  </div>
                )}
              </BentoCard>
            </div>

            <BentoCard
              title="E-Wallet Bağlantısı"
              icon={<Wallet className="w-4 h-4" />}
              data-testid="card-wallet-connection"
            >
              {walletsLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Skeleton className="h-24 rounded-xl" />
                  <Skeleton className="h-24 rounded-xl" />
                  <Skeleton className="h-24 rounded-xl" />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {fiatWallets.map((wallet) => (
                    <div
                      key={wallet.id}
                      className={`p-4 rounded-xl border ${
                        wallet.currency === "TRY" ? "bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/20" :
                        wallet.currency === "USD" ? "bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20" :
                        "bg-gradient-to-br from-violet-500/10 to-violet-500/5 border-violet-500/20"
                      }`}
                      data-testid={`wallet-link-${wallet.id}`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg font-bold">{wallet.icon}</span>
                        <span className="text-sm text-muted-foreground">{wallet.name}</span>
                      </div>
                      <p className="text-xl font-price">
                        {wallet.currency === "TRY" ? "₺" : wallet.currency === "USD" ? "$" : "€"}
                        {wallet.balance.toLocaleString("tr-TR")}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {wallet.currency === "TRY" ? "Ana hesap" : wallet.currency === "USD" ? "Uluslararası" : "Avrupa işlemleri"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </BentoCard>
          </TabsContent>

          <TabsContent value="transactions" className="space-y-4">
            <BentoCard span="full" data-testid="card-all-transactions">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input placeholder="İşlem ara..." className="pl-9" data-testid="input-search-accounting" />
                  </div>
                  <Select defaultValue="all">
                    <SelectTrigger className="w-32" data-testid="select-filter-type">
                      <SelectValue placeholder="Tür" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tümü</SelectItem>
                      <SelectItem value="income">Gelir</SelectItem>
                      <SelectItem value="expense">Gider</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" size="sm" data-testid="button-export-accounting">
                  <Download className="w-4 h-4 mr-2" />
                  Dışa Aktar
                </Button>
              </div>

              {entriesLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-20 rounded-lg" />
                  <Skeleton className="h-20 rounded-lg" />
                  <Skeleton className="h-20 rounded-lg" />
                </div>
              ) : entries && entries.length > 0 ? (
                <div className="space-y-2">
                  {entries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between p-4 rounded-lg bg-muted/30 hover-elevate"
                      data-testid={`entry-${entry.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          entry.category === "income" ? "bg-status-online/10" : "bg-destructive/10"
                        }`}>
                          {entry.category === "income" ? (
                            <ArrowDownLeft className="w-5 h-5 text-status-online" />
                          ) : (
                            <ArrowUpRight className="w-5 h-5 text-destructive" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{entry.description}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{entry.category === "income" ? "Gelir" : "Gider"}</span>
                            <span>•</span>
                            <span>{entry.date}</span>
                          </div>
                          {entry.tags && entry.tags.length > 0 && (
                            <div className="flex gap-1 mt-1">
                              {entry.tags.map((tag: string) => (
                                <Badge key={tag} variant="secondary" className="text-xs px-1.5 py-0">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`font-price ${
                          entry.category === "income" ? "text-status-online" : "text-destructive"
                        }`}>
                          {entry.category === "income" ? "+" : "-"}₺{entry.amount.toLocaleString("tr-TR")}
                        </span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" data-testid={`button-entry-menu-${entry.id}`}>
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>Düzenle</DropdownMenuItem>
                            <DropdownMenuItem>Fatura Oluştur</DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleDeleteEntry(entry.id)}
                            >
                              Sil
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Calculator className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Henüz kayıt bulunmuyor</p>
                  <p className="text-sm">Yeni kayıt eklemek için yukarıdaki butonu kullanın</p>
                </div>
              )}
            </BentoCard>
          </TabsContent>

          <TabsContent value="invoices" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Faturalar</h2>
              <Button size="sm" data-testid="button-new-invoice">
                <Plus className="w-4 h-4 mr-2" />
                Yeni Fatura
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pendingInvoices.map((invoice) => (
                <BentoCard key={invoice.id} interactive data-testid={`invoice-${invoice.id}`}>
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-primary" />
                    </div>
                    <Badge variant="outline" className="text-amber-600">Beklemede</Badge>
                  </div>
                  <h3 className="font-semibold mb-1">{invoice.client}</h3>
                  <p className="text-2xl font-price mb-2">₺{invoice.amount.toLocaleString("tr-TR")}</p>
                  <p className="text-xs text-muted-foreground">Vade: {invoice.dueDate}</p>
                  <div className="flex gap-2 mt-4">
                    <Button size="sm" variant="outline" className="flex-1" data-testid={`button-view-invoice-${invoice.id}`}>
                      Görüntüle
                    </Button>
                    <Button size="sm" className="flex-1" data-testid={`button-remind-invoice-${invoice.id}`}>
                      Hatırlat
                    </Button>
                  </div>
                </BentoCard>
              ))}
              <BentoCard
                interactive
                className="border-dashed flex items-center justify-center min-h-[200px]"
                data-testid="button-create-invoice"
              >
                <div className="text-center">
                  <Plus className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm font-medium">Yeni Fatura</p>
                  <p className="text-xs text-muted-foreground">Fatura oluşturmak için tıklayın</p>
                </div>
              </BentoCard>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </ScrollArea>
  );
}
