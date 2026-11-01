import jsPDF from "jspdf";
import type { Presentation, Slide, SlideElement } from "@shared/schema";

interface SlideData {
  slide: Slide;
  elements: SlideElement[];
}

export async function generatePdfBuffer(
  presentation: Presentation,
  slidesData: SlideData[]
): Promise<Buffer> {
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [297, 167],
  });

  const pageWidth = 297;
  const pageHeight = 167;
  const margin = 15;

  for (let i = 0; i < slidesData.length; i++) {
    if (i > 0) {
      pdf.addPage();
    }

    const { slide, elements } = slidesData[i];

    if (slide.backgroundColor) {
      pdf.setFillColor(slide.backgroundColor);
      pdf.rect(0, 0, pageWidth, pageHeight, "F");
    }

    if (slide.title) {
      pdf.setFontSize(slide.layout === "title" ? 28 : 20);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(30, 64, 175);
      
      const titleY = slide.layout === "title" ? pageHeight / 2 - 20 : margin + 10;
      pdf.text(slide.title, pageWidth / 2, titleY, { align: "center" });
    }

    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(51, 51, 51);
    pdf.setFontSize(12);

    for (const element of elements) {
      const xMm = (element.x / 800) * (pageWidth - 2 * margin) + margin;
      const yMm = (element.y / 450) * (pageHeight - 2 * margin) + margin;
      const wMm = (element.width / 800) * (pageWidth - 2 * margin);

      switch (element.type) {
        case "text":
          const textStyle = (element.style as any) || {};
          const fontSize = textStyle.fontSize ? Number(textStyle.fontSize) * 0.75 : 11;
          pdf.setFontSize(fontSize);
          
          const lines = pdf.splitTextToSize(element.content, wMm);
          pdf.text(lines, xMm, yMm);
          break;

        case "list":
          const listItems = element.content.split("\n").filter(Boolean);
          let currentY = yMm;
          pdf.setFontSize(11);
          
          for (const item of listItems) {
            const cleanItem = item.replace(/^[•\-\*]\s*/, "");
            pdf.text(`• ${cleanItem}`, xMm, currentY);
            currentY += 6;
          }
          break;

        case "shape":
          const hMm = (element.height / 450) * (pageHeight - 2 * margin);
          const shapeStyle = (element.style as any) || {};
          if (shapeStyle.fill) {
            pdf.setFillColor(String(shapeStyle.fill));
            pdf.rect(xMm, yMm, wMm, hMm, "F");
          } else {
            pdf.setDrawColor(156, 163, 175);
            pdf.rect(xMm, yMm, wMm, hMm, "S");
          }
          break;

        case "image":
          if (element.content.startsWith("data:")) {
            try {
              const hMm = (element.height / 450) * (pageHeight - 2 * margin);
              pdf.addImage(element.content, "PNG", xMm, yMm, wMm, hMm);
            } catch {
            }
          }
          break;
      }
    }

    pdf.setFontSize(8);
    pdf.setTextColor(156, 163, 175);
    pdf.text(`${i + 1} / ${slidesData.length}`, pageWidth - margin, pageHeight - 5, { align: "right" });
  }

  pdf.setProperties({
    title: "Encrypted Presentation",
    subject: "",
    author: "ZenOS",
    creator: "ZenOS Legal Panel",
  });

  const arrayBuffer = pdf.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}
