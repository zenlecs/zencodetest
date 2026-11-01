import { Shield, Lock, ShieldCheck, ShieldAlert, Key, Fingerprint } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface SecurityBadgeProps {
  type: "e2e" | "encrypted" | "secure" | "verified" | "2fa" | "biometric";
  size?: "sm" | "default" | "lg";
  showLabel?: boolean;
  className?: string;
}

const securityConfig = {
  e2e: {
    icon: Shield,
    label: "E2E Şifreli",
    description: "Uçtan uca şifreleme ile korunuyor",
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
  },
  encrypted: {
    icon: Lock,
    label: "AES-256",
    description: "AES-256-GCM ile şifreli",
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
  },
  secure: {
    icon: ShieldCheck,
    label: "Güvenli",
    description: "Güvenli bağlantı",
    color: "text-primary",
    bgColor: "bg-primary/10",
  },
  verified: {
    icon: ShieldCheck,
    label: "Doğrulanmış",
    description: "Kimlik doğrulandı",
    color: "text-green-500",
    bgColor: "bg-green-500/10",
  },
  "2fa": {
    icon: Key,
    label: "2FA",
    description: "İki faktörlü kimlik doğrulama aktif",
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
  },
  biometric: {
    icon: Fingerprint,
    label: "Biyometrik",
    description: "Biyometrik kimlik doğrulama",
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
  },
};

const sizeConfig = {
  sm: {
    icon: "w-3 h-3",
    text: "text-xs",
    badge: "px-1.5 py-0.5",
  },
  default: {
    icon: "w-4 h-4",
    text: "text-sm",
    badge: "px-2 py-1",
  },
  lg: {
    icon: "w-5 h-5",
    text: "text-base",
    badge: "px-3 py-1.5",
  },
};

export function SecurityBadge({
  type,
  size = "default",
  showLabel = true,
  className,
}: SecurityBadgeProps) {
  const config = securityConfig[type];
  const sizeStyles = sizeConfig[size];
  const Icon = config.icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="secondary"
          className={cn(
            "cursor-default gap-1",
            config.bgColor,
            sizeStyles.badge,
            className
          )}
          data-testid={`security-badge-${type}`}
        >
          <Icon className={cn(sizeStyles.icon, config.color)} />
          {showLabel && (
            <span className={cn(sizeStyles.text, config.color)}>
              {config.label}
            </span>
          )}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p>{config.description}</p>
      </TooltipContent>
    </Tooltip>
  );
}

interface EncryptionIndicatorProps {
  isEncrypted: boolean;
  encryptionType?: string;
  className?: string;
}

export function EncryptionIndicator({
  isEncrypted,
  encryptionType = "AES-256-GCM",
  className,
}: EncryptionIndicatorProps) {
  if (!isEncrypted) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "inline-flex items-center gap-1 text-emerald-500",
            className
          )}
          data-testid="encryption-indicator"
        >
          <Lock className="w-3 h-3" />
          <span className="text-xs">Şifreli</span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p>{encryptionType} ile şifrelenmiş</p>
      </TooltipContent>
    </Tooltip>
  );
}

interface ConnectionSecurityProps {
  isSecure: boolean;
  protocol?: string;
  className?: string;
}

export function ConnectionSecurity({
  isSecure,
  protocol = "TLS 1.3",
  className,
}: ConnectionSecurityProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "inline-flex items-center gap-1",
            isSecure ? "text-emerald-500" : "text-amber-500",
            className
          )}
          data-testid="connection-security"
        >
          {isSecure ? (
            <ShieldCheck className="w-4 h-4" />
          ) : (
            <ShieldAlert className="w-4 h-4" />
          )}
          <span className="text-xs">{isSecure ? "Güvenli" : "Güvenli Değil"}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p>{isSecure ? `${protocol} ile güvenli bağlantı` : "Bağlantı şifrelenmemiş"}</p>
      </TooltipContent>
    </Tooltip>
  );
}
