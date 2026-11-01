import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import {
  User,
  Mail,
  Phone,
  Building,
  MapPin,
  Calendar,
  Shield,
  Camera,
  Save,
  Briefcase,
  Award,
  FileText,
  Globe,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const profileSchema = z.object({
  displayName: z.string().min(2, "Ad en az 2 karakter olmalı").optional(),
  phone: z.string().optional(),
  bio: z.string().max(500, "Bio en fazla 500 karakter olabilir").optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  website: z.string().url("Geçerli bir URL girin").optional().or(z.literal("")),
  barAssociationNumber: z.string().optional(),
  specializations: z.array(z.string()).optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;

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

export default function Profile() {
  const { user, profile, refreshUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: user?.displayName || "",
      phone: user?.phone || "",
      bio: profile?.bio || "",
      address: profile?.address || "",
      city: profile?.city || "",
      country: profile?.country || "Türkiye",
      website: profile?.website || "",
      barAssociationNumber: profile?.barAssociationNumber || "",
      specializations: profile?.specializations || [],
    },
  });

  useEffect(() => {
    if (user || profile) {
      form.reset({
        displayName: user?.displayName || "",
        phone: user?.phone || "",
        bio: profile?.bio || "",
        address: profile?.address || "",
        city: profile?.city || "",
        country: profile?.country || "Türkiye",
        website: profile?.website || "",
        barAssociationNumber: profile?.barAssociationNumber || "",
        specializations: profile?.specializations || [],
      });
    }
  }, [user, profile, form]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileFormData) => {
      const response = await apiRequest("PATCH", "/api/auth/profile", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Profil güncellendi",
        description: "Profiliniz başarıyla kaydedildi.",
      });
      refreshUser();
      setIsEditing(false);
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Hata",
        description: "Profil güncellenirken bir hata oluştu.",
      });
    },
  });

  const onSubmit = (data: ProfileFormData) => {
    updateProfileMutation.mutate(data);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Profil</h1>
          <p className="text-sm text-muted-foreground">Kişisel bilgilerinizi yönetin</p>
        </div>
        <Button
          variant={isEditing ? "outline" : "default"}
          onClick={() => setIsEditing(!isEditing)}
          data-testid="button-toggle-edit"
        >
          {isEditing ? "İptal" : "Düzenle"}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="relative">
                <Avatar className="w-24 h-24">
                  <AvatarImage src={user?.avatar || undefined} />
                  <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                    {user?.displayName?.charAt(0) || user?.username?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
                {isEditing && (
                  <Button
                    size="icon"
                    variant="secondary"
                    className="absolute bottom-0 right-0 rounded-full w-8 h-8"
                    data-testid="button-change-avatar"
                  >
                    <Camera className="w-4 h-4" />
                  </Button>
                )}
              </div>
              <div>
                <h2 className="text-xl font-semibold">{user?.displayName || user?.username}</h2>
                <p className="text-sm text-muted-foreground">@{user?.username}</p>
              </div>
              <div className="flex gap-2">
                <Badge variant="secondary" className="gap-1">
                  <Shield className="w-3 h-3" />
                  Doğrulanmış
                </Badge>
                <Badge variant="outline" className="gap-1">
                  <Award className="w-3 h-3" />
                  Premium
                </Badge>
              </div>
              <Separator />
              <div className="w-full space-y-3 text-left text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="w-4 h-4" />
                  <span>{user?.email}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  <span>Katılım: {new Date().toLocaleDateString("tr-TR")}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Briefcase className="w-4 h-4" />
                  <span>Avukat</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Kişisel Bilgiler
            </CardTitle>
            <CardDescription>
              Temel profil bilgilerinizi güncelleyin
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="displayName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ad Soyad</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            disabled={!isEditing}
                            placeholder="Adınız Soyadınız"
                            data-testid="input-display-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Telefon</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            disabled={!isEditing}
                            placeholder="+90 (5xx) xxx xx xx"
                            data-testid="input-phone"
                          />
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
                          <Input
                            {...field}
                            disabled={!isEditing}
                            placeholder="12345"
                            data-testid="input-bar-number"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="specializations"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Uzmanlık Alanı</FormLabel>
                        <Select
                          onValueChange={(value) => field.onChange([value])}
                          value={field.value?.[0] || ""}
                          disabled={!isEditing}
                        >
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

                <FormField
                  control={form.control}
                  name="bio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hakkımda</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          disabled={!isEditing}
                          placeholder="Kendinizi kısaca tanıtın..."
                          className="resize-none"
                          rows={4}
                          data-testid="textarea-bio"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Separator />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Şehir</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            disabled={!isEditing}
                            placeholder="İstanbul"
                            data-testid="input-city"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="country"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ülke</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            disabled={!isEditing}
                            placeholder="Türkiye"
                            data-testid="input-country"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="website"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Web Sitesi</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            disabled={!isEditing}
                            placeholder="https://example.com"
                            data-testid="input-website"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Adres</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          disabled={!isEditing}
                          placeholder="Açık adres..."
                          className="resize-none"
                          rows={2}
                          data-testid="textarea-address"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {isEditing && (
                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      disabled={updateProfileMutation.isPending}
                      data-testid="button-save-profile"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {updateProfileMutation.isPending ? "Kaydediliyor..." : "Kaydet"}
                    </Button>
                  </div>
                )}
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Hesap İstatistikleri
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <div className="text-2xl font-bold font-price text-primary">12</div>
              <div className="text-sm text-muted-foreground">Aktif Dava</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <div className="text-2xl font-bold font-price text-emerald-600">45</div>
              <div className="text-sm text-muted-foreground">Tamamlanan Dava</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <div className="text-2xl font-bold font-price text-blue-600">128</div>
              <div className="text-sm text-muted-foreground">Toplam Belge</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <div className="text-2xl font-bold font-price text-amber-600">₺245K</div>
              <div className="text-sm text-muted-foreground">Toplam Gelir</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
