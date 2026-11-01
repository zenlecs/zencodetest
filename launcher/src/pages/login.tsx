import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
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
import { Eye, EyeOff, Lock, Upload, FileKey, X, Download, CheckCircle, User, Mail, Phone, MapPin, Scale, ArrowLeft, HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

const loginSchema = z.object({
  password: z.string().min(1, "Şifre gerekli"),
});

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
}).superRefine((data, ctx) => {
  if (data.password !== data.confirmPassword) {
    ctx.addIssue({
      code: "custom",
      message: "Şifreler eşleşmiyor",
      path: ["confirmPassword"],
    });
  }
  if (!data.isAnonymous) {
    if (!data.displayName || data.displayName.trim() === "") {
      ctx.addIssue({
        code: "custom",
        message: "Ad Soyad gerekli",
        path: ["displayName"],
      });
    }
    if (!data.email || data.email.trim() === "") {
      ctx.addIssue({
        code: "custom",
        message: "E-posta gerekli",
        path: ["email"],
      });
    }
  }
});

type LoginFormData = z.infer<typeof loginSchema>;
type SignupFormData = z.infer<typeof signupSchema>;

type AuthStep = 'intro' | 'question' | 'login' | 'signup' | 'success';

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

// Support Desk — dış kaynak ama yazılım içinde açılan destek sayfası.
// İleride bu URL doldurulduğunda "Yardım?" bağlantısı bu sayfaya bağlanacak.
const SUPPORT_DESK_URL = ""; // ör. "https://destek.example.com"

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

