import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type Language = "tr" | "en" | "de";
export type Currency = "TRY" | "USD" | "EUR";
export type DateFormat = "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";
export type TimeFormat = "24h" | "12h";

interface Preferences {
  language: Language;
  currency: Currency;
  dateFormat: DateFormat;
  timeFormat: TimeFormat;
}

interface PreferencesContextType {
  preferences: Preferences;
  setLanguage: (lang: Language) => void;
  setCurrency: (currency: Currency) => void;
  setDateFormat: (format: DateFormat) => void;
  setTimeFormat: (format: TimeFormat) => void;
  updatePreferences: (prefs: Partial<Preferences>) => void;
  formatCurrency: (amount: number, currencyOverride?: Currency) => string;
  formatDate: (date: Date | string) => string;
  formatTime: (date: Date | string) => string;
  t: (key: string) => string;
}

const defaultPreferences: Preferences = {
  language: "tr",
  currency: "TRY",
  dateFormat: "DD/MM/YYYY",
  timeFormat: "24h",
};

const translations: Record<Language, Record<string, string>> = {
  tr: {
    dashboard: "Kontrol Paneli",
    wallet: "Cüzdan",
    documents: "Belgeler",
    communications: "İletişim",
    accounting: "Muhasebe",
    settings: "Ayarlar",
    profile: "Profil",
    logout: "Çıkış",
    save: "Kaydet",
    cancel: "İptal",
    delete: "Sil",
    edit: "Düzenle",
    add: "Ekle",
    search: "Ara",
    loading: "Yükleniyor...",
    error: "Hata",
    success: "Başarılı",
    welcome: "Hoş Geldiniz",
    cases: "Davalar",
    messages: "Mesajlar",
    income: "Gelir",
    expense: "Gider",
    total: "Toplam",
    balance: "Bakiye",
    send: "Gönder",
    receive: "Al",
    transactions: "İşlemler",
    fiat: "Fiat",
    crypto: "Kripto",
    today: "Bugün",
    yesterday: "Dün",
    thisWeek: "Bu Hafta",
    thisMonth: "Bu Ay",
    preferences_saved: "Tercihler kaydedildi",
    preferences_saved_desc: "Ayarlarınız başarıyla güncellendi.",
    language: "Dil",
    currency: "Para Birimi",
    date_format: "Tarih Formatı",
    time_format: "Saat Formatı",
    theme: "Tema",
    dark: "Karanlık",
    light: "Aydınlık",
    appearance: "Görünüm",
    region_language: "Bölge ve Dil",
    notifications: "Bildirimler",
    security: "Güvenlik",
    privacy: "Gizlilik",
    general: "Genel",
  },
  en: {
    dashboard: "Dashboard",
    wallet: "Wallet",
    documents: "Documents",
    communications: "Communications",
    accounting: "Accounting",
    settings: "Settings",
    profile: "Profile",
    logout: "Logout",
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    edit: "Edit",
    add: "Add",
    search: "Search",
    loading: "Loading...",
    error: "Error",
    success: "Success",
    welcome: "Welcome",
    cases: "Cases",
    messages: "Messages",
    income: "Income",
    expense: "Expense",
    total: "Total",
    balance: "Balance",
    send: "Send",
    receive: "Receive",
    transactions: "Transactions",
    fiat: "Fiat",
    crypto: "Crypto",
    today: "Today",
    yesterday: "Yesterday",
    thisWeek: "This Week",
    thisMonth: "This Month",
    preferences_saved: "Preferences saved",
    preferences_saved_desc: "Your settings have been updated successfully.",
    language: "Language",
    currency: "Currency",
    date_format: "Date Format",
    time_format: "Time Format",
    theme: "Theme",
    dark: "Dark",
    light: "Light",
    appearance: "Appearance",
    region_language: "Region & Language",
    notifications: "Notifications",
    security: "Security",
    privacy: "Privacy",
    general: "General",
  },
  de: {
    dashboard: "Dashboard",
    wallet: "Brieftasche",
    documents: "Dokumente",
    communications: "Kommunikation",
    accounting: "Buchhaltung",
    settings: "Einstellungen",
    profile: "Profil",
    logout: "Abmelden",
    save: "Speichern",
    cancel: "Abbrechen",
    delete: "Löschen",
    edit: "Bearbeiten",
    add: "Hinzufügen",
    search: "Suchen",
    loading: "Laden...",
    error: "Fehler",
    success: "Erfolg",
    welcome: "Willkommen",
    cases: "Fälle",
    messages: "Nachrichten",
    income: "Einnahmen",
    expense: "Ausgaben",
    total: "Gesamt",
    balance: "Guthaben",
    send: "Senden",
    receive: "Empfangen",
    transactions: "Transaktionen",
    fiat: "Fiat",
    crypto: "Krypto",
    today: "Heute",
    yesterday: "Gestern",
    thisWeek: "Diese Woche",
    thisMonth: "Diesen Monat",
    preferences_saved: "Einstellungen gespeichert",
    preferences_saved_desc: "Ihre Einstellungen wurden erfolgreich aktualisiert.",
    language: "Sprache",
    currency: "Währung",
    date_format: "Datumsformat",
    time_format: "Zeitformat",
    theme: "Thema",
    dark: "Dunkel",
    light: "Hell",
    appearance: "Erscheinungsbild",
    region_language: "Region & Sprache",
    notifications: "Benachrichtigungen",
    security: "Sicherheit",
    privacy: "Privatsphäre",
    general: "Allgemein",
  },
};

