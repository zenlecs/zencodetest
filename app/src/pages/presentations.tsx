import { useState, useRef, useEffect } from "react";
import {
  FileText,
  Plus,
  Search,
  FolderOpen,
  Presentation as PresentationIcon,
  Trash2,
  Download,
  Share2,
  MoreHorizontal,
  Grid,
  List,
  Clock,
  ChevronRight,
  Eye,
  Edit3,
  Upload,
  Sparkles,
  Wand2,
  FileSliders,
  Type,
  Square,
  Circle,
  Image,
  ListOrdered,
  ChevronLeft,
  Save,
  Play,
  Settings,
  PanelLeft,
  Loader2,
  FileDown,
  X,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCases, usePresentations, useCreatePresentation, useDeletePresentation } from "@/hooks/use-api";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Slide, SlideElement } from "@shared/schema";
interface PresentationType {
  id?: any;
  userId?: any;
  title?: string;
  description?: string;
  format?: string;
  status?: string;
  slideCount?: number;
  aiGenerated?: boolean;
  createdAt?: any;
  updatedAt?: any;
  [key: string]: any;
}

interface AIJobResponse {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  presentationId?: string | null;
  output?: { presentationId?: string } | null;
  error?: string | null;
}

const formatConfig: Record<string, { label: string; color: string; icon: typeof FileText }> = {
  pptx: { label: "PowerPoint", color: "bg-orange-500/10 text-orange-600", icon: FileSliders },
  pdf: { label: "PDF", color: "bg-red-500/10 text-red-600", icon: FileText },
};

const layoutOptions = [
  { value: "title", label: "Başlık Slaytı" },
  { value: "content", label: "İçerik" },
  { value: "two-column", label: "İki Sütun" },
  { value: "image-left", label: "Resim Sol" },
  { value: "image-right", label: "Resim Sağ" },
  { value: "comparison", label: "Karşılaştırma" },
  { value: "timeline", label: "Zaman Çizelgesi" },
  { value: "blank", label: "Boş" },
];

type EditorMode = "list" | "editor";
type CreationMode = "manual-pptx" | "manual-pdf" | "ai";

interface LocalSlide {
  id: string;
  title: string;
  layout: string;
  elements: LocalElement[];
  notes: string;
}

