import { useState } from "react";
import { ArrowDownLeft, Copy, Check, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ReceiveModalContentProps {
  onClose: () => void;
}

export function ReceiveModalContent({ onClose }: ReceiveModalContentProps) {
  const [currency, setCurrency] = useState("TRY");
  const [copied, setCopied] = useState(false);

  const addresses: Record<string, string> = {
    TRY: "TR12 0001 0012 3456 7890 1234 56",
    USD: "TR98 0001 0055 1234 5678 9012 34",
    EUR: "TR76 0001 0033 9876 5432 1098 76",
    BTC: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
    ETH: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(addresses[currency]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm text-muted-foreground">Para Birimi</Label>
        <Select value={currency} onValueChange={setCurrency}>
          <SelectTrigger className="w-full h-11 rounded-xl border-0 bg-muted/50" data-testid="select-receive-currency">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="TRY" className="rounded-lg">TRY - Türk Lirası</SelectItem>
            <SelectItem value="USD" className="rounded-lg">USD - Amerikan Doları</SelectItem>
            <SelectItem value="EUR" className="rounded-lg">EUR - Euro</SelectItem>
            <SelectItem value="BTC" className="rounded-lg">BTC - Bitcoin</SelectItem>
            <SelectItem value="ETH" className="rounded-lg">ETH - Ethereum</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="p-4 rounded-xl bg-muted/30 space-y-3">
        <div className="flex items-center justify-center">
          <div className="w-24 h-24 rounded-xl bg-white flex items-center justify-center">
            <QrCode className="w-16 h-16 text-foreground" />
          </div>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground mb-1">
            {currency === "BTC" || currency === "ETH" ? "Cüzdan Adresi" : "IBAN"}
          </p>
          <p className="text-xs font-mono break-all" data-testid="text-receive-address">
            {addresses[currency]}
          </p>
        </div>
      </div>

      <div className="pt-2 space-y-2">
        <Button 
          variant="outline"
          className="w-full h-11 rounded-xl"
          onClick={handleCopy}
          data-testid="button-copy-address"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 mr-2 text-emerald-500" />
              Kopyalandı
            </>
          ) : (
            <>
              <Copy className="w-4 h-4 mr-2" />
              Adresi Kopyala
            </>
          )}
        </Button>
        <Button 
          variant="ghost" 
          className="w-full h-10 rounded-xl"
          onClick={onClose}
          data-testid="button-close-receive"
        >
          Kapat
        </Button>
      </div>
    </div>
  );
}