const currencySymbols: Record<Currency, string> = {
  TRY: "₺",
  USD: "$",
  EUR: "€",
};

const currencyLocales: Record<Currency, string> = {
  TRY: "tr-TR",
  USD: "en-US",
  EUR: "de-DE",
};

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("zenos-preferences");
      if (stored) {
        try {
          return { ...defaultPreferences, ...JSON.parse(stored) };
        } catch {
          return defaultPreferences;
        }
      }
    }
    return defaultPreferences;
  });

  useEffect(() => {
    localStorage.setItem("zenos-preferences", JSON.stringify(preferences));
  }, [preferences]);

  const setLanguage = (language: Language) => {
    setPreferences((prev) => ({ ...prev, language }));
  };

  const setCurrency = (currency: Currency) => {
    setPreferences((prev) => ({ ...prev, currency }));
  };

  const setDateFormat = (dateFormat: DateFormat) => {
    setPreferences((prev) => ({ ...prev, dateFormat }));
  };

  const setTimeFormat = (timeFormat: TimeFormat) => {
    setPreferences((prev) => ({ ...prev, timeFormat }));
  };

  const updatePreferences = (prefs: Partial<Preferences>) => {
    setPreferences((prev) => ({ ...prev, ...prefs }));
  };

  const formatCurrency = (amount: number, currencyOverride?: Currency): string => {
    const curr = currencyOverride || preferences.currency;
    const locale = currencyLocales[curr];
    
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: curr,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (date: Date | string): string => {
    const d = typeof date === "string" ? new Date(date) : date;
    const day = d.getDate().toString().padStart(2, "0");
    const month = (d.getMonth() + 1).toString().padStart(2, "0");
    const year = d.getFullYear();

    switch (preferences.dateFormat) {
      case "DD/MM/YYYY":
        return `${day}/${month}/${year}`;
      case "MM/DD/YYYY":
        return `${month}/${day}/${year}`;
      case "YYYY-MM-DD":
        return `${year}-${month}-${day}`;
      default:
        return `${day}/${month}/${year}`;
    }
  };

  const formatTime = (date: Date | string): string => {
    const d = typeof date === "string" ? new Date(date) : date;
    const hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, "0");

    if (preferences.timeFormat === "12h") {
      const period = hours >= 12 ? "PM" : "AM";
      const hour12 = hours % 12 || 12;
      return `${hour12}:${minutes} ${period}`;
    }
    
    return `${hours.toString().padStart(2, "0")}:${minutes}`;
  };

  const t = (key: string): string => {
    return translations[preferences.language]?.[key] || translations.tr[key] || key;
  };

  return (
    <PreferencesContext.Provider
      value={{
        preferences,
        setLanguage,
        setCurrency,
        setDateFormat,
        setTimeFormat,
        updatePreferences,
        formatCurrency,
        formatDate,
        formatTime,
        t,
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (context === undefined) {
    throw new Error("usePreferences must be used within a PreferencesProvider");
  }
  return context;
}
