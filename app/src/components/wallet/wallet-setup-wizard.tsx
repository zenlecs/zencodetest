import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Wallet,
  DollarSign,
  Building2,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Coins,
  Eye,
  EyeOff,
  Download,
  Shield,
  AlertTriangle,
  Copy,
  Check,
  Lock,
  Key,
  Globe,
} from "lucide-react";
import {
  SiBitcoin,
  SiEthereum,
  SiTether,
  SiBinance,
  SiPolygon,
} from "react-icons/si";
import { useCreateWallet } from "@/hooks/use-api";
import { useToast } from "@/hooks/use-toast";
import {
  generateNewMnemonic,
  deriveWalletsFromMnemonic,
  encryptVault,
  downloadEncryptedBackup,
  saveVaultToStorage,
  getRandomVerificationIndices,
  AVAILABLE_TOKENS,
  type WalletVault,
  type DerivedWallet,
} from "@/lib/crypto-wallet";

interface WalletSetupWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletType: "fiat" | "crypto";
}

const fiatProviders = [
  { id: "stripe", name: "Stripe", description: "Global ödeme altyapısı ile bağlanın", icon: Globe, badge: null },
  { id: "cenoa", name: "Cenoa", description: "ABD merkezli ödeme çözümü", icon: DollarSign, badge: "🇺🇸" },
];

const fiatCurrencies = [
  { code: "TRY", name: "Türk Lirası", symbol: "₺" },
  { code: "USD", name: "Amerikan Doları", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "İngiliz Sterlini", symbol: "£" },
];

const getTokenIcon = (code: string, size: "sm" | "md" = "md") => {
  const iconClass = size === "sm" ? "w-2.5 h-2.5 text-white" : "w-4 h-4 text-white";
  const textClass = size === "sm" ? "text-[8px] font-bold text-white" : "text-xs font-bold text-white";
  switch (code) {
    case "BTC": return <SiBitcoin className={iconClass} />;
    case "ETH": return <SiEthereum className={iconClass} />;
    case "USDT": return <SiTether className={iconClass} />;
    case "USDC": return <DollarSign className={iconClass} />;
    case "BNB": return <SiBinance className={iconClass} />;
    case "MATIC": return <SiPolygon className={iconClass} />;
    case "AVAX": return <span className={textClass}>A</span>;
    case "ARB": return <span className={textClass}>A</span>;
    default: return <Coins className={iconClass} />;
  }
};

