import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, EyeOff, Lock, Download, CheckCircle, User, Mail, Phone, MapPin, Scale } from "lucide-react";
import logoImage from "@/assets/signup-logo.png";

const signupSchema = z.object({
  password: z.string().min(8, "Şifre en az 8 karakter olmalı"),
  confirmPassword: z.string().min(1, "Şifre onayı gerekli"),
  displayName: z.string().optional(),
  email: z.string().email("Geçerli bir e-posta adresi girin").optional().or(z.literal("")),
  phone: z.string().optional(),
  barAssociationNumber: z.string().optional(),
  city: z.string().optional(),
  specialization: z.string().optional(),
  isAnonymous: z.boolean().default(false),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Şifreler eşleşmiyor",
  path: ["confirmPassword"],
});

type SignupFormData = z.infer<typeof signupSchema>;

const specializationOptions = [
  "Ceza Hukuku",
  "Medeni Hukuk",
  "Ticaret Hukuku",
  "İş Hukuku",
  "Aile Hukuku",
  "Miras Hukuku",
  "İdare Hukuku",
  "Vergi Hukuku",
  "Fikri Mülkiyet",
  "Uluslararası Hukuk",
  "Gayrimenkul Hukuku",
  "Tüketici Hukuku",
];

const cityOptions = [
  "İstanbul",
  "Ankara",
  "İzmir",
  "Bursa",
  "Antalya",
  "Adana",
  "Konya",
  "Gaziantep",
  "Mersin",
  "Kayseri",
  "Diğer",
];

