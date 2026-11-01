import PptxGenJS from "pptxgenjs";
import type { Presentation, Slide, SlideElement } from "@shared/schema";

interface SlideData {
  slide: Slide;
  elements: SlideElement[];
}

const LAYOUT_CONFIGS: Record<string, { titleY: number; contentY: number; contentHeight: number }> = {
  title: { titleY: 2.5, contentY: 3.5, contentHeight: 2 },
  content: { titleY: 0.5, contentY: 1.2, contentHeight: 4 },
  "two-column": { titleY: 0.5, contentY: 1.2, contentHeight: 4 },
  "image-left": { titleY: 0.5, contentY: 1.2, contentHeight: 4 },
  "image-right": { titleY: 0.5, contentY: 1.2, contentHeight: 4 },
  blank: { titleY: 0.5, contentY: 1, contentHeight: 4.5 },
  comparison: { titleY: 0.5, contentY: 1.2, contentHeight: 4 },
  timeline: { titleY: 0.5, contentY: 1.2, contentHeight: 4 },
};

export async function generatePptxBuffer(
  presentation: Presentation,
  slidesData: SlideData[]
): Promise<Buffer> {
  const pptx = new PptxGenJS();
  
  pptx.author = "ZenOS";
  pptx.title = "Encrypted Presentation";
  pptx.subject = "";
  pptx.company = "ZenOS Legal Panel";
  
  pptx.defineLayout({ name: "CUSTOM", width: 10, height: 5.625 });
  pptx.layout = "CUSTOM";

  for (const { slide, elements } of slidesData) {
    const pptxSlide = pptx.addSlide();
    const layoutConfig = LAYOUT_CONFIGS[slide.layout] || LAYOUT_CONFIGS.content;

    if (slide.backgroundColor) {
      pptxSlide.background = { color: slide.backgroundColor.replace("#", "") };
    }

    if (slide.title) {
      pptxSlide.addText(slide.title, {
        x: 0.5,
        y: layoutConfig.titleY,
        w: 9,
        h: 0.6,
        fontSize: slide.layout === "title" ? 36 : 24,
        bold: true,
        color: "1e40af",
        fontFace: "Montserrat",
      });
    }

    for (const element of elements) {
      const xInches = (element.x / 800) * 9 + 0.5;
      const yInches = (element.y / 450) * 4.5 + 0.5;
      const wInches = (element.width / 800) * 9;
      const hInches = (element.height / 450) * 4.5;

      switch (element.type) {
        case "text":
          const style = (element.style as any) || {};
          pptxSlide.addText(element.content, {
            x: xInches,
            y: yInches,
            w: wInches,
            h: hInches,
            fontSize: style.fontSize ? Number(style.fontSize) : 14,
            color: style.color ? String(style.color).replace("#", "") : "333333",
            fontFace: "Montserrat",
            valign: "top",
            wrap: true,
          });
          break;

        case "list":
          const listItems = element.content.split("\n").filter(Boolean);
          pptxSlide.addText(
            listItems.map((item) => ({
              text: item.replace(/^[•\-\*]\s*/, ""),
              options: { bullet: true },
            })),
            {
              x: xInches,
              y: yInches,
              w: wInches,
              h: hInches,
              fontSize: 14,
              color: "333333",
              fontFace: "Montserrat",
              valign: "top",
            }
          );
          break;

        case "shape":
          const shapeStyle = (element.style as any) || {};
          pptxSlide.addShape("rect", {
            x: xInches,
            y: yInches,
            w: wInches,
            h: hInches,
            fill: { color: shapeStyle.fill ? String(shapeStyle.fill).replace("#", "") : "e5e7eb" },
            line: { color: shapeStyle.stroke ? String(shapeStyle.stroke).replace("#", "") : "9ca3af", width: 1 },
          });
          break;

        case "image":
          if (element.content.startsWith("data:")) {
            pptxSlide.addImage({
              data: element.content,
              x: xInches,
              y: yInches,
              w: wInches,
              h: hInches,
            });
          }
          break;

        case "chart":
          break;
      }
    }

    if (slide.notes) {
      pptxSlide.addNotes(slide.notes);
    }
  }

  const arrayBuffer = await pptx.write({ outputType: "arraybuffer" });
  return Buffer.from(arrayBuffer as ArrayBuffer);
}