interface LocalElement {
  id: string;
  type: "text" | "image" | "shape" | "list";
  content: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export default function PresentationsPage() {
  const [selectedCase, setSelectedCase] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [editorMode, setEditorMode] = useState<EditorMode>("list");
  const [creationMode, setCreationMode] = useState<CreationMode>("manual-pptx");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showTitle, setShowTitle] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => setShowTitle(true), 100);
    return () => clearTimeout(timer);
  }, []);

  
  const [currentPresentation, setCurrentPresentation] = useState<PresentationType | null>(null);
  const [slides, setSlides] = useState<LocalSlide[]>([]);
  const [selectedSlideIndex, setSelectedSlideIndex] = useState(0);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  
  const [aiContent, setAiContent] = useState("");
  const [aiSlideCount, setAiSlideCount] = useState(10);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  
  const { toast } = useToast();
  const { data: cases, isLoading: casesLoading } = useCases();
  const { data: presentations, isLoading: presentationsLoading } = usePresentations();
  const createPresentation = useCreatePresentation();
  const deletePresentation = useDeletePresentation();

  const { data: currentJob, refetch: refetchJob } = useQuery<AIJobResponse>({
    queryKey: ["/api/ai-jobs", currentJobId],
    enabled: !!currentJobId,
    refetchInterval: currentJobId ? 2000 : false,
  });

  useEffect(() => {
    if (currentJob?.status === "completed" && currentJob.output?.presentationId) {
      toast({
        title: "Sunum oluşturuldu",
        description: "AI tarafından sunum başarıyla oluşturuldu.",
      });
      setCurrentJobId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/presentations"] });
    } else if (currentJob?.status === "failed") {
      toast({
        title: "Hata",
        description: currentJob.error || "Sunum oluşturulamadı",
        variant: "destructive",
      });
      setCurrentJobId(null);
    }
  }, [currentJob, toast]);

  const generateAIMutation = useMutation({
    mutationFn: async (data: { content: string; slideCount: number }) => {
      const response = await apiRequest("POST", "/api/ai/generate-presentation", data);
      return response.json();
    },
    onSuccess: (data) => {
      setCurrentJobId(data.jobId);
      toast({
        title: "Oluşturuluyor...",
        description: "AI sunumunuz hazırlanıyor, lütfen bekleyin.",
      });
    },
    onError: () => {
      toast({
        title: "Hata",
        description: "AI oluşturma başlatılamadı",
        variant: "destructive",
      });
    },
  });

  const filteredPresentations = presentations?.filter((p) => {
    const matchesSearch = !searchQuery || (p as any).title.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  }) || [];

  const handleNewPresentation = (mode: CreationMode) => {
    setCreationMode(mode);
    
    if (mode === "ai") {
      setDialogOpen(true);
    } else {
      const newPres: PresentationType = {
        id: `temp-${Date.now()}`,
        userId: "user-1",
        title: mode === "manual-pptx" ? "Yeni PowerPoint" : "Yeni PDF",
        description: undefined,
        format: mode === "manual-pptx" ? "pptx" : "pdf",
        status: "draft",
        slideCount: 0,
        aiGenerated: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setCurrentPresentation(newPres);
      setSlides([{
        id: `slide-1`,
        title: "Başlık Slaytı",
        layout: "title",
        elements: [{
          id: `elem-1`,
          type: "text",
          content: "Sunum Başlığı",
          x: 100,
          y: 180,
          width: 600,
          height: 80,
        }],
        notes: "",
      }]);
      setSelectedSlideIndex(0);
      setEditorMode("editor");
    }
  };

  const handleEditPresentation = async (pres: PresentationType) => {
    setCurrentPresentation(pres);
    setCreationMode(pres.format === "pptx" ? "manual-pptx" : "manual-pdf");
    
    try {
      const response = await fetch(`/api/presentations/${pres.id}/slides`);
      const slidesData = await response.json();
      
      const localSlides: LocalSlide[] = await Promise.all(
        slidesData.map(async (slide: Slide) => {
          const elemResponse = await fetch(`/api/slides/${slide.id}/elements`);
          const elements = await elemResponse.json();
          return {
            id: slide.id,
            title: slide.title || "",
            layout: slide.layout,
            elements: elements.map((e: SlideElement) => ({
              id: e.id,
              type: e.type,
              content: e.content,
              x: e.x,
              y: e.y,
              width: e.width,
              height: e.height,
            })),
            notes: slide.notes || "",
          };
        })
      );
      
      setSlides(localSlides.length > 0 ? localSlides : [{
        id: `slide-1`,
        title: "Başlık Slaytı",
        layout: "title",
        elements: [],
        notes: "",
      }]);
      setSelectedSlideIndex(0);
      setEditorMode("editor");
    } catch {
      setSlides([{
        id: `slide-1`,
        title: "Başlık Slaytı",
        layout: "title",
        elements: [],
        notes: "",
      }]);
      setEditorMode("editor");
    }
  };

  const handleAIGenerate = () => {
    if (!aiContent.trim()) {
      toast({
        title: "Hata",
        description: "Lütfen içerik girin",
        variant: "destructive",
      });
      return;
    }
    generateAIMutation.mutate({ content: aiContent, slideCount: aiSlideCount });
    setDialogOpen(false);
    setAiContent("");
  };

  const addSlide = () => {
    const newSlide: LocalSlide = {
      id: `slide-${Date.now()}`,
      title: `Slayt ${slides.length + 1}`,
      layout: "content",
      elements: [],
      notes: "",
    };
    setSlides([...slides, newSlide]);
    setSelectedSlideIndex(slides.length);
  };

  const deleteSlide = (index: number) => {
    if (slides.length <= 1) return;
    const newSlides = slides.filter((_, i) => i !== index);
    setSlides(newSlides);
    setSelectedSlideIndex(Math.min(index, newSlides.length - 1));
  };

  const addElement = (type: "text" | "image" | "shape" | "list") => {
    const currentSlide = slides[selectedSlideIndex];
    const newElement: LocalElement = {
      id: `elem-${Date.now()}`,
      type,
      content: type === "text" ? "Metin girin..." : type === "list" ? "• Madde 1\n• Madde 2\n• Madde 3" : "",
      x: 100 + (currentSlide.elements.length * 20),
      y: 150 + (currentSlide.elements.length * 20),
      width: type === "text" ? 400 : 200,
      height: type === "text" ? 60 : 150,
    };
    
    const updatedSlides = [...slides];
    updatedSlides[selectedSlideIndex] = {
      ...currentSlide,
      elements: [...currentSlide.elements, newElement],
    };
    setSlides(updatedSlides);
    setSelectedElementId(newElement.id);
  };

  const updateElement = (elementId: string, updates: Partial<LocalElement>) => {
    const updatedSlides = slides.map((slide, i) => {
      if (i !== selectedSlideIndex) return slide;
      return {
        ...slide,
        elements: slide.elements.map((elem) =>
          elem.id === elementId ? { ...elem, ...updates } : elem
        ),
      };
    });
    setSlides(updatedSlides);
  };

  const deleteElement = (elementId: string) => {
    const updatedSlides = slides.map((slide, i) => {
      if (i !== selectedSlideIndex) return slide;
      return {
        ...slide,
        elements: slide.elements.filter((elem) => elem.id !== elementId),
      };
    });
    setSlides(updatedSlides);
    setSelectedElementId(null);
  };

  const handleSavePresentation = async () => {
    if (!currentPresentation) return;
    
    try {
      let presId: any = currentPresentation.id;
      
      if (String(presId).startsWith("temp-")) {
        const response = await apiRequest("POST", "/api/presentations", {
          title: currentPresentation.title,
          description: currentPresentation.description,
          format: currentPresentation.format,
          status: "draft",
        });
        const newPres = await response.json();
        presId = newPres.id;
        setCurrentPresentation(newPres);
      } else {
        await apiRequest("PATCH", `/api/presentations/${presId}`, {
          title: currentPresentation.title,
          updatedAt: new Date(),
        });
      }
      
      for (let i = 0; i < slides.length; i++) {
        const slide = slides[i];
        
        const slideResponse = await apiRequest("POST", "/api/slides", {
          presentationId: presId,
          order: i + 1,
          title: slide.title,
          layout: slide.layout,
          notes: slide.notes,
          backgroundColor: null,
          backgroundImage: null,
        });
        const savedSlide = await slideResponse.json();
        
        for (let j = 0; j < slide.elements.length; j++) {
          const elem = slide.elements[j];
          await apiRequest("POST", "/api/elements", {
            slideId: savedSlide.id,
            type: elem.type,
            content: elem.content,
            x: elem.x,
            y: elem.y,
            width: elem.width,
            height: elem.height,
            order: j + 1,
            style: null,
          });
        }
      }
      
      queryClient.invalidateQueries({ queryKey: ["/api/presentations"] });
      toast({
        title: "Kaydedildi",
        description: "Sunum başarıyla kaydedildi",
      });
    } catch {
      toast({
        title: "Hata",
        description: "Sunum kaydedilemedi",
        variant: "destructive",
      });
    }
  };

  const handleExport = async (format: "pptx" | "pdf") => {
    if (!currentPresentation || String(currentPresentation.id).startsWith("temp-")) {
      toast({
        title: "Hata",
        description: "Önce sunumu kaydedin",
        variant: "destructive",
      });
      return;
    }
    
    try {
      const response = await fetch(`/api/presentations/${currentPresentation.id}/export/${format}`);
      if (!response.ok) throw new Error("Export failed");
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${currentPresentation.title}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "İndirildi",
        description: `${format.toUpperCase()} dosyası indirildi`,
      });
    } catch {
      toast({
        title: "Hata",
        description: "Dosya indirilemedi",
        variant: "destructive",
      });
    }
  };

  const currentSlide = slides[selectedSlideIndex];
  const selectedElement = currentSlide?.elements.find((e) => e.id === selectedElementId);

  if (editorMode === "editor") {
    return (
      <div className="flex flex-col h-full bg-muted/30">
        <div className="h-14 border-b border-border bg-background flex items-center justify-between px-4 gap-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setEditorMode("list")}
              data-testid="button-back-to-list"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-2">
              {creationMode === "manual-pptx" ? (
                <FileSliders className="w-5 h-5 text-orange-500" />
              ) : (
                <FileText className="w-5 h-5 text-red-500" />
              )}
              <Input
                value={currentPresentation?.title || ""}
                onChange={(e) =>
                  setCurrentPresentation((prev: any) =>
                    prev ? { ...prev, title: e.target.value } : null
                  )
                }
                className="w-64 h-8 font-medium"
                style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 500 }}
                data-testid="input-presentation-title"
              />
            </div>
            <Badge variant="secondary">
              {creationMode === "manual-pptx" ? "PPTX" : "PDF"}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleSavePresentation} data-testid="button-save">
              <Save className="w-4 h-4 mr-2" />
              Kaydet
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" data-testid="button-export">
                  <Download className="w-4 h-4 mr-2" />
                  İndir
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleExport("pptx")}>
                  <FileSliders className="w-4 h-4 mr-2 text-orange-500" />
                  PowerPoint (.pptx)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("pdf")}>
                  <FileText className="w-4 h-4 mr-2 text-red-500" />
                  PDF (.pdf)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="w-56 border-r border-border bg-background flex flex-col">
            <div className="p-3 border-b border-border flex items-center justify-between">
              <span className="text-sm font-medium" style={{ fontFamily: "Montserrat, sans-serif" }}>
                Slaytlar
              </span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={addSlide} data-testid="button-add-slide">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-2">
                {slides.map((slide, index) => (
                  <div
                    key={slide.id}
                    onClick={() => setSelectedSlideIndex(index)}
                    className={`relative group cursor-pointer rounded-lg border-2 transition-colors ${
                      index === selectedSlideIndex
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                    data-testid={`slide-thumbnail-${index}`}
                  >
                    <div className="aspect-video bg-white dark:bg-slate-800 rounded-md overflow-hidden p-2">
                      <div className="text-[8px] font-medium truncate" style={{ fontFamily: "Montserrat, sans-serif" }}>
                        {slide.title || `Slayt ${index + 1}`}
                      </div>
                      <div className="text-[6px] text-muted-foreground mt-1">
                        {slide.elements.length} element
                      </div>
                    </div>
                    <div className="absolute bottom-1 left-1.5 text-[10px] text-muted-foreground">
                      {index + 1}
                    </div>
                    {slides.length > 1 && (
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute top-1 right-1 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteSlide(index);
                        }}
                        data-testid={`button-delete-slide-${index}`}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          <div className="flex-1 flex flex-col">
            <div className="h-12 border-b border-border bg-background/80 backdrop-blur flex items-center gap-1 px-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => addElement("text")}
                data-testid="button-add-text"
              >
                <Type className="w-4 h-4 mr-1" />
                Metin
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => addElement("list")}
                data-testid="button-add-list"
              >
                <ListOrdered className="w-4 h-4 mr-1" />
                Liste
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => addElement("shape")}
                data-testid="button-add-shape"
              >
                <Square className="w-4 h-4 mr-1" />
                Şekil
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => addElement("image")}
                data-testid="button-add-image"
              >
                <Image className="w-4 h-4 mr-1" />
                Resim
              </Button>
              <div className="flex-1" />
              <Select
                value={currentSlide?.layout || "content"}
                onValueChange={(value) => {
                  const updatedSlides = [...slides];
                  updatedSlides[selectedSlideIndex] = {
                    ...currentSlide,
                    layout: value,
                  };
                  setSlides(updatedSlides);
                }}
              >
                <SelectTrigger className="w-40 h-8" data-testid="select-layout">
                  <SelectValue placeholder="Düzen" />
                </SelectTrigger>
                <SelectContent>
                  {layoutOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 p-6 flex items-center justify-center overflow-auto">
              <div
                className="relative bg-white dark:bg-slate-800 rounded-lg shadow-xl"
                style={{ width: 800, height: 450, minWidth: 800, minHeight: 450 }}
                data-testid="slide-canvas"
              >
                <div className="absolute top-4 left-4 right-4">
                  <Input
                    value={currentSlide?.title || ""}
                    onChange={(e) => {
                      const updatedSlides = [...slides];
                      updatedSlides[selectedSlideIndex] = {
                        ...currentSlide,
                        title: e.target.value,
                      };
                      setSlides(updatedSlides);
                    }}
                    className="text-xl font-bold border-none bg-transparent p-0 h-auto focus-visible:ring-0"
                    placeholder="Slayt başlığı..."
                    style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 600 }}
                    data-testid="input-slide-title"
                  />
                </div>

                {currentSlide?.elements.map((elem) => (
                  <div
                    key={elem.id}
                    onClick={() => setSelectedElementId(elem.id)}
                    className={`absolute cursor-move transition-all ${
                      elem.id === selectedElementId
                        ? "ring-2 ring-primary ring-offset-2"
                        : "hover:ring-1 hover:ring-primary/50"
                    }`}
                    style={{
                      left: elem.x,
                      top: elem.y,
                      width: elem.width,
                      height: elem.height,
                    }}
                    data-testid={`element-${elem.id}`}
                  >
                    {elem.type === "text" && (
                      <Textarea
                        value={elem.content}
                        onChange={(e) => updateElement(elem.id, { content: e.target.value })}
                        className="w-full h-full resize-none border-none bg-transparent focus-visible:ring-0 text-sm"
                        placeholder="Metin girin..."
                        style={{ fontFamily: "Montserrat, sans-serif" }}
                      />
                    )}
                    {elem.type === "list" && (
                      <Textarea
                        value={elem.content}
                        onChange={(e) => updateElement(elem.id, { content: e.target.value })}
                        className="w-full h-full resize-none border-none bg-transparent focus-visible:ring-0 text-sm"
                        placeholder="• Madde 1"
                        style={{ fontFamily: "Montserrat, sans-serif" }}
                      />
                    )}
                    {elem.type === "shape" && (
                      <div className="w-full h-full bg-primary/10 border-2 border-primary/30 rounded-lg flex items-center justify-center">
                        <Square className="w-8 h-8 text-primary/40" />
                      </div>
                    )}
                    {elem.type === "image" && (
                      <div className="w-full h-full bg-muted border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-2">
                        <Image className="w-8 h-8 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Resim yükle</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="h-24 border-t border-border bg-background p-3">
              <Textarea
                value={currentSlide?.notes || ""}
                onChange={(e) => {
                  const updatedSlides = [...slides];
                  updatedSlides[selectedSlideIndex] = {
                    ...currentSlide,
                    notes: e.target.value,
                  };
                  setSlides(updatedSlides);
                }}
                placeholder="Sunucu notları..."
                className="h-full resize-none text-sm"
                style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 300 }}
                data-testid="textarea-notes"
              />
            </div>
          </div>

          {selectedElement && (
            <div className="w-64 border-l border-border bg-background p-4">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium" style={{ fontFamily: "Montserrat, sans-serif" }}>
                  Element
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={() => deleteElement(selectedElement.id)}
                  data-testid="button-delete-element"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-muted-foreground">Konum X</label>
                  <Input
                    type="number"
                    value={selectedElement.x}
                    onChange={(e) => updateElement(selectedElement.id, { x: Number(e.target.value) })}
                    className="h-8"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Konum Y</label>
                  <Input
                    type="number"
                    value={selectedElement.y}
                    onChange={(e) => updateElement(selectedElement.id, { y: Number(e.target.value) })}
                    className="h-8"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Genişlik</label>
                  <Input
                    type="number"
                    value={selectedElement.width}
                    onChange={(e) => updateElement(selectedElement.id, { width: Number(e.target.value) })}
                    className="h-8"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Yükseklik</label>
                  <Input
                    type="number"
                    value={selectedElement.height}
                    onChange={(e) => updateElement(selectedElement.id, { height: Number(e.target.value) })}
                    className="h-8"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div
              className={`transition-all duration-700 ease-out ${
                showTitle ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
              }`}
            >
              <h1
                className="text-xl font-semibold tracking-tight"
                data-testid="text-presentations-title"
                style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 600 }}
              >
                Sunumlar
              </h1>
              <p className="text-sm text-muted-foreground" style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 300 }}>
                PowerPoint ve PDF sunumlarınız
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Sunum ara..."
                  className="pl-8 h-8 w-48 sm:w-56"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  data-testid="input-search-presentations"
                />
              </div>
              <div className="flex border rounded-md overflow-hidden">
                <Button
                  variant={viewMode === "grid" ? "default" : "ghost"}
                  size="icon"
                  className="rounded-none h-8 w-8"
                  onClick={() => setViewMode("grid")}
                  data-testid="button-view-grid"
                >
                  <Grid className="w-4 h-4" />
                </Button>
                <Button
                  variant={viewMode === "list" ? "default" : "ghost"}
                  size="icon"
                  className="rounded-none h-8 w-8"
                  onClick={() => setViewMode("list")}
                  data-testid="button-view-list"
                >
                  <List className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {currentJobId && (
            <Card className="p-3 border-blue-500/40 bg-blue-500/5">
              <div className="flex items-center gap-3">
                <Loader2 className="w-4 h-4 text-blue-500 animate-spin flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ fontFamily: "Montserrat, sans-serif" }}>
                    Zenlecs+ AI sunum oluşturuyor...
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentJobId(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          )}

          {presentationsLoading ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-36 rounded-lg" />
              ))}
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
                {filteredPresentations.map((pres) => {
                  const format = formatConfig[pres.format] || formatConfig.pptx;
                  const FormatIcon = format.icon;
                  return (
                    <Card
                      key={pres.id}
                      className="p-4 hover-elevate cursor-pointer group"
                      onClick={() => handleEditPresentation(pres)}
                      data-testid={`presentation-card-${pres.id}`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className={`w-12 h-12 rounded-xl ${format.color} flex items-center justify-center`}>
                          <FormatIcon className="w-6 h-6" />
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEditPresentation(pres)}>
                              <Edit3 className="w-4 h-4 mr-2" />
                              Düzenle
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleExport(pres.format as "pptx" | "pdf")}>
                              <Download className="w-4 h-4 mr-2" />
                              İndir
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                deletePresentation.mutate(pres.id);
                              }}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Sil
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <h3
                        className="font-medium text-sm mb-1 line-clamp-2"
                        style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 500 }}
                      >
                        {(pres as any).title}
                      </h3>
                      <p
                        className="text-xs text-muted-foreground mb-3"
                        style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 300 }}
                      >
                        {(pres as any).description || "Açıklama yok"}
                      </p>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <Badge variant="secondary" className={format.color}>
                          {format.label}
                        </Badge>
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{new Date(pres.updatedAt).toLocaleDateString("tr-TR")}</span>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredPresentations.map((pres) => {
                  const format = formatConfig[pres.format] || formatConfig.pptx;
                  const FormatIcon = format.icon;
                  return (
                    <Card
                      key={pres.id}
                      className="p-4 hover-elevate cursor-pointer group"
                      onClick={() => handleEditPresentation(pres)}
                      data-testid={`presentation-row-${pres.id}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-lg ${format.color} flex items-center justify-center flex-shrink-0`}>
                          <FormatIcon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3
                            className="font-medium text-sm truncate"
                            style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 500 }}
                          >
                            {(pres as any).title}
                          </h3>
                          <p
                            className="text-xs text-muted-foreground"
                            style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 300 }}
                          >
                            {(pres as any).description || "Açıklama yok"}
                          </p>
                        </div>
                        <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground">
                          <Badge variant="secondary" className={format.color}>
                            {format.label}
                          </Badge>
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{new Date(pres.updatedAt).toLocaleDateString("tr-TR")}</span>
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEditPresentation(pres)}>
                              <Edit3 className="w-4 h-4 mr-2" />
                              Düzenle
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleExport(pres.format as "pptx" | "pdf")}>
                              <Download className="w-4 h-4 mr-2" />
                              İndir
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                deletePresentation.mutate(pres.id);
                              }}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Sil
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}

            {filteredPresentations.length === 0 && !presentationsLoading && (
              <div className="text-center py-10">
                <PresentationIcon className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <h3 className="text-base font-medium mb-1" style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 500 }}>
                  Henüz sunum yok
                </h3>
                <p className="text-muted-foreground text-sm mb-4" style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 300 }}>
                  Aşağıdaki butonlardan yeni bir sunum oluşturun
                </p>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="border-t border-border/50 bg-background/80 backdrop-blur-sm px-3 py-2">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2.5 gap-1.5 text-xs"
                onClick={() => handleNewPresentation("manual-pptx")}
                data-testid="button-new-pptx"
              >
                <FileSliders className="w-3.5 h-3.5 text-orange-500" />
                <span style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 400 }}>PPTX</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2.5 gap-1.5 text-xs"
                onClick={() => handleNewPresentation("manual-pdf")}
                data-testid="button-new-pdf"
              >
                <FileText className="w-3.5 h-3.5 text-red-500" />
                <span style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 400 }}>PDF</span>
              </Button>
              <button
                onClick={() => handleNewPresentation("ai")}
                data-testid="button-new-ai"
                className="relative h-7 px-3 rounded-lg text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-all duration-300"
                style={{
                  background: "linear-gradient(90deg, #5bfcc4, #f593e4, #71a4f0)",
                  boxShadow: "inset 0px 0px 4px rgba(255,255,255,0.6), inset 0px 20px 20px rgba(0,0,0,0.8), 0px 3px 8px rgba(0,0,0,0.5)",
                  textShadow: "1px 1px 1px #000",
                  fontFamily: "Montserrat, sans-serif"
                }}
              >
                <svg viewBox="0 0 24 24" height={14} width={14} xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                  <path d="M9.107 5.448c.598-1.75 3.016-1.803 3.725-.159l.06.16l.807 2.36a4 4 0 0 0 2.276 2.411l.217.081l2.36.806c1.75.598 1.803 3.016.16 3.725l-.16.06l-2.36.807a4 4 0 0 0-2.412 2.276l-.081.216l-.806 2.361c-.598 1.75-3.016 1.803-3.724.16l-.062-.16l-.806-2.36a4 4 0 0 0-2.276-2.412l-.216-.081l-2.36-.806c-1.751-.598-1.804-3.016-.16-3.724l.16-.062l2.36-.806A4 4 0 0 0 8.22 8.025l.081-.216zM11 6.094l-.806 2.36a6 6 0 0 1-3.49 3.649l-.25.091l-2.36.806l2.36.806a6 6 0 0 1 3.649 3.49l.091.25l.806 2.36l.806-2.36a6 6 0 0 1 3.49-3.649l.25-.091l2.36-.806l-2.36-.806a6 6 0 0 1-3.649-3.49l-.091-.25zM19 2a1 1 0 0 1 .898.56l.048.117l.35 1.026l1.027.35a1 1 0 0 1 .118 1.845l-.118.048l-1.026.35l-.35 1.027a1 1 0 0 1-1.845.117l-.048-.117l-.35-1.026l-1.027-.35a1 1 0 0 1-.118-1.845l.118-.048l1.026-.35l.35-1.027A1 1 0 0 1 19 2" />
                </svg>
                Zenlecs+
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <Select value={selectedCase || "all"} onValueChange={(v) => setSelectedCase(v === "all" ? null : v)}>
                <SelectTrigger className="h-7 w-32 text-xs border-0 bg-muted/50">
                  <SelectValue placeholder="Tüm Sunumlar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tümü</SelectItem>
                  {cases?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground tabular-nums">{presentations?.length || 0}</span>
            </div>
          </div>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 500 }}>
              <Sparkles className="w-5 h-5 text-blue-500" />
              Zenlecs+ AI ile Sunum Oluştur
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 400 }}>
                İçerik veya Konu
              </label>
              <Textarea
                placeholder="Sunumunuzun konusunu veya içeriğini buraya yapıştırın. AI, bu içeriği analiz ederek profesyonel bir sunum oluşturacak..."
                value={aiContent}
                onChange={(e) => setAiContent(e.target.value)}
                className="min-h-[200px]"
                data-testid="textarea-ai-content"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium" style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 400 }}>
                Slayt Sayısı
              </label>
              <Select value={String(aiSlideCount)} onValueChange={(v) => setAiSlideCount(Number(v))}>
                <SelectTrigger data-testid="select-slide-count">
                  <SelectValue placeholder="Slayt sayısı" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 slayt</SelectItem>
                  <SelectItem value="10">10 slayt</SelectItem>
                  <SelectItem value="15">15 slayt</SelectItem>
                  <SelectItem value="20">20 slayt</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors cursor-pointer">
              <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground" style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 300 }}>
                Belge yüklemek için tıklayın (PDF, DOCX, TXT)
              </p>
              <p className="text-xs text-muted-foreground mt-1">Max 10MB</p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                İptal
              </Button>
              <Button
                onClick={handleAIGenerate}
                disabled={!aiContent.trim() || generateAIMutation.isPending}
                className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
                data-testid="button-generate-ai"
              >
                {generateAIMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Oluşturuluyor...
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4 mr-2" />
                    Oluştur
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
