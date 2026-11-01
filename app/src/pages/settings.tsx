import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useSetAlias } from "@/hooks/use-api";
import { usePreferences, Language, Currency, DateFormat, TimeFormat } from "@/lib/preferences-provider";
import {
  Settings as SettingsIcon, Settings2, BellRing, LockKeyhole, UserCog,
  Bell,
  Shield,
  Moon,
  Sun,
  Globe,
  Lock,
  Key,
  Smartphone,
  Mail,
  Eye,
  EyeOff,
  Save,
  Trash2,
  AlertTriangle,
  Wallet,
  Languages,
  Monitor,
  Volume2,
  VolumeX,
  Check,
  User,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/lib/theme-provider";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Mevcut şifre gerekli"),
  newPassword: z.string().min(8, "Yeni şifre en az 8 karakter olmalı"),
  confirmPassword: z.string().min(1, "Şifre onayı gerekli"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Şifreler eşleşmiyor",
  path: ["confirmPassword"],
});

type PasswordFormData = z.infer<typeof passwordSchema>;

export default function Settings() {
  const { user, logout } = useAuth();
  const setAliasMutation = useSetAlias();
  const [aliasInput, setAliasInput] = useState("");

  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user?.username || "");
  const hasAlias = user?.username && !isUUID;
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const { preferences: globalPreferences, updatePreferences, t } = usePreferences();
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [hasPreferencesChanged, setHasPreferencesChanged] = useState(false);
  
  const [notifications, setNotifications] = useState({
    email: true,
    push: true,
    sound: true,
    desktop: false,
    caseUpdates: true,
    newMessages: true,
    paymentAlerts: true,
    weeklyReport: false,
  });

  const [privacy, setPrivacy] = useState({
    showOnlineStatus: true,
    readReceipts: true,
    twoFactorAuth: false,
    biometricAuth: false,
  });

  const [localPreferences, setLocalPreferences] = useState({
    language: globalPreferences.language,
    currency: globalPreferences.currency,
    dateFormat: globalPreferences.dateFormat,
    timeFormat: globalPreferences.timeFormat,
  });

  useEffect(() => {
    setLocalPreferences({
      language: globalPreferences.language,
      currency: globalPreferences.currency,
      dateFormat: globalPreferences.dateFormat,
      timeFormat: globalPreferences.timeFormat,
    });
  }, [globalPreferences]);

  const handleLocalPreferenceChange = (key: string, value: string) => {
    setLocalPreferences(prev => ({ ...prev, [key]: value }));
    setHasPreferencesChanged(true);
  };

  const savePreferences = () => {
    updatePreferences({
      language: localPreferences.language as Language,
      currency: localPreferences.currency as Currency,
      dateFormat: localPreferences.dateFormat as DateFormat,
      timeFormat: localPreferences.timeFormat as TimeFormat,
    });
    setHasPreferencesChanged(false);
    toast({
      title: t("preferences_saved"),
      description: t("preferences_saved_desc"),
    });
  };

  const passwordForm = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: PasswordFormData) => {
      const response = await apiRequest("POST", "/api/auth/change-password", {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Şifre değiştirildi",
        description: "Şifreniz başarıyla güncellendi.",
      });
      passwordForm.reset();
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Hata",
        description: "Şifre değiştirilemedi. Mevcut şifrenizi kontrol edin.",
      });
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("PATCH", "/api/auth/settings", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Ayarlar güncellendi",
        description: "Tercihleriniz başarıyla kaydedildi.",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Hata",
        description: "Ayarlar güncellenirken bir hata oluştu.",
      });
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", "/api/auth/account");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Hesap silindi",
        description: "Hesabınız başarıyla silindi.",
      });
      logout();
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Hata",
        description: "Hesap silinirken bir hata oluştu.",
      });
    },
  });

  const handleNotificationChange = (key: keyof typeof notifications) => {
    const newNotifications = { ...notifications, [key]: !notifications[key] };
    setNotifications(newNotifications);
    updateSettingsMutation.mutate({ notifications: newNotifications });
  };

  const handlePrivacyChange = (key: keyof typeof privacy) => {
    const newPrivacy = { ...privacy, [key]: !privacy[key] };
    setPrivacy(newPrivacy);
    updateSettingsMutation.mutate({ privacy: newPrivacy });
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto w-full">
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div>
        <h1 className="text-2xl font-semibold text-foreground">Ayarlar</h1>
        <p className="text-sm text-muted-foreground">Hesap ve uygulama ayarlarınızı yönetin</p>
      </div>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 h-12 p-0 rounded-lg overflow-hidden border">
          <TabsTrigger value="general" data-testid="tab-general" className="h-full rounded-none border-r border-transparent data-[state=active]:border-border last:border-0">
            <Settings2 className="w-4 h-4 mr-2" />
            Genel
          </TabsTrigger>
          <TabsTrigger value="notifications" data-testid="tab-notifications" className="h-full rounded-none border-r border-transparent data-[state=active]:border-border last:border-0">
            <BellRing className="w-4 h-4 mr-2" />
            Bildirimler
          </TabsTrigger>
          <TabsTrigger value="security" data-testid="tab-security" className="h-full rounded-none border-r border-transparent data-[state=active]:border-border last:border-0">
            <LockKeyhole className="w-4 h-4 mr-2" />
            Güvenlik
          </TabsTrigger>
          <TabsTrigger value="privacy" data-testid="tab-privacy" className="h-full rounded-none border-r border-transparent data-[state=active]:border-border last:border-0">
            <UserCog className="w-4 h-4 mr-2" />
            Gizlilik
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-6 bg-transparent border-0 shadow-none">
          <div className="grid gap-10">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <User className="w-5 h-5" />
                Kullanıcı Adı (Alias)
              </h3>
              <p className="text-sm text-muted-foreground">Sistemdeki diğer avukatların sizi bulabilmesi için benzersiz bir ad belirleyin.</p>
            </div>
            <div className="space-y-6">
              {user?.vaultId && (
                <div className="space-y-2 p-4 bg-muted/30 rounded-lg border">
                  <Label className="text-muted-foreground">Kasa ID (Vault ID)</Label>
                  <div className="font-mono text-sm break-all select-all">{user.vaultId}</div>
                  <p className="text-xs text-muted-foreground">
                    Bu ID sistem tarafından size atanan eşsiz kimlik numaranızdır.
                  </p>
                </div>
              )}

              {hasAlias ? (
                <div className="space-y-2">
                  <Label>Kullanıcı Adı (Alias)</Label>
                  <Input value={user.username!} readOnly className="bg-muted/50" />
                  <p className="text-sm text-green-500 font-medium flex items-center gap-1 mt-2">
                    <Check className="w-4 h-4" />
                    Kullanıcı adınız başarıyla sabitlenmiştir.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Yeni Kullanıcı Adı Belirleyin</Label>
                    <Input 
                      placeholder="Örn: ahmetyilmaz123" 
                      value={aliasInput}
                      onChange={(e) => setAliasInput(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Sadece İngilizce harfler ve rakamlar (4-20 karakter).
                    </p>
                  </div>
                  
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button disabled={!/^[a-zA-Z0-9]{4,20}$/.test(aliasInput) || setAliasMutation.isPending}>
                        {setAliasMutation.isPending ? "Kaydediliyor..." : "Kaydet"}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>İşlemi Onaylıyor Musunuz?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Bu işlem geri alınamaz. Belirlediğiniz kullanıcı adı kalıcıdır ve gelecekte değiştirilemez. 
                          Kullanıcı adınız: <strong className="text-foreground">{aliasInput}</strong>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>İptal</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={() => setAliasMutation.mutate({ username: aliasInput })}
                          className="bg-primary text-primary-foreground"
                        >
                          Evet, Kalıcı Olarak Kaydet
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <Monitor className="w-5 h-5" />
                Görünüm
              </h3>
              <p className="text-sm text-muted-foreground">Uygulama temasını ve görünümünü özelleştirin</p>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Tema</Label>
                  <p className="text-sm text-muted-foreground">
                    Karanlık veya aydınlık mod seçin
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant={theme === "light" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTheme("light")}
                    data-testid="button-theme-light"
                  >
                    <Sun className="w-4 h-4 mr-1" />
                    Aydınlık
                  </Button>
                  <Button
                    variant={theme === "dark" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTheme("dark")}
                    data-testid="button-theme-dark"
                  >
                    <Moon className="w-4 h-4 mr-1" />
                    Karanlık
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <Globe className="w-5 h-5" />
                Bölge ve Dil
              </h3>
              <p className="text-sm text-muted-foreground">Dil ve bölgesel tercihleri ayarlayın</p>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Dil</Label>
                  <Select
                    value={localPreferences.language}
                    onValueChange={(value) => handleLocalPreferenceChange("language", value)}
                  >
                    <SelectTrigger data-testid="select-language">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tr">Türkçe</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="de">Deutsch</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Para Birimi</Label>
                  <Select
                    value={localPreferences.currency}
                    onValueChange={(value) => handleLocalPreferenceChange("currency", value)}
                  >
                    <SelectTrigger data-testid="select-currency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TRY">TRY (₺)</SelectItem>
                      <SelectItem value="USD">USD ($)</SelectItem>
                      <SelectItem value="EUR">EUR (€)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tarih Formatı</Label>
                  <Select
                    value={localPreferences.dateFormat}
                    onValueChange={(value) => handleLocalPreferenceChange("dateFormat", value)}
                  >
                    <SelectTrigger data-testid="select-date-format">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DD/MM/YYYY">GG/AA/YYYY</SelectItem>
                      <SelectItem value="MM/DD/YYYY">AA/GG/YYYY</SelectItem>
                      <SelectItem value="YYYY-MM-DD">YYYY-AA-GG</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Saat Formatı</Label>
                  <Select
                    value={localPreferences.timeFormat}
                    onValueChange={(value) => handleLocalPreferenceChange("timeFormat", value)}
                  >
                    <SelectTrigger data-testid="select-time-format">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="24h">24 Saat</SelectItem>
                      <SelectItem value="12h">12 Saat (AM/PM)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <div className="border-t pt-4">
              <Button 
                onClick={savePreferences}
                disabled={!hasPreferencesChanged}
                data-testid="button-save-preferences"
              >
                <Check className="w-4 h-4 mr-2" />
                Tercihleri Kaydet
              </Button>
              {hasPreferencesChanged && (
                <p className="ml-4 text-sm text-muted-foreground">
                  Kaydedilmemiş değişiklikler var
                </p>
              )}
            </div>
          </div>
        </div>
        </TabsContent>

        <TabsContent value="notifications" className="mt-6 bg-transparent border-0 shadow-none">
          <div className="grid gap-10">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <Bell className="w-5 h-5" />
                Bildirim Kanalları
              </h3>
              <p className="text-sm text-muted-foreground">Bildirimleri nasıl almak istediğinizi seçin</p>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    E-posta Bildirimleri
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Önemli güncellemeler için e-posta alın
                  </p>
                </div>
                <Switch
                  checked={notifications.email}
                  onCheckedChange={() => handleNotificationChange("email")}
                  data-testid="switch-email-notifications"
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="flex items-center gap-2">
                    <Smartphone className="w-4 h-4" />
                    Push Bildirimleri
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Anlık bildirimler alın
                  </p>
                </div>
                <Switch
                  checked={notifications.push}
                  onCheckedChange={() => handleNotificationChange("push")}
                  data-testid="switch-push-notifications"
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="flex items-center gap-2">
                    {notifications.sound ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                    Ses Bildirimleri
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Bildirimler için ses çal
                  </p>
                </div>
                <Switch
                  checked={notifications.sound}
                  onCheckedChange={() => handleNotificationChange("sound")}
                  data-testid="switch-sound-notifications"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <h3 className="text-lg font-medium">Bildirim Türleri</h3>
              <p className="text-sm text-muted-foreground">Hangi olaylarda bildirim almak istediğinizi seçin</p>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Dava Güncellemeleri</Label>
                <Switch
                  checked={notifications.caseUpdates}
                  onCheckedChange={() => handleNotificationChange("caseUpdates")}
                  data-testid="switch-case-updates"
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <Label>Yeni Mesajlar</Label>
                <Switch
                  checked={notifications.newMessages}
                  onCheckedChange={() => handleNotificationChange("newMessages")}
                  data-testid="switch-new-messages"
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <Label>Ödeme Uyarıları</Label>
                <Switch
                  checked={notifications.paymentAlerts}
                  onCheckedChange={() => handleNotificationChange("paymentAlerts")}
                  data-testid="switch-payment-alerts"
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <Label>Haftalık Rapor</Label>
                <Switch
                  checked={notifications.weeklyReport}
                  onCheckedChange={() => handleNotificationChange("weeklyReport")}
                  data-testid="switch-weekly-report"
                />
              </div>
            </div>
          </div>
        </div>
        </TabsContent>

        <TabsContent value="security" className="mt-6 bg-transparent border-0 shadow-none">
          <div className="grid gap-10">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <Key className="w-5 h-5" />
                Şifre Değiştir
              </h3>
              <p className="text-sm text-muted-foreground">Hesap şifrenizi güncelleyin</p>
            </div>
            <div>
              <Form {...passwordForm}>
                <form onSubmit={passwordForm.handleSubmit((data) => changePasswordMutation.mutate(data))} className="space-y-4">
                  <FormField
                    control={passwordForm.control}
                    name="currentPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mevcut Şifre</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              {...field}
                              type={showCurrentPassword ? "text" : "password"}
                              placeholder="Mevcut şifrenizi girin"
                              data-testid="input-current-password"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-0 top-0"
                              onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                            >
                              {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </Button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={passwordForm.control}
                    name="newPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Yeni Şifre</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              {...field}
                              type={showNewPassword ? "text" : "password"}
                              placeholder="Yeni şifrenizi girin"
                              data-testid="input-new-password"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-0 top-0"
                              onClick={() => setShowNewPassword(!showNewPassword)}
                            >
                              {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </Button>
                          </div>
                        </FormControl>
                        <FormDescription>
                          En az 8 karakter, büyük-küçük harf ve rakam içermeli
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={passwordForm.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Şifre Onayı</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="password"
                            placeholder="Yeni şifrenizi tekrar girin"
                            data-testid="input-confirm-password"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    disabled={changePasswordMutation.isPending}
                    data-testid="button-change-password"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {changePasswordMutation.isPending ? "Değiştiriliyor..." : "Şifreyi Değiştir"}
                  </Button>
                </form>
              </Form>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Güvenlik Ayarları
              </h3>
              <p className="text-sm text-muted-foreground">Hesabınızı korumak için ek güvenlik önlemleri</p>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>İki Faktörlü Kimlik Doğrulama</Label>
                  <p className="text-sm text-muted-foreground">
                    Giriş yaparken ek güvenlik katmanı ekleyin
                  </p>
                </div>
                <Switch
                  checked={privacy.twoFactorAuth}
                  onCheckedChange={() => handlePrivacyChange("twoFactorAuth")}
                  data-testid="switch-2fa"
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Biyometrik Kimlik Doğrulama</Label>
                  <p className="text-sm text-muted-foreground">
                    Parmak izi veya yüz tanıma ile giriş yapın
                  </p>
                </div>
                <Switch
                  checked={privacy.biometricAuth}
                  onCheckedChange={() => handlePrivacyChange("biometricAuth")}
                  data-testid="switch-biometric"
                />
              </div>
            </div>
          </div>
        </div>
        </TabsContent>

        <TabsContent value="privacy" className="mt-6 bg-transparent border-0 shadow-none">
          <div className="grid gap-10">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <Eye className="w-5 h-5" />
                Gizlilik Tercihleri
              </h3>
              <p className="text-sm text-muted-foreground">Bilgilerinizin nasıl görüneceğini kontrol edin</p>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Çevrimiçi Durumu Göster</Label>
                  <p className="text-sm text-muted-foreground">
                    Diğer kullanıcılar çevrimiçi durumunuzu görsün
                  </p>
                </div>
                <Switch
                  checked={privacy.showOnlineStatus}
                  onCheckedChange={() => handlePrivacyChange("showOnlineStatus")}
                  data-testid="switch-online-status"
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Okundu Bilgisi</Label>
                  <p className="text-sm text-muted-foreground">
                    Mesajları okuduğunuzda gönderene bildirim gönder
                  </p>
                </div>
                <Switch
                  checked={privacy.readReceipts}
                  onCheckedChange={() => handlePrivacyChange("readReceipts")}
                  data-testid="switch-read-receipts"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4 border-destructive/50">
            <div className="space-y-1.5">
              <h3 className="text-lg font-medium flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-5 h-5" />
                Tehlikeli Bölge
              </h3>
              <p className="text-sm text-muted-foreground">Bu işlemler geri alınamaz</p>
            </div>
            <div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" data-testid="button-delete-account">
                    <Trash2 className="w-4 h-4 mr-2" />
                    Hesabı Sil
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Hesabınızı silmek istediğinize emin misiniz?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Bu işlem geri alınamaz. Tüm verileriniz, davalarınız, belgeleriniz ve cüzdanlarınız kalıcı olarak silinecektir.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="button-cancel-delete">İptal</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteAccountMutation.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      data-testid="button-confirm-delete"
                    >
                      Evet, Hesabımı Sil
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
}
