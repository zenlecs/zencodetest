import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { encryptDataPayload, decryptDataPayload } from "@/lib/zk-vault";
import { useToast } from "@/hooks/use-toast";
import type {
  Wallet,
  Transaction,
  Case,
  Document,
  Contact,
  Conversation,
  Message,
  AccountingEntry,
  CallSession,
  Presentation,
  InsertWallet,
  InsertTransaction,
  InsertCase,
  InsertDocument,
  InsertContact,
  InsertMessage,
  InsertAccountingEntry,
  InsertPresentation,
} from "@shared/schema";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function fetchAndDecryptArray(url: string): Promise<any[]> {
  const items = await fetchJson<any[]>(url);
  return Promise.all(
    items.map(async (item) => {
      if (!item.encryptedData) return item;
      const decrypted = await decryptDataPayload(item.encryptedData);
      return { ...item, ...decrypted };
    })
  );
}

async function fetchAndDecryptItem(url: string): Promise<any> {
  const item = await fetchJson<any>(url);
  if (!item || !item.encryptedData) return item;
  const decrypted = await decryptDataPayload(item.encryptedData);
  return { ...item, ...decrypted };
}

export function useWallets() {
  return useQuery<any[]>({
    queryKey: ["/api/wallets"],
    queryFn: () => fetchAndDecryptArray("/api/wallets"),
  });
}

export function useWallet(id: string) {
  return useQuery<any>({
    queryKey: ["/api/wallets", id],
    queryFn: () => fetchAndDecryptItem(`/api/wallets/${id}`),
    enabled: !!id,
  });
}

export function useTransactions(walletId: string) {
  return useQuery<any[]>({
    queryKey: ["/api/wallets", walletId, "transactions"],
    queryFn: () => fetchAndDecryptArray(`/api/wallets/${encodeURIComponent(walletId)}/transactions`),
    enabled: !!walletId,
  });
}

export function useCreateWallet() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (data: any) => {
      const encryptedData = await encryptDataPayload({
        name: data.name,
        balance: data.balance,
        icon: data.icon,
        address: data.address,
        provider: data.provider,
        color: data.color
      });
      const payload = {
        type: data.type,
        currency: data.currency,
        isSetup: data.isSetup,
        source: data.source,
        encryptedData
      };
      const res = await apiRequest("POST", "/api/wallets", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      toast({ title: "Cüzdan oluşturuldu", description: "Yeni cüzdan başarıyla eklendi." });
    },
    onError: (error: Error) => {
      toast({ title: "Hata", description: error.message, variant: "destructive" });
    },
  });
}

export function useCreateTransaction() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (data: any) => {
      const encryptedData = await encryptDataPayload({
        description: data.description,
        counterparty: data.counterparty,
        reference: data.reference,
        txHash: data.txHash,
        amount: data.amount
      });
      const payload = {
        walletId: data.walletId,
        type: data.type,
        status: data.status,
        date: data.date,
        encryptedData
      };
      const res = await apiRequest("POST", "/api/transactions", payload);
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallets", variables.walletId, "transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      toast({ title: "İşlem kaydedildi", description: "İşlem başarıyla oluşturuldu." });
    },
    onError: (error: Error) => {
      toast({ title: "Hata", description: error.message, variant: "destructive" });
    },
  });
}

export function useCases() {
  return useQuery<any[]>({
    queryKey: ["/api/cases"],
    queryFn: () => fetchAndDecryptArray("/api/cases"),
  });
}

export function useCase(id: string) {
  return useQuery<any>({
    queryKey: ["/api/cases", id],
    queryFn: () => fetchAndDecryptItem(`/api/cases/${encodeURIComponent(id)}`),
    enabled: !!id,
  });
}

export function useCreateCase() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (data: any) => {
      const encryptedData = await encryptDataPayload({
        title: data.title,
        description: data.description,
        court: data.court,
        judge: data.judge,
        opposingCounsel: data.opposingCounsel,
        nextHearing: data.nextHearing,
        caseNumber: data.caseNumber,
        clientName: data.clientName
      });
      const payload = {
        status: data.status,
        caseNumberBlindIndex: btoa(data.caseNumber), // We should use a real HMAC here but for now just base64 as placeholder
        clientNameBlindIndex: data.clientName ? btoa(data.clientName) : undefined,
        encryptedData
      };
      const res = await apiRequest("POST", "/api/cases", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cases"] });
      toast({ title: "Dava oluşturuldu", description: "Yeni dava başarıyla eklendi." });
    },
    onError: (error: Error) => {
      toast({ title: "Hata", description: error.message, variant: "destructive" });
    },
  });
}

export function useDocuments(caseId?: string) {
  return useQuery<any[]>({
    queryKey: caseId ? ["/api/documents", "case", caseId] : ["/api/documents"],
    queryFn: () => {
      const url = caseId ? `/api/documents?caseId=${encodeURIComponent(caseId)}` : "/api/documents";
      return fetchAndDecryptArray(url);
    },
  });
}