export default function SignupPage() {
  const { register } = useAuth();
  const [, setLocation] = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [downloadReady, setDownloadReady] = useState(false);
  const [encFileBlob, setEncFileBlob] = useState<Blob | null>(null);

  const [recoveryPhrase, setRecoveryPhrase] = useState<string | null>(null);

  const form = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
      displayName: "",
      email: "",
      phone: "",
      barAssociationNumber: "",
      city: "",
      specialization: "",
      isAnonymous: false,
    },
  });

  const isAnonymous = form.watch("isAnonymous");

  async function onSubmit(data: SignupFormData) {
    setError(null);
    setIsLoading(true);

    try {
      const { encFileBlob: blob, recoveryPhrase: phrase } = await register({
        password: data.password,
        displayName: data.isAnonymous ? undefined : data.displayName,
        email: data.isAnonymous ? undefined : data.email || undefined,
        phone: data.phone || undefined,
        isAnonymous: data.isAnonymous,
        barAssociationNumber: data.barAssociationNumber || undefined,
        city: data.city || undefined,
        specializations: data.specialization ? [data.specialization] : undefined,
      });

      setEncFileBlob(blob);
      setRecoveryPhrase(phrase);
      setDownloadReady(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt başarısız oldu.");
    } finally {
      setIsLoading(false);
    }
  }

  const downloadEncFile = () => {
    if (!encFileBlob) return;
    
    const url = URL.createObjectURL(encFileBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `zenos_kimlik_${Date.now()}.enc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const goToLogin = () => {
    setLocation("/login");
  };

  if (downloadReady) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4"
        style={{
          background: "linear-gradient(145deg, #0a0a0c 0%, #0d1117 50%, #0a0a0c 100%)",
        }}
      >
        <Card className="w-full max-w-md border-primary/10 bg-card/80 backdrop-blur-xl">
          <CardHeader className="space-y-4 text-center pb-2">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
                <CheckCircle className="w-10 h-10 text-green-500" />
              </div>
            </div>
            <div>
              <CardTitle className="text-2xl font-semibold" data-testid="text-success-title">
                Kayıt Başarılı
              </CardTitle>
            </div>
          </CardHeader>

          <CardContent className="space-y-6 text-center">
            <p className="text-muted-foreground text-sm">
              Kimlik dosyanız hazır. Sistemi kullanmak için bu dosyayı indirebilirsiniz. 
              Ayrıca aşağıdaki kurtarma anahtarını güvenli bir yere not edin.
            </p>

            <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 text-sm text-left relative">
              <p className="text-primary font-medium mb-2">Kurtarma Anahtarınız (Recovery Phrase):</p>
              <div className="grid grid-cols-3 gap-2 mt-3">
                {recoveryPhrase?.split(' ').map((word, i) => (
                  <div key={i} className="flex items-center text-xs p-1.5 bg-background rounded border font-mono">
                    <span className="text-muted-foreground mr-1.5 w-4">{i + 1}.</span>
                    <span className="font-semibold">{word}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-left">
              <p className="text-red-400 font-medium mb-2">Önemli Uyarı:</p>
              <ul className="text-red-400/80 space-y-1 list-disc list-inside">
                <li>Bu kelimeleri kaybetmeyin, şifrenizi unutursanız hesabınızı kurtarmanın tek yoludur.</li>
                <li>Kimlik dosyanızı (.enc) güvenli bir yerde saklayın.</li>
              </ul>
            </div>

            <div className="space-y-3">
              <Button
                onClick={downloadEncFile}
                className="w-full gap-2"
                data-testid="button-download-enc"
              >
                <Download className="w-4 h-4" />
                Kimlik Dosyasını İndir (.enc)
              </Button>

              <Button
                variant="outline"
                onClick={goToLogin}
                className="w-full"
                data-testid="button-go-to-login"
              >
                Giriş Sayfasına Git
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 py-8"
      style={{
        background: "linear-gradient(145deg, #0a0a0c 0%, #0d1117 50%, #0a0a0c 100%)",
      }}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
      </div>

      <Card className="w-full max-w-lg relative z-10 border-primary/10 bg-card/80 backdrop-blur-xl">
        <CardHeader className="space-y-4 text-center pb-2">
          <div className="flex justify-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center p-2">
              <img 
                src={logoImage} 
                alt="ZenOS Logo" 
                className="w-8 h-8 dark:invert"
                data-testid="img-logo"
              />
            </div>
          </div>
          <div>
            <CardTitle className="text-2xl font-semibold" data-testid="text-signup-title">
              Kayıt Ol
            </CardTitle>
          </div>
        </CardHeader>

        <CardContent className="pt-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm" data-testid="text-error">
                  {error}
                </div>
              )}

              {/* Anonymous Toggle */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
                <div className="space-y-0.5">
                  <label className="text-sm font-medium">Anonim Üyelik</label>
                  <p className="text-xs text-muted-foreground">Kişisel bilgilerinizi paylaşmadan kayıt olun</p>
                </div>
                <FormField
                  control={form.control}
                  name="isAnonymous"
                  render={({ field }) => (
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="switch-anonymous"
                    />
                  )}
                />
              </div>

              {!isAnonymous && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="displayName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Ad Soyad</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input
                                {...field}
                                placeholder="Ad Soyad"
                                className="pl-10"
                                data-testid="input-display-name"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>E-posta</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input
                                {...field}
                                type="email"
                                placeholder="ornek@email.com"
                                className="pl-10"
                                data-testid="input-email"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Telefon</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input
                                {...field}
                                placeholder="+90 5xx xxx xx xx"
                                className="pl-10"
                                data-testid="input-phone"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="barAssociationNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Baro Sicil No</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Scale className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input
                                {...field}
                                placeholder="12345"
                                className="pl-10"
                                data-testid="input-bar-number"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Şehir</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-city">
                                <MapPin className="w-4 h-4 mr-2 text-muted-foreground" />
                                <SelectValue placeholder="Seçiniz" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {cityOptions.map((city) => (
                                <SelectItem key={city} value={city}>
                                  {city}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="specialization"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Uzmanlık Alanı</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-specialization">
                                <SelectValue placeholder="Seçiniz" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {specializationOptions.map((spec) => (
                                <SelectItem key={spec} value={spec}>
                                  {spec}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Şifre</FormLabel>
                      <FormControl>
                        <div className="relative flex items-center">
                          <Lock className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                          <Input
                            {...field}
                            type={showPassword ? "text" : "password"}
                            placeholder="••••••••"
                            className="pl-10 pr-12"
                            data-testid="input-password"
                            autoComplete="new-password"
                          />
                          <button
                            type="button"
                            className="absolute right-3 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Şifre Tekrar</FormLabel>
                      <FormControl>
                        <div className="relative flex items-center">
                          <Lock className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                          <Input
                            {...field}
                            type={showConfirmPassword ? "text" : "password"}
                            placeholder="••••••••"
                            className="pl-10 pr-12"
                            data-testid="input-confirm-password"
                            autoComplete="new-password"
                          />
                          <button
                            type="button"
                            className="absolute right-3 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          >
                            {showConfirmPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
                data-testid="button-signup"
              >
                {isLoading ? "Kayıt yapılıyor..." : "Kayıt Ol ve Kimlik Dosyası Al"}
              </Button>
            </form>
          </Form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            Zaten hesabınız var mı?{" "}
            <Link href="/login" className="text-primary hover:underline" data-testid="link-login">
              Giriş Yap
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
