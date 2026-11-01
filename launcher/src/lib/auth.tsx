import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useLocation } from "wouter";
import { apiRequest } from "./queryClient";
import { createRegistrationVault, unlockVault, setActiveUserKeys } from "./zk-vault";

interface User {
  id: number;
  username: string | null;
  vaultId?: string;
  email: string | null;
  displayName: string | null;
  role: string;
  avatar?: string;
  phone?: string;
  isAnonymous?: boolean;
  createdAt?: string;
  lastLoginAt?: string;
  twoFactorEnabled?: boolean;
}

interface UserProfile {
  id: number;
  userId: number;
  address?: string;
  city?: string;
  country?: string;
  barAssociationNumber?: string;
  specializations?: string[];
  bio?: string;
  website?: string;
  linkedIn?: string;
}

interface UserSettings {
  id: number;
  userId: number;
  theme: string;
  language: string;
  timezone: string;
  notificationsEmail: boolean;
  notificationsPush: boolean;
  notificationsSound: boolean;
  sidebarCollapsed: boolean;
  dashboardLayout?: unknown;
  securityLevel: string;
}

interface RegistrationData {
  password: string;
  displayName?: string;
  email?: string;
  phone?: string;
  isAnonymous?: boolean;
  barAssociationNumber?: string;
  city?: string;
  specializations?: string[];
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  settings: UserSettings | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  loginWithEncFile: (encFile: File, password: string) => Promise<void>;
  register: (data: RegistrationData) => Promise<{ encFileBlob: Blob; recoveryPhrase: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  updateSettings: (updates: Partial<UserSettings>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, setLocation] = useLocation();

  const fetchCSRFToken = useCallback(async () => {
    try {
      // This GET request will set the CSRF cookie via the csrfProtection middleware
      await fetch("/api/auth/csrf", { credentials: "include" });
    } catch (error) {
      console.error("Failed to fetch CSRF token:", error);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/me", {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        setProfile(data.profile);
        setSettings(data.settings);
      } else {
        setUser(null);
        setProfile(null);
        setSettings(null);
      }
    } catch (error) {
      setUser(null);
      setProfile(null);
      setSettings(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearLocalSession = useCallback(() => {
    setUser(null);
    setProfile(null);
    setSettings(null);
    setActiveUserKeys(null);
    window.dispatchEvent(new Event("zenos-clear-session-cookies"));
  }, []);

  useEffect(() => {
    // Fetch CSRF token first, then check session
    fetchCSRFToken().then(() => refreshUser());
  }, [fetchCSRFToken, refreshUser]);

  // Launcher ↔ App IPC: clear local auth when main process broadcasts logout
  useEffect(() => {
    if (!window.electron) return;

    const onLoggedOut = () => {
      clearLocalSession();
      setLocation("/launcher");
    };

    const onSessionReady = () => {
      // App window: session cookies live in main process jar — refresh user
      refreshUser();
    };

    window.electron.receive("auth-logged-out", onLoggedOut);
    window.electron.receive("auth-session-ready", onSessionReady);

    return () => {
      window.electron?.removeListener("auth-logged-out", onLoggedOut);
      window.electron?.removeListener("auth-session-ready", onSessionReady);
    };
  }, [clearLocalSession, refreshUser, setLocation]);

  const openAppAfterAuth = useCallback(() => {
    if (window.electron) {
      window.electron.send("auth-login");
      return;
    }
    setLocation("/os");
  }, [setLocation]);

  const loginWithEncFile = useCallback(async (encFile: File, password: string) => {
    // Read the vault payload from the file
    const fileText = await encFile.text();
    
    // Unlock the vault locally to get the auth key and store master keys in memory
    const keys = await unlockVault(fileText, password);
    setActiveUserKeys(keys);
    
    // Get CSRF token
    let csrfToken = document.cookie
      .split("; ")
      .find((row) => row.startsWith("zenos_csrf="))
      ?.split("=")[1];

    if (!csrfToken) {
      try {
        const csrfRes = await fetch("/api/auth/csrf", { credentials: "include" });
        const csrfData = await csrfRes.json();
        csrfToken = csrfData.csrfToken;
      } catch (e) {
        console.error("Error fetching CSRF token before login:", e);
      }
    }

    // Read user identifier from somewhere, or change backend to use the email.
    // Wait, the backend loginZKA expects 'identifier'. The current form only sends encFile + password.
    // Let's decode the user ID from the vault payload to pass as identifier.
    const vault = JSON.parse(fileText);
    
    // We send identifier (vaultId) and authKey to backend
    const payload = {
      identifier: vault.vaultId,
      authKey: keys.authKey
    };

    const response = await fetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
      },
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Giriş başarısız oldu.");
    }

    const data = await response.json();
    setUser(data.user);
    await refreshUser();
    openAppAfterAuth();
  }, [refreshUser, openAppAfterAuth]);

  const register = useCallback(async (data: RegistrationData): Promise<{ encFileBlob: Blob; recoveryPhrase: string }> => {
    // 1. Create ZKA Vault locally
    const { keys, recoveryPhrase } = await createRegistrationVault(data.password);
    setActiveUserKeys(keys);
    
    // Do not set username initially, user will set alias later
    
    // 2. Prepare backend payload
    const payload = {
      ...data,
      authKey: keys.authKey,
      publicKey: keys.publicKey,
      vaultPayload: keys.vaultPayload
    };

    // 3. Send to backend
    let csrfToken = document.cookie
      .split("; ")
      .find((row) => row.startsWith("zenos_csrf="))
      ?.split("=")[1];

    if (!csrfToken) {
      try {
        const csrfRes = await fetch("/api/auth/csrf", { credentials: "include" });
        const csrfData = await csrfRes.json();
        csrfToken = csrfData.csrfToken;
      } catch (e) {
        console.error("Error fetching CSRF token before register:", e);
      }
    }

    const response = await fetch("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Kayıt başarısız oldu.");
    }

    // Now that the user is created, we don't necessarily need to update the vault's userId here 
    // unless strictly required. For now, the vault is valid.
    const encFileBlob = new Blob([keys.vaultPayload], { type: "application/json" });

    return { encFileBlob, recoveryPhrase };
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.error("Logout failed:", error);
    } finally {
      clearLocalSession();
      if (window.electron) {
        window.electron.send("auth-logout");
      } else {
        setLocation("/launcher");
      }
    }
  }, [clearLocalSession, setLocation]);

  const updateProfile = useCallback(async (updates: Partial<UserProfile>) => {
    const response = await apiRequest("PATCH", "/api/auth/profile", updates);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Profil güncellenemedi.");
    }

    setProfile(data);
  }, []);

  const updateSettings = useCallback(async (updates: Partial<UserSettings>) => {
    const response = await apiRequest("PATCH", "/api/auth/settings", updates);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Ayarlar güncellenemedi.");
    }

    setSettings(data);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        settings,
        isLoading,
        isAuthenticated: !!user,
        loginWithEncFile,
        register,
        logout,
        refreshUser,
        updateProfile,
        updateSettings,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading || isAuthenticated) return;

    // Electron app window: unauthenticated → return to launcher via IPC
    if (window.electron && window.zenosWindowRole === "app") {
      window.electron.send("auth-logout");
      return;
    }
    if (window.electron && window.zenosWindowRole === "launcher") {
      setLocation("/launcher");
      return;
    }
    setLocation("/launcher");
  }, [isAuthenticated, isLoading, setLocation]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}

export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;

    if (window.electron) {
      window.electron.send("auth-login");
      return;
    }
    setLocation("/os");
  }, [isAuthenticated, isLoading, setLocation]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