export function useDocument(id: string) {
  return useQuery<any>({
    queryKey: ["/api/documents", id],
    queryFn: () => fetchAndDecryptItem(`/api/documents/${encodeURIComponent(id)}`),
    enabled: !!id,
  });
}

export function useCreateDocument() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (data: any) => {
      const encryptedData = await encryptDataPayload({
        title: data.title,
        content: data.content,
        fileUrl: data.fileUrl,
        fileSize: data.fileSize,
        mimeType: data.mimeType
      });
      const payload = {
        caseId: data.caseId,
        type: data.type,
        encryptedData
      };
      const res = await apiRequest("POST", "/api/documents", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({ title: "Belge oluşturuldu", description: "Yeni belge başarıyla eklendi." });
    },
    onError: (error: Error) => {
      toast({ title: "Hata", description: error.message, variant: "destructive" });
    },
  });
}

export function useUpdateDocument() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<any>) => {
      let encryptedData;
      if (data.title || data.content || data.fileUrl || data.fileSize || data.mimeType) {
        encryptedData = await encryptDataPayload({
          title: data.title,
          content: data.content,
          fileUrl: data.fileUrl,
          fileSize: data.fileSize,
          mimeType: data.mimeType
        });
      }
      
      const payload = {
        caseId: data.caseId,
        type: data.type,
        ...(encryptedData ? { encryptedData } : {})
      };
      const res = await apiRequest("PATCH", `/api/documents/${id}`, payload);
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/documents", variables.id] });
      toast({ title: "Belge güncellendi", description: "Belge başarıyla güncellendi." });
    },
    onError: (error: Error) => {
      toast({ title: "Hata", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/documents/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({ title: "Belge silindi", description: "Belge başarıyla silindi." });
    },
    onError: (error: Error) => {
      toast({ title: "Hata", description: error.message, variant: "destructive" });
    },
  });
}

export function useContacts() {
  return useQuery<any[]>({
    queryKey: ["/api/contacts"],
    queryFn: () => fetchAndDecryptArray("/api/contacts"),
  });
}

export function useContact(id: string) {
  return useQuery<any>({
    queryKey: ["/api/contacts", id],
    queryFn: () => fetchAndDecryptItem(`/api/contacts/${encodeURIComponent(id)}`),
    enabled: !!id,
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (data: any) => {
      const encryptedData = await encryptDataPayload({
        name: data.name,
        email: data.email,
        phone: data.phone,
        avatar: data.avatar
      });
      const payload = {
        targetUserId: data.targetUserId,
        nameBlindIndex: btoa(data.name || ""),
        status: data.status || "offline",
        publicKey: data.publicKey,
        encryptedData
      };
      const res = await apiRequest("POST", "/api/contacts", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: "Kişi eklendi", description: "Yeni kişi başarıyla eklendi." });
    },
    onError: (error: Error) => {
      toast({ title: "Hata", description: error.message, variant: "destructive" });
    },
  });
}

export function useConversations() {
  return useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
    queryFn: () => fetchJson<Conversation[]>("/api/conversations"),
  });
}

export function useConversation(id: string) {
  return useQuery<Conversation>({
    queryKey: ["/api/conversations", id],
    queryFn: () => fetchJson<Conversation>(`/api/conversations/${encodeURIComponent(id)}`),
    enabled: !!id,
  });
}

export function useMessages(conversationId: string) {
  return useQuery<Message[]>({
    queryKey: ["/api/conversations", conversationId, "messages"],
    queryFn: () => fetchJson<Message[]>(`/api/conversations/${encodeURIComponent(conversationId)}/messages`),
    enabled: !!conversationId,
  });
}



export function useAccountingEntries() {
  return useQuery<any[]>({
    queryKey: ["/api/accounting"],
    queryFn: () => fetchAndDecryptArray("/api/accounting"),
  });
}

export function useAccountingEntry(id: string) {
  return useQuery<any>({
    queryKey: ["/api/accounting", id],
    queryFn: () => fetchAndDecryptItem(`/api/accounting/${encodeURIComponent(id)}`),
    enabled: !!id,
  });
}

export function useCreateAccountingEntry() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (data: any) => {
      const encryptedData = await encryptDataPayload({
        description: data.description,
        amount: data.amount,
        reference: data.reference,
        tags: data.tags
      });
      const payload = {
        walletId: data.walletId,
        transactionId: data.transactionId,
        category: data.category,
        date: data.date,
        encryptedData
      };
      const res = await apiRequest("POST", "/api/accounting", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting"] });
      toast({ title: "Kayıt oluşturuldu", description: "Muhasebe kaydı başarıyla eklendi." });
    },
    onError: (error: Error) => {
      toast({ title: "Hata", description: error.message, variant: "destructive" });
    },
  });
}