export default function LoginPage({ onBack }: { onBack?: () => void }) {
  const { loginWithEncFile, register } = useAuth();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<AuthStep>('intro');
  const [fadeIn, setFadeIn] = useState(false);
  const [introVisible, setIntroVisible] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  
  // Login states
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [encFile, setEncFile] = useState<File | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Signup states
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [encFileBlob, setEncFileBlob] = useState<Blob | null>(null);
  const [recoveryPhrase, setRecoveryPhrase] = useState<string | null>(null);

  // Cinematic intro animation
  useEffect(() => {
    // Fade in logo
    const fadeInTimer = setTimeout(() => setIntroVisible(true), 100);
    // Transition to question — logo aynı geçişin parçası olarak kaybolur
    const transitionTimer = setTimeout(() => {
      setStep('question');
      setFadeIn(true);
    }, 2400);
    // Geçiş bitince logoyu DOM'dan kaldır (500ms transition + pay)
    const unmountTimer = setTimeout(() => setShowIntro(false), 2950);

    return () => {
      clearTimeout(fadeInTimer);
      clearTimeout(transitionTimer);
      clearTimeout(unmountTimer);
    };
  }, []);

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { password: "" },
  });

  const signupForm = useForm<SignupFormData>({
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

  const isAnonymous = signupForm.watch("isAnonymous");

  const transitionTo = (newStep: AuthStep) => {
    setFadeIn(false);
    setTimeout(() => {
      setStep(newStep);
      setError(null);
      setFadeIn(true);
    }, 200);
  };

  // Login handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith(".enc")) {
        setEncFile(file);
        setError(null);
      } else {
        setError("Lütfen .enc uzantılı bir dosya seçin.");
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.name.endsWith(".enc")) {
        setEncFile(file);
        setError(null);
      } else {
        setError("Lütfen .enc uzantılı bir dosya seçin.");
      }
    }
  };

  const removeFile = () => {
    setEncFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  async function onLoginSubmit(data: LoginFormData) {
    if (!encFile) {
      setError("Lütfen kimlik dosyanızı (.enc) yükleyin.");
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      await loginWithEncFile(encFile, data.password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Giriş başarısız oldu.");
    } finally {
      setIsLoading(false);
    }
  }

  // Signup handlers
  async function onSignupSubmit(data: SignupFormData) {
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
      transitionTo('success');
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

  // Yardım / Support Desk — yazılım içinde açılacak dış destek sayfası
  const openSupportDesk = () => {
    if (SUPPORT_DESK_URL) {
      window.open(SUPPORT_DESK_URL, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="h-full w-full flex items-center justify-center p-4 font-montserrat overflow-hidden rounded-xl bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 dark:from-[#0a0a0c] dark:via-[#0d1117] dark:to-[#0a0a0c]">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
      </div>

      {/* Global Back Button */}
      {step !== 'intro' && step !== 'success' && (
        <button
          onClick={() => {
            if (step === 'question') {
              if (onBack) {
                onBack();
              } else {
                setLocation('/');
              }
            } else {
              transitionTo('question');
            }
          }}
          className={`absolute top-6 left-6 z-30 p-2 text-slate-500 hover:text-slate-800 dark:text-white/40 dark:hover:text-white/80 transition-colors duration-300 ${
            fadeIn ? 'opacity-100' : 'opacity-0'
          }`}
          data-testid="button-global-back"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {/* Cinematic Intro - Logo Only */}
      {showIntro && (
        <div
          className={`absolute inset-0 flex items-center justify-center z-20 pointer-events-none transition-all ${
            fadeIn
              ? '[transition-duration:400ms] ease-out opacity-0 -translate-y-4'
              : 'opacity-100'
          }`}
        >
          <img 
            src="./Frame%2013.svg" 
            alt="Zenlecs Logo Dark" 
            className={`w-24 h-auto hidden dark:block drop-shadow-2xl transition-all duration-700 ease-out ${
              introVisible ? 'scale-100 blur-0 opacity-100' : 'scale-90 blur-md opacity-0'
            }`}
            data-testid="img-intro-logo-dark"
          />
          <img 
            src="./Frame%2014.svg" 
            alt="Zenlecs Logo Light" 
            className={`w-24 h-auto block dark:hidden drop-shadow-2xl transition-all duration-700 ease-out ${
              introVisible ? 'scale-100 blur-0 opacity-100' : 'scale-90 blur-md opacity-0'
            }`}
            data-testid="img-intro-logo-light"
          />
        </div>
      )}

      <div 
        className={`relative z-10 w-full max-w-lg transition-all [transition-duration:400ms] ease-out ${
          fadeIn && step !== 'intro' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        {/* Question Step - No Logo */}
        {step === 'question' && (
          <div className="flex flex-col items-center">
            <h1 className="text-2xl font-light text-slate-800 dark:text-white/90 mb-10 tracking-wide">
              Üyeliğiniz var mı?
            </h1>
            
            <div className="flex flex-col gap-3.5 w-full max-w-sm">
              {/* iOS tarzı oval (pill) çizgili birincil seçenek — sade, yumuşak ve zarif */}
              <button
                onClick={() => transitionTo('login')}
                className="w-full rounded-full bg-transparent px-8 py-3.5 text-[15px] font-normal tracking-[-0.01em] text-slate-800 dark:text-white/85 border border-slate-900/15 dark:border-white/20 transition-all duration-200 ease-out hover:border-slate-900/30 hover:bg-slate-900/[0.03] dark:hover:border-white/35 dark:hover:bg-white/[0.05] active:scale-[0.98] active:bg-slate-900/[0.05] dark:active:bg-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20 dark:focus-visible:ring-white/30"
                data-testid="button-has-account"
              >
                Evet, giriş yapmak istiyorum
              </button>
              
              {/* Üye olma — kutudan çıkarıldı, birincil seçeneğin altında link metni */}
              <button
                type="button"
                onClick={() => transitionTo('signup')}
                className="-mt-1 self-center text-[14px] font-light text-slate-500 underline-offset-4 transition-colors duration-200 hover:underline hover:text-slate-800 dark:text-white/45 dark:hover:text-white/85 focus:outline-none focus-visible:underline"
                data-testid="button-no-account"
              >
                Hayır, üye olmak istiyorum
              </button>
            </div>
          </div>
        )}

        {/* Login Step */}
        {step === 'login' && (
          <Card className="border-slate-200 bg-white/80 dark:border-white/10 dark:bg-white/[0.02] backdrop-blur-xl shadow-xl dark:shadow-none">
            <CardHeader className="space-y-2 text-center pb-2">
              <CardTitle className="text-xl font-light text-slate-800 dark:text-white/90">
                Giriş Yap
              </CardTitle>
            </CardHeader>

            <CardContent className="pt-4">
              <Form {...loginForm}>
                <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-5">
                  {error && (
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm" data-testid="text-error">
                      {error}
                    </div>
                  )}

                  <div className="space-y-2">
                    <FormLabel className="text-slate-600 dark:text-white/60 text-sm font-light">Kimlik Dosyası</FormLabel>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".enc"
                      onChange={handleFileChange}
                      className="hidden"
                      data-testid="input-enc-file"
                    />
                    
                    {!encFile ? (
                      <div
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`
                          border border-dashed rounded-xl p-6 text-center cursor-pointer transition-all
                          ${isDragActive 
                            ? "border-primary bg-primary/5 dark:border-white/40 dark:bg-white/5" 
                            : "border-slate-300 hover:border-slate-400 hover:bg-slate-50 dark:border-white/20 dark:hover:border-white/30 dark:hover:bg-white/[0.02]"
                          }
                        `}
                        data-testid="dropzone-enc-file"
                      >
                        <Upload className="w-7 h-7 mx-auto mb-3 text-slate-400 dark:text-white/40" />
                        <p className="text-sm text-slate-500 dark:text-white/50 font-light">
                          .enc dosyanızı sürükleyin veya tıklayın
                        </p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-100/80 border border-slate-200 dark:bg-white/5 dark:border-white/10">
                        <FileKey className="w-5 h-5 text-slate-500 dark:text-white/60" />
                        <span className="flex-1 text-sm text-slate-700 dark:text-white/80 truncate font-light">{encFile.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={removeFile}
                          className="h-8 w-8 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 dark:text-white/50 dark:hover:text-white/80 dark:hover:bg-white/10"
                          data-testid="button-remove-file"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>

                  <FormField
                    control={loginForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-600 dark:text-white/60 text-sm font-light">Şifre</FormLabel>
                        <FormControl>
                          <div className="relative flex items-center">
                            <Lock className="absolute left-3 h-4 w-4 text-slate-400 dark:text-white/40 pointer-events-none" />
                            <Input
                              {...field}
                              type={showPassword ? "text" : "password"}
                              placeholder="••••••••"
                              className="pl-10 pr-12 bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-slate-300 dark:bg-white/[0.03] dark:border-white/10 dark:text-white dark:placeholder:text-white/30 dark:focus:border-white/30"
                              data-testid="input-password"
                              autoComplete="current-password"
                            />
                            <button
                              type="button"
                              className="absolute right-3 flex items-center justify-center text-white/40 hover:text-white/70 transition-colors"
                              onClick={() => setShowPassword(!showPassword)}
                              data-testid="button-toggle-password"
                            >
                              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage className="text-red-400" />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    className="w-full bg-slate-900 text-white hover:bg-slate-800 dark:bg-white/10 dark:hover:bg-white/20 dark:text-white border-0 font-light"
                    disabled={isLoading || !encFile}
                    data-testid="button-login"
                  >
                    {isLoading ? "Giriş yapılıyor..." : "Giriş Yap"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}

        {/* Signup Step */}
        {step === 'signup' && (
          <Card className="border-slate-200 bg-white/80 dark:border-white/10 dark:bg-white/[0.02] backdrop-blur-xl shadow-xl dark:shadow-none">
            <CardHeader className="space-y-2 text-center pb-2">
              <CardTitle className="text-xl font-light text-slate-800 dark:text-white/90">
                Kayıt Ol
              </CardTitle>
            </CardHeader>

            <CardContent className="pt-4">
              <Form {...signupForm}>
                <form onSubmit={signupForm.handleSubmit(onSignupSubmit)} className="space-y-4">
                  {error && (
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm" data-testid="text-error">
                      {error}
                    </div>
                  )}

                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200 dark:bg-white/[0.03] dark:border-white/10">
                    <div className="space-y-0.5">
                      <label className="text-sm font-light text-slate-700 dark:text-white/80">Anonim Üyelik</label>
                      <p className="text-xs text-slate-500 dark:text-white/40 font-light">Kişisel bilgilerinizi paylaşmadan kayıt olun</p>
                    </div>
                    <FormField
                      control={signupForm.control}
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
                          control={signupForm.control}
                          name="displayName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-slate-600 dark:text-white/60 text-sm font-light">Ad Soyad</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-white/40" />
                                  <Input
                                    {...field}
                                    placeholder="Ad Soyad"
                                    className="pl-10 bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-slate-300 dark:bg-white/[0.03] dark:border-white/10 dark:text-white dark:placeholder:text-white/30 dark:focus:border-white/30"
                                    data-testid="input-display-name"
                                  />
                                </div>
                              </FormControl>
                              <FormMessage className="text-red-400" />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={signupForm.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-slate-600 dark:text-white/60 text-sm font-light">E-posta</FormLabel>
                              <FormControl>
                                <div className="relative flex items-center">
                                  <Mail className="absolute left-3 h-4 w-4 text-slate-400 dark:text-white/40 pointer-events-none" />
                                  <Input
                                    {...field}
                                    type="email"
                                    placeholder="ornek@email.com"
                                    className="pl-10 bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-slate-300 dark:bg-white/[0.03] dark:border-white/10 dark:text-white dark:placeholder:text-white/30 dark:focus:border-white/30"
                                    data-testid="input-email"
                                  />
                                </div>
                              </FormControl>
                              <FormMessage className="text-red-400" />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <FormField
                          control={signupForm.control}
                          name="phone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-slate-600 dark:text-white/60 text-sm font-light">Telefon</FormLabel>
                              <FormControl>
                                <div className="relative flex items-center">
                                  <Phone className="absolute left-3 h-4 w-4 text-slate-400 dark:text-white/40 pointer-events-none" />
                                  <Input
                                    {...field}
                                    placeholder="+90 5xx xxx xx xx"
                                    className="pl-10 bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-slate-300 dark:bg-white/[0.03] dark:border-white/10 dark:text-white dark:placeholder:text-white/30 dark:focus:border-white/30"
                                    data-testid="input-phone"
                                  />
                                </div>
                              </FormControl>
                              <FormMessage className="text-red-400" />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={signupForm.control}
                          name="barAssociationNumber"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-slate-600 dark:text-white/60 text-sm font-light">Baro Sicil No</FormLabel>
                              <FormControl>
                                <div className="relative flex items-center">
                                  <Scale className="absolute left-3 h-4 w-4 text-slate-400 dark:text-white/40 pointer-events-none" />
                                  <Input
                                    {...field}
                                    placeholder="12345"
                                    className="pl-10 bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-slate-300 dark:bg-white/[0.03] dark:border-white/10 dark:text-white dark:placeholder:text-white/30 dark:focus:border-white/30"
                                    data-testid="input-bar-number"
                                  />
                                </div>
                              </FormControl>
                              <FormMessage className="text-red-400" />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <FormField
                          control={signupForm.control}
                          name="city"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-slate-600 dark:text-white/60 text-sm font-light">Şehir</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger className="bg-white border-slate-200 text-slate-900 dark:bg-white/[0.03] dark:border-white/10 dark:text-white" data-testid="select-city">
                                    <MapPin className="w-4 h-4 mr-2 text-slate-400 dark:text-white/40" />
                                    <SelectValue placeholder="Seçiniz" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {cityOptions.map((city) => (
                                    <SelectItem key={city} value={city}>{city}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage className="text-red-400" />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={signupForm.control}
                          name="specialization"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-slate-600 dark:text-white/60 text-sm font-light">Uzmanlık Alanı</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger className="bg-white border-slate-200 text-slate-900 dark:bg-white/[0.03] dark:border-white/10 dark:text-white" data-testid="select-specialization">
                                    <SelectValue placeholder="Seçiniz" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {specializationOptions.map((spec) => (
                                    <SelectItem key={spec} value={spec}>{spec}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage className="text-red-400" />
                            </FormItem>
                          )}
                        />
                      </div>
                    </>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={signupForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-slate-600 dark:text-white/60 text-sm font-light">Şifre</FormLabel>
                          <FormControl>
                            <div className="relative flex items-center">
                              <Lock className="absolute left-3 h-4 w-4 text-slate-400 dark:text-white/40 pointer-events-none" />
                              <Input
                                {...field}
                                type={showPassword ? "text" : "password"}
                                placeholder="••••••••"
                                className="pl-10 pr-12 bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-slate-300 dark:bg-white/[0.03] dark:border-white/10 dark:text-white dark:placeholder:text-white/30 dark:focus:border-white/30"
                                data-testid="input-password"
                                autoComplete="new-password"
                              />
                              <button
                                type="button"
                                className="absolute right-3 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:text-white/40 dark:hover:text-white/70 transition-colors"
                                onClick={() => setShowPassword(!showPassword)}
                              >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                          </FormControl>
                          <FormMessage className="text-red-400" />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={signupForm.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-slate-600 dark:text-white/60 text-sm font-light">Şifre Tekrar</FormLabel>
                          <FormControl>
                            <div className="relative flex items-center">
                              <Lock className="absolute left-3 h-4 w-4 text-slate-400 dark:text-white/40 pointer-events-none" />
                              <Input
                                {...field}
                                type={showConfirmPassword ? "text" : "password"}
                                placeholder="••••••••"
                                className="pl-10 pr-12 bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-slate-300 dark:bg-white/[0.03] dark:border-white/10 dark:text-white dark:placeholder:text-white/30 dark:focus:border-white/30"
                                data-testid="input-confirm-password"
                                autoComplete="new-password"
                              />
                              <button
                                type="button"
                                className="absolute right-3 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:text-white/40 dark:hover:text-white/70 transition-colors"
                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                              >
                                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                          </FormControl>
                          <FormMessage className="text-red-400" />
                        </FormItem>
                      )}
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-slate-900 text-white hover:bg-slate-800 dark:bg-white/10 dark:hover:bg-white/20 dark:text-white border-0 font-light"
                    disabled={isLoading}
                    data-testid="button-signup"
                  >
                    {isLoading ? "Kayıt yapılıyor..." : "Kayıt Ol"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}

        {/* Success Step */}
        {step === 'success' && (
          <Card className="border-slate-200 bg-white/80 dark:border-white/10 dark:bg-white/[0.02] backdrop-blur-xl shadow-xl dark:shadow-none">
            <CardHeader className="space-y-4 text-center pb-2">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-green-500/10 dark:bg-green-500/20 flex items-center justify-center">
                  <CheckCircle className="w-10 h-10 text-green-600 dark:text-green-500" />
                </div>
              </div>
              <CardTitle className="text-xl font-light text-slate-800 dark:text-white/90">
                Kayıt Başarılı
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-6 text-center">
              <p className="text-slate-600 dark:text-white/60 text-sm font-light">
                Kimlik dosyanız hazır. Sistemi kullanmak için bu dosyayı indirebilirsiniz. 
                Ayrıca aşağıdaki kurtarma anahtarını güvenli bir yere not edin.
              </p>

              <div className="p-4 rounded-xl bg-slate-100/80 border border-slate-200 dark:bg-white/5 dark:border-white/10 text-sm text-left relative">
                <p className="text-slate-800 dark:text-white/80 font-medium mb-2">Kurtarma Anahtarınız (Recovery Phrase):</p>
                <div className="grid grid-cols-3 gap-2 mt-3">
                  {recoveryPhrase?.split(' ').map((word, i) => (
                    <div key={i} className="flex items-center text-xs p-1.5 bg-white border border-slate-200 dark:bg-black/20 dark:border-white/5 font-mono text-slate-900 dark:text-white/90">
                      <span className="text-slate-400 dark:text-white/40 mr-1.5 w-4">{i + 1}.</span>
                      <span className="font-light">{word}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-left">
                <p className="text-red-400 font-medium mb-2">Önemli Uyarı:</p>
                <ul className="text-red-400/80 space-y-1 list-disc list-inside font-light">
                  <li>Bu kelimeleri kaybetmeyin, şifrenizi unutursanız hesabınızı kurtarmanın tek yoludur.</li>
                  <li>Kimlik dosyanızı (.enc) güvenli bir yerde saklayın.</li>
                </ul>
              </div>

              <div className="space-y-3">
                <Button
                  onClick={downloadEncFile}
                  className="w-full gap-2 bg-slate-900 hover:bg-slate-800 dark:bg-white/10 dark:hover:bg-white/20 text-white dark:text-white border-0 font-light"
                  data-testid="button-download-enc"
                >
                  <Download className="w-4 h-4" />
                  Kimlik Dosyasını İndir (.enc)
                </Button>

                <Button
                  variant="outline"
                  onClick={() => transitionTo('login')}
                  className="w-full border-slate-300 text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:text-white/80 dark:hover:bg-white/5 dark:hover:text-white font-light"
                  data-testid="button-go-to-login"
                >
                  Giriş Yap
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Yardım — sayfanın en alt tam ortasında, tooltip'li metin linki.
          Support Desk bağlandığında openSupportDesk() yazılım içinde açılacak. */}
      {step !== 'intro' && (
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={openSupportDesk}
                data-testid="link-help"
                aria-label="Yardım"
                className={`absolute bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-light tracking-[0.01em] text-slate-500 transition-all duration-200 ease-out underline-offset-4 hover:text-slate-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20 dark:text-white/40 dark:hover:text-white/80 dark:focus-visible:ring-white/30 ${
                  fadeIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
                }`}
              >
                <HelpCircle className="h-3.5 w-3.5 shrink-0" />
                <span>Yardım?</span>
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              sideOffset={10}
              className="max-w-[240px] rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-[13px] font-light text-slate-700 shadow-lg dark:border-white/10 dark:bg-[#1a1a1c]/95 dark:text-white/85"
            >
              Sorunuz mu var? Destek masamıza yazın, hemen yardımcı olalım.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
