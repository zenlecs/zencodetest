import React from "react";
import { MessageCircle, Bell, Wallet, Shield, Settings2, DownloadCloud } from "lucide-react";
import { useLocation } from "wouter";

export type NotificationType = 
  | "system_update" 
  | "chat_message" 
  | "wallet_alert" 
  | "security_alert" 
  | "system_alert";

export interface NotificationAction {
  label: string;
  onClick: (payload: any) => void;
  primary?: boolean;
}

export interface NotificationRenderer {
  icon: React.ElementType;
  iconColorClass: string;
  /** Low-alpha background tint for the icon container (same hue as iconColorClass) */
  iconBgClass?: string;
  getActions?: (payload: any, navigate: (path: string) => void) => NotificationAction[];
  onClick?: (payload: any, navigate: (path: string) => void) => void;
}

export const notificationRegistry: Record<string, NotificationRenderer> = {
  "system_update": {
    icon: DownloadCloud,
    iconColorClass: "text-blue-500",
    iconBgClass: "bg-blue-500/10",
    onClick: () => {
      // Launcher is a separate window. Update install is not wired in this phase.
    },
    getActions: () => [
      { label: "Güncelle", primary: true, onClick: () => {} }
    ]
  },
  "chat_message": {
    icon: MessageCircle,
    iconColorClass: "text-emerald-500",
    iconBgClass: "bg-emerald-500/10",
    onClick: (payload, navigate) => {
      if (payload.metadata?.link) {
        navigate(payload.metadata.link);
      } else {
        navigate("/os/communications");
      }
    }
  },
  "wallet_alert": {
    icon: Wallet,
    iconColorClass: "text-amber-500",
    iconBgClass: "bg-amber-500/10",
    onClick: (payload, navigate) => navigate("/os/wallet")
  },
  "security_alert": {
    icon: Shield,
    iconColorClass: "text-destructive",
    iconBgClass: "bg-destructive/10",
    onClick: (payload, navigate) => navigate("/os/settings")
  },
  "system_alert": {
    icon: Settings2,
    iconColorClass: "text-primary",
    iconBgClass: "bg-primary/10",
  },
  "default": {
    icon: Bell,
    iconColorClass: "text-muted-foreground",
    iconBgClass: "bg-muted"
  }
};

export function getNotificationRenderer(type: string): NotificationRenderer {
  return notificationRegistry[type] || notificationRegistry["default"];
}
