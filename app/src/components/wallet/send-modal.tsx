import { useState } from "react";
import { ArrowUpRight, Wallet, User } from "lucide-react";
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

interface SendModalContentProps {
  onClose: () => void;
}

export function SendModalContent({ onClose }: SendModalContentProps) {
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [currency, setCurrency] = useState("TRY");

  const handleSend = () => {
    console.log("Sending:", { amount, recipient, currency });
    onClose();
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm text-muted-foreground">Alıcı</Label>
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Ad, IBAN veya cüzdan adresi"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            className="pl-10 h-11 rounded-xl border-0 bg-muted/50"
            data-testid="input-send-recipient"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm text-muted-foreground">Tutar</Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="pl-10 h-11 rounded-xl border-0 bg-muted/50"
              data-testid="input-send-amount"
            />
          </div>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger className="w-24 h-11 rounded-xl border-0 bg-muted/50" data-testid="select-send-currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="TRY" className="rounded-lg">TRY</SelectItem>
              <SelectItem value="USD" className="rounded-lg">USD</SelectItem>
              <SelectItem value="EUR" className="rounded-lg">EUR</SelectItem>
              <SelectItem value="BTC" className="rounded-lg">BTC</SelectItem>
              <SelectItem value="ETH" className="rounded-lg">ETH</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="pt-2 space-y-2">
        <Button 
          className="w-full h-11 rounded-xl shadow-md"
          onClick={handleSend}
          disabled={!amount || !recipient}
          data-testid="button-confirm-send"
        >
          <ArrowUpRight className="w-4 h-4 mr-2" />
          Gönder
        </Button>
        <Button 
          variant="ghost" 
          className="w-full h-10 rounded-xl"
          onClick={onClose}
          data-testid="button-cancel-send"
        >
          İptal
        </Button>
      </div>
    </div>
  );
}
