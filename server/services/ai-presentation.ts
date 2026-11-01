import OpenAI from "openai";
import type { Slide, SlideElement, SlideLayoutType, SlideElementType } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

interface GeneratedSlide {
  title: string;
  layout: SlideLayoutType;
  elements: {
    type: SlideElementType;
    content: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }[];
  notes?: string;
}

interface PresentationOutline {
  title: string;
  description: string;
  slides: GeneratedSlide[];
}

export async function generatePresentationFromText(
  inputText: string,
  targetSlideCount: number = 10
): Promise<PresentationOutline> {
  const systemPrompt = `Sen profesyonel bir sunum tasarımcısısın. Verilen metin veya belge içeriğinden etkili sunumlar oluşturuyorsun.

Görevin:
1. Verilen içeriği analiz et
2. Ana konuları ve alt başlıkları belirle
3. Hedef slayt sayısına uygun bir sunum taslağı oluştur
4. Her slayt için uygun layout seç: "title", "content", "two-column", "image-left", "image-right", "comparison", "timeline"
5. Her slayt için metin elementleri oluştur

JSON formatında yanıt ver:
{
  "title": "Sunum başlığı",
  "description": "Kısa açıklama",
  "slides": [
    {
      "title": "Slayt başlığı",
      "layout": "content",
      "elements": [
        {
          "type": "text",
          "content": "İçerik metni",
          "x": 50,
          "y": 120,
          "width": 700,
          "height": 400
        }
      ],
      "notes": "Sunucu notları"
    }
  ]
}

Önemli:
- Bullet point'ler için "•" karakteri kullan
- Her slayt özlü ve net olsun
- Profesyonel bir dil kullan
- Türkçe içerik oluştur`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Aşağıdaki içerikten ${targetSlideCount} slaytlık bir sunum oluştur:\n\n${inputText}`,
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 4096,
  });

  const content = response.choices[0]?.message?.content || "{}";
  
  try {
    const parsed = JSON.parse(content) as PresentationOutline;
    return parsed;
  } catch {
    return {
      title: "Oluşturulan Sunum",
      description: "AI tarafından oluşturuldu",
      slides: [
        {
          title: "Başlık Slaytı",
          layout: "title",
          elements: [
            {
              type: "text",
              content: "Sunum içeriği işlenemedi",
              x: 50,
              y: 200,
              width: 700,
              height: 100,
            },
          ],
        },
      ],
    };
  }
}

export async function improveSlideContent(
  currentContent: string,
  instruction: string
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "Sen sunum içeriği geliştiren bir asistansın. Verilen talimat doğrultusunda içeriği iyileştir. Sadece geliştirilmiş içeriği döndür, açıklama ekleme.",
      },
      {
        role: "user",
        content: `Mevcut içerik:\n${currentContent}\n\nTalimat: ${instruction}`,
      },
    ],
    max_tokens: 1024,
  });

  return response.choices[0]?.message?.content || currentContent;
}

export async function generateSlideNotes(
  slideTitle: string,
  slideContent: string
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "Sen sunum sunucu notları hazırlayan bir asistansın. Slayt içeriğine göre sunucunun söyleyebileceği açıklamalar ve vurgular hazırla. Kısa ve öz ol.",
      },
      {
        role: "user",
        content: `Slayt Başlığı: ${slideTitle}\n\nSlayt İçeriği:\n${slideContent}`,
      },
    ],
    max_tokens: 512,
  });

  return response.choices[0]?.message?.content || "";
}