export function WalletSetupWizard({ open, onOpenChange, walletType }: WalletSetupWizardProps) {
  const [step, setStep] = useState(1);
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [selectedCurrency, setSelectedCurrency] = useState<string>("");
  const [selectedTokens, setSelectedTokens] = useState<string[]>(["ETH", "BTC", "USDT"]);
  const [walletName, setWalletName] = useState("");
  const [iban, setIban] = useState("");
  const [initialBalance, setInitialBalance] = useState("");
  
  const [mnemonic, setMnemonic] = useState<string>("");
  const [mnemonicWords, setMnemonicWords] = useState<string[]>([]);
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [mnemonicCopied, setMnemonicCopied] = useState(false);
  const [verificationIndices, setVerificationIndices] = useState<number[]>([]);
  const [verificationAnswers, setVerificationAnswers] = useState<Record<number, string>>({});
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [derivedWallets, setDerivedWallets] = useState<DerivedWallet[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [backupDownloaded, setBackupDownloaded] = useState(false);
  
  const createWallet = useCreateWallet();
  const { toast } = useToast();

  useEffect(() => {
    if (open && walletType === "crypto" && step === 1) {
      const newMnemonic = generateNewMnemonic(12);
      setMnemonic(newMnemonic);
      setMnemonicWords(newMnemonic.split(" "));
      setVerificationIndices(getRandomVerificationIndices(12, 3));
    }
  }, [open, walletType, step]);

  const resetForm = () => {
    setStep(1);
    setSelectedProvider("");
    setSelectedCurrency("");
    setSelectedTokens(["ETH", "BTC", "USDT"]);
    setWalletName("");
    setIban("");
    setInitialBalance("");
    setMnemonic("");
    setMnemonicWords([]);
    setShowMnemonic(false);
    setMnemonicCopied(false);
    setVerificationIndices([]);
    setVerificationAnswers({});
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setDerivedWallets([]);
    setIsCreating(false);
    setBackupDownloaded(false);
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const toggleToken = (code: string) => {
    setSelectedTokens(prev => 
      prev.includes(code) 
        ? prev.filter(t => t !== code)
        : [...prev, code]
    );
  };

  const copyMnemonic = async () => {
    await navigator.clipboard.writeText(mnemonic);
    setMnemonicCopied(true);
    setTimeout(() => setMnemonicCopied(false), 2000);
    toast({
      title: "Kopyalandı",
      description: "Recovery key panoya kopyalandı",
    });
  };

  const verifyMnemonic = (): boolean => {
    for (const idx of verificationIndices) {
      if (verificationAnswers[idx]?.toLowerCase().trim() !== mnemonicWords[idx]?.toLowerCase()) {
        return false;
      }
    }
    return true;
  };

  const handleCryptoCreate = async () => {
    if (!verifyMnemonic()) {
      toast({
        title: "Doğrulama Hatası",
        description: "Recovery key doğrulaması başarısız. Lütfen kelimeleri kontrol edin.",
        variant: "destructive",
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "Şifre Hatası",
        description: "Şifreler eşleşmiyor.",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 8) {
      toast({
        title: "Zayıf Şifre",
        description: "Şifre en az 8 karakter olmalıdır.",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);

    try {
      const wallets = await deriveWalletsFromMnemonic(mnemonic, selectedTokens);
      setDerivedWallets(wallets);

      const vault: WalletVault = {
        mnemonic,
        wallets,
        createdAt: new Date().toISOString(),
      };

      await saveVaultToStorage(vault, password);

      for (const wallet of wallets) {
        await createWallet.mutateAsync({
          userId: "user-1",
          name: wallet.name,
          type: "crypto",
          currency: wallet.currency,
          balance: 0,
          icon: wallet.icon,
          address: wallet.address,
          isSetup: true,
          source: "generated",
          derivationPath: wallet.derivationPath,
          color: wallet.color,
        });
      }

      setStep(4);
      toast({
        title: "Cüzdanlar Oluşturuldu",
        description: `${wallets.length} kripto cüzdanı başarıyla oluşturuldu.`,
      });
    } catch (error) {
      toast({
        title: "Hata",
        description: "Cüzdan oluşturulurken bir hata oluştu.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleDownloadBackup = async () => {
    try {
      const vault: WalletVault = {
        mnemonic,
        wallets: derivedWallets,
        createdAt: new Date().toISOString(),
      };
      const encrypted = await encryptVault(vault, password);
      downloadEncryptedBackup(encrypted, `zenwallet-backup-${Date.now()}`);
      setBackupDownloaded(true);
      toast({
        title: "Yedek İndirildi",
        description: ".enc dosyası güvenli bir yerde saklayın.",
      });
    } catch (error) {
      toast({
        title: "Hata",
        description: "Yedek dosyası oluşturulamadı.",
        variant: "destructive",
      });
    }
  };

  const handleFiatSubmit = async () => {
    if (!selectedCurrency || !walletName) return;

    const currency = fiatCurrencies.find(c => c.code === selectedCurrency);
    
    await createWallet.mutateAsync({
      userId: "user-1",
      name: walletName,
      type: "fiat",
      currency: selectedCurrency,
      balance: parseFloat(initialBalance) || 0,
      icon: currency?.symbol || "$",
      isSetup: true,
      provider: selectedProvider,
      source: "tracking",
    });

    handleClose();
  };

  const renderCryptoStep1 = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
        <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
        <p className="text-xs text-amber-600 dark:text-amber-400" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 300 }}>
          Bu 12 kelimeyi güvenli bir yerde saklayın. Kaybetmeniz durumunda cüzdanınıza erişiminizi kalıcı olarak kaybedersiniz.
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Recovery Key (Kurtarma Anahtarı)</Label>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowMnemonic(!showMnemonic)}
              data-testid="button-toggle-mnemonic"
            >
              {showMnemonic ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={copyMnemonic}
              data-testid="button-copy-mnemonic"
            >
              {mnemonicCopied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {mnemonicWords.map((word, idx) => (
            <Card
              key={idx}
              className="p-2 text-center bg-muted/50"
              data-testid={`mnemonic-word-${idx}`}
            >
              <span className="text-xs text-muted-foreground mr-1">{idx + 1}.</span>
              <span className="text-sm font-mono" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 400 }}>
                {showMnemonic ? word : "••••"}
              </span>
            </Card>
          ))}
        </div>
      </div>

      <div className="space-y-3 pt-2">
        <Label className="text-sm font-medium">Cüzdanlara Eklenecek Tokenler</Label>
        <div className="grid grid-cols-2 gap-2">
          {AVAILABLE_TOKENS.map((token) => (
            <Card
              key={token.code}
              className={`p-2.5 cursor-pointer transition-all hover-elevate ${
                selectedTokens.includes(token.code) 
                  ? "ring-2 ring-primary bg-primary/5" 
                  : ""
              }`}
              onClick={() => toggleToken(token.code)}
              data-testid={`token-${token.code.toLowerCase()}`}
            >
              <div className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${token.color} flex items-center justify-center`}>
                  {getTokenIcon(token.code)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 400 }}>{token.name}</p>
                  <p className="text-[10px] text-muted-foreground">{token.code}</p>
                </div>
                {selectedTokens.includes(token.code) && (
                  <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );

  const renderCryptoStep2 = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20">
        <Shield className="w-5 h-5 text-primary flex-shrink-0" />
        <p className="text-xs text-foreground/80" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 300 }}>
          Kurtarma anahtarınızı doğrulamak için aşağıdaki kelimeleri girin.
        </p>
      </div>

      <div className="space-y-4">
        {verificationIndices.map((idx) => (
          <div key={idx} className="space-y-2">
            <Label htmlFor={`verify-${idx}`} className="text-sm">
              Kelime #{idx + 1}
            </Label>
            <Input
              id={`verify-${idx}`}
              type="text"
              placeholder={`${idx + 1}. kelimeyi girin`}
              value={verificationAnswers[idx] || ""}
              onChange={(e) => setVerificationAnswers(prev => ({ ...prev, [idx]: e.target.value }))}
              className="font-mono"
              data-testid={`input-verify-${idx}`}
            />
          </div>
        ))}
      </div>
    </div>
  );

  const renderCryptoStep3 = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20">
        <Lock className="w-5 h-5 text-primary flex-shrink-0" />
        <p className="text-xs text-foreground/80" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 300 }}>
          Cüzdanınızı korumak için güçlü bir şifre belirleyin. Bu şifre yerel şifreleme için kullanılacaktır.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">Şifre</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="En az 8 karakter"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-10"
              data-testid="input-password"
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted transition-colors"
              onClick={() => setShowPassword(!showPassword)}
              data-testid="button-toggle-password"
            >
              {showPassword ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm-password">Şifre Tekrar</Label>
          <div className="relative">
            <Input
              id="confirm-password"
              type={showPassword ? "text" : "password"}
              placeholder="Şifreyi tekrar girin"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="pr-10"
              data-testid="input-confirm-password"
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted transition-colors"
              onClick={() => setShowPassword(!showPassword)}
              data-testid="button-toggle-confirm-password"
            >
              {showPassword ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
            </button>
          </div>
        </div>

        {password && confirmPassword && password !== confirmPassword && (
          <p className="text-xs text-destructive">Şifreler eşleşmiyor</p>
        )}

        <Card className="p-3 bg-muted/30">
          <div className="flex items-start gap-3">
            <Key className="w-4 h-4 text-muted-foreground mt-0.5" />
            <div>
              <p className="text-xs text-muted-foreground" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 300 }}>
                Oluşturulacak cüzdanlar:
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {selectedTokens.map((code) => {
                  const token = AVAILABLE_TOKENS.find(t => t.code === code);
                  return (
                    <Badge key={code} variant="secondary" className="text-xs flex items-center gap-1">
                      <span className={`w-3.5 h-3.5 rounded bg-gradient-to-br ${token?.color} flex items-center justify-center`}>
                        {getTokenIcon(code, "sm")}
                      </span>
                      {token?.code}
                    </Badge>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );

  const renderCryptoStep4 = () => (
    <div className="space-y-4">
      <div className="flex flex-col items-center text-center py-4">
        <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
          <CheckCircle2 className="w-8 h-8 text-green-500" />
        </div>
        <h3 className="text-lg font-medium" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 400 }}>
          Cüzdanlarınız Hazır
        </h3>
        <p className="text-sm text-muted-foreground mt-1" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 300 }}>
          {derivedWallets.length} kripto cüzdanı başarıyla oluşturuldu
        </p>
      </div>

      <div className="space-y-2 max-h-[200px] overflow-y-auto">
        {derivedWallets.map((wallet) => (
          <Card key={wallet.currency} className="p-3">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${wallet.color} flex items-center justify-center`}>
                {getTokenIcon(wallet.currency)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 400 }}>{wallet.name}</p>
                <p className="text-xs text-muted-foreground font-mono truncate">{wallet.address}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-4 bg-amber-500/10 border-amber-500/20">
        <div className="flex items-start gap-3">
          <Download className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 400 }}>
              Yedek Dosyasını İndirin
            </p>
            <p className="text-xs text-muted-foreground mt-1" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 300 }}>
              Şifrelenmiş .enc dosyasını güvenli bir yerde saklayın. Bu dosya ile cüzdanlarınızı geri yükleyebilirsiniz.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={handleDownloadBackup}
              data-testid="button-download-backup"
            >
              <Download className="w-4 h-4 mr-2" />
              {backupDownloaded ? "Tekrar İndir" : ".enc Yedek İndir"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );

  const renderFiatStep1 = () => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 300 }}>
        Fiat cüzdanınızı nasıl kurmak istediğinizi seçin
      </p>
      <div className="grid gap-3">
        {fiatProviders.map((provider) => (
          <Card
            key={provider.id}
            className={`p-4 cursor-pointer transition-all hover-elevate ${
              selectedProvider === provider.id 
                ? "ring-2 ring-primary bg-primary/5" 
                : ""
            }`}
            onClick={() => setSelectedProvider(provider.id)}
            data-testid={`provider-${provider.id}`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <provider.icon className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-medium" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 400 }}>{provider.name}</p>
                <p className="text-xs text-muted-foreground" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 300 }}>{provider.description}</p>
              </div>
              <div className="flex items-center gap-2">
                {provider.badge && (
                  <span className="text-xl">{provider.badge}</span>
                )}
                {!provider.badge && provider.id === "stripe" && (
                  <Globe className="w-5 h-5 text-muted-foreground" />
                )}
                {selectedProvider === provider.id && (
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );

  const renderFiatStep2 = () => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 300 }}>
        Cüzdan detaylarını girin
      </p>
      
      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="wallet-name">Cüzdan Adı</Label>
          <Input
            id="wallet-name"
            placeholder="Örn: Ana Hesabım"
            value={walletName}
            onChange={(e) => setWalletName(e.target.value)}
            data-testid="input-wallet-name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="currency">Para Birimi</Label>
          <Select value={selectedCurrency} onValueChange={setSelectedCurrency}>
            <SelectTrigger id="currency" data-testid="select-currency">
              <SelectValue placeholder="Para birimi seçin" />
            </SelectTrigger>
            <SelectContent>
              {fiatCurrencies.map((currency) => (
                <SelectItem key={currency.code} value={currency.code}>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{currency.symbol}</span>
                    <span>{currency.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedProvider === "bank" && (
          <div className="space-y-2">
            <Label htmlFor="iban">IBAN (Opsiyonel)</Label>
            <Input
              id="iban"
              placeholder="TR00 0000 0000 0000 0000 0000 00"
              value={iban}
              onChange={(e) => setIban(e.target.value)}
              data-testid="input-iban"
            />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="initial-balance">Başlangıç Bakiyesi</Label>
          <Input
            id="initial-balance"
            type="number"
            placeholder="0.00"
            value={initialBalance}
            onChange={(e) => setInitialBalance(e.target.value)}
            data-testid="input-initial-balance"
          />
        </div>
      </div>
    </div>
  );

  const isFiat = walletType === "fiat";
  const totalSteps = isFiat ? 2 : 4;

  const canProceed = () => {
    if (isFiat) {
      if (step === 1) return !!selectedProvider;
      if (step === 2) return !!walletName && !!selectedCurrency;
    } else {
      if (step === 1) return selectedTokens.length > 0 && mnemonicWords.length === 12;
      if (step === 2) return verificationIndices.every(idx => verificationAnswers[idx]?.trim());
      if (step === 3) return password.length >= 8 && password === confirmPassword;
      if (step === 4) return true;
    }
    return false;
  };

  const handleNext = () => {
    if (isFiat) {
      if (step < totalSteps) {
        setStep(step + 1);
      }
    } else {
      if (step === 3) {
        handleCryptoCreate();
      } else if (step < totalSteps) {
        setStep(step + 1);
      }
    }
  };

  const getStepTitle = () => {
    if (isFiat) {
      return step === 1 ? "Bağlantı Türü" : "Cüzdan Detayları";
    }
    switch (step) {
      case 1: return "Recovery Key & Token Seçimi";
      case 2: return "Doğrulama";
      case 3: return "Şifre Belirleme";
      case 4: return "Tamamlandı";
      default: return "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 400 }}>
            {isFiat ? (
              <>
                <DollarSign className="w-5 h-5 text-primary" />
                Fiat Cüzdan Kur
              </>
            ) : (
              <>
                <SiBitcoin className="w-5 h-5 text-amber-500" />
                Kripto Cüzdan Oluştur
              </>
            )}
          </DialogTitle>
          <DialogDescription style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 300 }}>
            {getStepTitle()} - Adım {step} / {totalSteps}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {isFiat ? (
            step === 1 ? renderFiatStep1() : renderFiatStep2()
          ) : (
            step === 1 ? renderCryptoStep1() :
            step === 2 ? renderCryptoStep2() :
            step === 3 ? renderCryptoStep3() :
            renderCryptoStep4()
          )}
        </div>

        <div className="flex items-center justify-between pt-4 border-t">
          {step < 4 || isFiat ? (
            <Button
              variant="ghost"
              onClick={() => step > 1 ? setStep(step - 1) : handleClose()}
              data-testid="button-wizard-back"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              {step > 1 ? "Geri" : "İptal"}
            </Button>
          ) : (
            <div />
          )}
          
          {isFiat ? (
            step < totalSteps ? (
              <Button
                onClick={handleNext}
                disabled={!canProceed()}
                data-testid="button-wizard-next"
              >
                İleri
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button
                onClick={handleFiatSubmit}
                disabled={!canProceed() || createWallet.isPending}
                data-testid="button-wizard-finish"
              >
                {createWallet.isPending ? "Oluşturuluyor..." : "Tamamla"}
                <CheckCircle2 className="w-4 h-4 ml-2" />
              </Button>
            )
          ) : (
            step < 4 ? (
              <Button
                onClick={handleNext}
                disabled={!canProceed() || isCreating}
                data-testid="button-wizard-next"
              >
                {isCreating ? "Oluşturuluyor..." : step === 3 ? "Cüzdanları Oluştur" : "İleri"}
                {!isCreating && (step === 3 ? <CheckCircle2 className="w-4 h-4 ml-2" /> : <ArrowRight className="w-4 h-4 ml-2" />)}
              </Button>
            ) : (
              <Button
                onClick={handleClose}
                data-testid="button-wizard-finish"
              >
                Kapat
                <CheckCircle2 className="w-4 h-4 ml-2" />
              </Button>
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