export function useUpdateAccountingEntry() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<any>) => {
      let encryptedData;
      if (data.description !== undefined || data.amount !== undefined || data.reference !== undefined || data.tags !== undefined) {
        encryptedData = await encryptDataPayload({
          description: data.description,
          amount: data.amount,
          reference: data.reference,
          tags: data.tags
        });
      }
      
      const payload = {
        category: data.category,
        walletId: data.walletId,
        transactionId: data.transactionId,
        date: data.date,
        ...(encryptedData ? { encryptedData } : {})
      };
      const res = await apiRequest("PATCH", `/api/accounting/${id}`, payload);
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting", variables.id] });
      toast({ title: "Kayıt güncellendi", description: "Muhasebe kaydı başarıyla güncellendi." });
    },
    onError: (error: Error) => {
      toast({ title: "Hata", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteAccountingEntry() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/accounting/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting"] });
      toast({ title: "Kayıt silindi", description: "Muhasebe kaydı başarıyla silindi." });
    },
    onError: (error: Error) => {
      toast({ title: "Hata", description: error.message, variant: "destructive" });
    },
  });
}

export function useCallSessions() {
  return useQuery<CallSession[]>({
    queryKey: ["/api/calls"],
    queryFn: () => fetchJson<CallSession[]>("/api/calls"),
  });
}

export function useDashboardStats() {
  return useQuery<{
    activeCases: number;
    pendingDocuments: number;
    monthlyIncome: number;
    unreadMessages: number;
    totalBalance: number;
  }>({
    queryKey: ["/api/dashboard/stats"],
    queryFn: () => fetchJson("/api/dashboard/stats"),
  });
}

export function usePresentations() {
  return useQuery<any[]>({
    queryKey: ["/api/presentations"],
    queryFn: () => fetchAndDecryptArray("/api/presentations"),
  });
}

export function usePresentation(id: string) {
  return useQuery<any>({
    queryKey: ["/api/presentations", id],
    queryFn: () => fetchAndDecryptItem(`/api/presentations/${encodeURIComponent(id)}`),
    enabled: !!id,
  });
}

export function useCreatePresentation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (data: any) => {
      const encryptedData = await encryptDataPayload({
        title: data.title,
        description: data.description,
        thumbnail: data.thumbnail
      });
      const payload = {
        format: data.format,
        status: data.status,
        caseId: data.caseId,
        slideCount: data.slideCount,
        aiGenerated: data.aiGenerated,
        sourceDocumentId: data.sourceDocumentId,
        encryptedData
      };
      const res = await apiRequest("POST", "/api/presentations", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/presentations"] });
      toast({ title: "Sunum oluşturuldu", description: "Yeni sunum başarıyla eklendi." });
    },
    onError: (error: Error) => {
      toast({ title: "Hata", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeletePresentation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/presentations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/presentations"] });
      toast({ title: "Sunum silindi", description: "Sunum başarıyla silindi." });
    },
    onError: (error: Error) => {
      toast({ title: "Hata", description: error.message, variant: "destructive" });
    },
  });
}

// ========== Chat Invites ==========
export function useChatInvites() {
  return useQuery<any[]>({
    queryKey: ["/api/chat-invites"],
    queryFn: () => fetchJson<any[]>("/api/chat-invites"),
  });
}

export function useCreateChatInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { publicKey?: string }) => {
      const res = await apiRequest("POST", "/api/chat-invites", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat-invites"] });
    },
  });
}

export function useJoinChatInvite() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (data: { code: string; publicKey?: string }) => {
      const res = await apiRequest("POST", "/api/chat-invites/join", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      toast({ title: "Sohbet başlatıldı", description: "Kişi rehberinize eklendi." });
    },
    onError: (error: Error) => {
      toast({ title: "Hata", description: error.message, variant: "destructive" });
    },
  });
}

// ========== Alias & User Search ==========
export function useSetAlias() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (data: { username: string }) => {
      const res = await apiRequest("POST", "/api/auth/alias", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Kullanıcı Adı Ayarlandı", description: "Kullanıcı adınız başarıyla kaydedildi." });
    },
    onError: (error: Error) => {
      toast({ title: "Hata", description: error.message, variant: "destructive" });
    },
  });
}

export function useSearchUsers(query: string) {
  return useQuery<any[]>({
    queryKey: ["/api/users/search", query],
    queryFn: () => fetchJson<any[]>(`/api/users/search?q=${encodeURIComponent(query)}`),
    enabled: query.length >= 2,
  });
}

export function useStartDirectChat() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (data: { targetUserId: number; targetPublicKey?: string; userPublicKey?: string }) => {
      const res = await apiRequest("POST", "/api/conversations/direct", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    },
    onError: (error: Error) => {
      toast({ title: "Hata", description: error.message, variant: "destructive" });
    },
  });
}

export function useArchiveConversation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/conversations/${id}/archive`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      toast({ title: "Başarılı", description: "Sohbet arşivlendi." });
    },
    onError: (error: Error) => {
      toast({ title: "Hata", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/conversations/${id}/delete`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      toast({ title: "Başarılı", description: "Sohbet silindi." });
    },
    onError: (error: Error) => {
      toast({ title: "Hata", description: error.message, variant: "destructive" });
    },
  });
}

export function useBlockContact() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/contacts/${id}/block`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      toast({ title: "Başarılı", description: "Kişi durumu güncellendi." });
    },
    onError: (error: Error) => {
      toast({ title: "Hata", description: error.message, variant: "destructive" });
    },
  });
}
