import * as fs from 'fs';
import * as path from 'path';
import PDFKitDocument from 'pdfkit';
import { PDFDocument } from 'pdf-lib';

// ---- Palette + Helpers ----
const colors = {
  primary: "#2563EB",
  primaryDark: "#1E40AF",
  secondary: "#8B5CF6",
  dark: "#0F172A",
  darkGray: "#1E293B",
  mediumGray: "#475569",
  lightGray: "#94A3B8",
  border: "#E2E8F0",
  background: "#F8FAFC",
  white: "#FFFFFF"
};

function safeText(v: any): string {
  return String(v ?? "").trim();
}

function digitsOnly(s: any): string {
  return safeText(s).replace(/\D/g, "");
}

function ensurePageSpace(doc: typeof PDFKitDocument | any, neededHeight = 120): void {
  const bottom = doc.page.height - doc.page.margins.bottom - 50;
  if (doc.y + neededHeight > bottom) {
    doc.addPage();
    doc.y = doc.page.margins.top + 20;
  }
}

function maskSSN(ssn: string): string {
  const d = digitsOnly(ssn);
  if (d.length < 4) return "•••-••-••••";
  return `•••-••-${d.slice(-4)}`;
}

function maskAcct(acct: string): string {
  const d = digitsOnly(acct);
  if (d.length < 4) return "••••••";
  return `••••${d.slice(-4)}`;
}

function dataUrlToBuffer(dataUrl: string): Buffer | null {
  if (!dataUrl) return null;
  const m = String(dataUrl).match(/^data:(.+);base64,(.+)$/);
  if (!m) return null;
  return Buffer.from(m[2], "base64");
}

function drawModernHeader(doc: any, appId: string | undefined): void {
  const pageW = doc.page.width;
  const mL = doc.page.margins.left;
  const mR = doc.page.margins.right;

  doc.save().rect(0, 0, pageW, 100).fill("#F1F5F9").restore();
  doc.save().rect(0, 0, 6, 100).fill(colors.primary).restore();

  const logoX = mL + 10;
  const logoY = 28;

  const logoPathPng = path.join(__dirname, "public", "logo_nt.png");
  try {
    if (fs.existsSync(logoPathPng)) doc.image(logoPathPng, logoX + 6, logoY + 6, { height: 48 });
  } catch (_) {}

  const logoHeight = 48;
  const logoCenterY = logoY + 6 + logoHeight / 2;
  const textStartY = logoCenterY - 16;

  doc.fillColor(colors.dark).font("Helvetica-Bold").fontSize(24).text("Halo Payments", logoX + 70, textStartY);
  doc.fillColor(colors.mediumGray).font("Helvetica").fontSize(11).text("MERCHANT APPLICATION", logoX + 70, textStartY + 26);

  const badgeText = `APP-${appId || "PENDING"}`;
  const badgeW = 160;
  const badgeH = 48;
  const badgeX = pageW - mR - badgeW;
  const badgeY = logoY + 6;

  doc.save().roundedRect(badgeX, badgeY, badgeW, badgeH, 8).lineWidth(1.5).strokeColor(colors.border).stroke().restore();
  doc.fillColor(colors.mediumGray).font("Helvetica").fontSize(8).text("APPLICATION ID", badgeX, badgeY + 10, { width: badgeW, align: "center" });
  doc.fillColor(colors.dark).font("Helvetica-Bold").fontSize(12).text(badgeText, badgeX, badgeY + 26, { width: badgeW, align: "center" });

  doc.y = 120;
}

function drawModernSection(doc: any, title: string): void {
  ensurePageSpace(doc, 100);
  doc.moveDown(0.8);

  const y = doc.y;
  const mL = doc.page.margins.left;

  doc.save().rect(mL - 12, y - 4, 4, 24).fill(colors.secondary).restore();
  doc.font("Helvetica-Bold").fontSize(14).fillColor(colors.dark).text(title, mL, y);

  const lineY = doc.y + 8;
  doc.save().moveTo(mL, lineY).lineTo(doc.page.width - doc.page.margins.right, lineY).lineWidth(2).strokeColor(colors.border).stroke().restore();

  doc.moveDown(0.8);
}

function drawModernKV(doc: any, label: string, value: string, opts: { labelW?: number } = {}): void {
  const labelW = opts.labelW || 180;
  const mL = doc.page.margins.left;
  const valueX = mL + labelW;
  const y = doc.y;

  doc.font("Helvetica").fontSize(9).fillColor(colors.mediumGray).text(label, mL, y, { width: labelW - 10 });
  doc.font("Helvetica-Bold").fontSize(10).fillColor(colors.darkGray).text(value || "—", valueX, y - 1, {
    width: doc.page.width - doc.page.margins.right - valueX
  });

  doc.moveDown(0.65);
}

function drawInfoCard(doc: any, items: [string, string][]): void {
  const mL = doc.page.margins.left;
  const mR = doc.page.margins.right;
  const cardY = doc.y;
  const pageW = doc.page.width;

  const itemHeight = items.length * 18;
  const cardH = itemHeight + 32;

  doc.save().roundedRect(mL - 4, cardY, pageW - mL - mR + 8, cardH, 8).fill(colors.white).restore();
  doc.save().roundedRect(mL - 4, cardY, pageW - mL - mR + 8, cardH, 8).lineWidth(1).strokeColor(colors.border).stroke().restore();

  doc.y = cardY + 16;
  items.forEach(([label, value]) => drawModernKV(doc, label, value));
  doc.y = cardY + cardH + 16;
}

function drawSignaturePlaceholder(doc: any, x: number, y: number, w: number): void {
  doc.save().font("Helvetica").fontSize(32).fillColor("#00000008").text("✍", x + w / 2 - 20, y + 50).restore();
  doc.save().font("Helvetica").fontSize(9).fillColor(colors.lightGray).text("Signature not provided", x + 20, y + 100).restore();
}

function drawSignatureSection(doc: any, formData: any): void {
  ensurePageSpace(doc, 240);
  drawModernSection(doc, "Authorization & Signature");

  const mL = doc.page.margins.left;
  const mR = doc.page.margins.right;
  const pageW = doc.page.width;
  const sigBoxX = mL - 4;
  const sigBoxY = doc.y + 8;
  const sigBoxW = pageW - mL - mR + 10;
  const sigBoxH = 140;

  doc.save().roundedRect(sigBoxX, sigBoxY, sigBoxW, sigBoxH, 10).fill(colors.background).restore();
  doc.save().roundedRect(sigBoxX, sigBoxY, sigBoxW, sigBoxH, 10).lineWidth(2).strokeColor(colors.border).stroke().restore();

  doc.fillColor(colors.mediumGray).font("Helvetica").fontSize(9).text("ELECTRONIC SIGNATURE", sigBoxX + 20, sigBoxY + 16);

  const sigBuf = dataUrlToBuffer(safeText(formData.signatureImageDataUrl));
  if (sigBuf) {
    try {
      doc.image(sigBuf, sigBoxX + 20, sigBoxY + 40, { fit: [sigBoxW - 40, 70], align: "left", valign: "center" } as any);
    } catch (_) {
      drawSignaturePlaceholder(doc, sigBoxX, sigBoxY, sigBoxW);
    }
  } else {
    drawSignaturePlaceholder(doc, sigBoxX, sigBoxY, sigBoxW);
  }

  doc.save().moveTo(sigBoxX + 20, sigBoxY + sigBoxH - 20).lineTo(sigBoxX + sigBoxW - 20, sigBoxY + sigBoxH - 20).lineWidth(1).strokeColor(colors.lightGray).stroke().restore();

  doc.y = sigBoxY + sigBoxH + 20;

  const col1X = mL;
  const col2X = mL + sigBoxW / 2;
  const detailY = doc.y;

  doc.font("Helvetica").fontSize(9).fillColor(colors.mediumGray).text("Printed Name", col1X, detailY);
  doc.font("Helvetica-Bold").fontSize(11).fillColor(colors.darkGray).text(safeText(formData.signatureName) || "—", col1X, detailY + 14);

  doc.font("Helvetica").fontSize(9).fillColor(colors.mediumGray).text("Date Signed", col2X, detailY);
  doc.font("Helvetica-Bold").fontSize(11).fillColor(colors.darkGray).text(formatDate(formData.signatureDate) || "—", col2X, detailY + 14);


  doc.y = detailY + 40;
}

async function mergePdfBuffersInOrder(buffers: Buffer[]): Promise<Buffer> {
  const merged = await PDFDocument.create();
  for (const b of buffers) {
    const src = await PDFDocument.load(b);
    const pages = await merged.copyPages(src, src.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }
  const out = await merged.save();
  return Buffer.from(out);
}

async function dataUrlToPdfBuffer(dataUrl: string, mimeType = ""): Promise<Buffer> {
  const buf = dataUrlToBuffer(dataUrl);
  if (!buf) throw new Error("Invalid dataUrl");

  const mt = String(mimeType || "").toLowerCase();
  if (mt.includes("pdf") || buf.slice(0, 4).toString() === "%PDF") return buf;

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const { width, height } = page.getSize();

  const isPng = mt.includes("png") || buf.slice(0, 8).toString("hex").startsWith("89504e470d0a1a0a");
  const img = isPng ? await pdf.embedPng(buf) : await pdf.embedJpg(buf);

  const scale = Math.min((width - 40) / img.width, (height - 40) / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;

  page.drawImage(img, { x: (width - drawW) / 2, y: (height - drawH) / 2, width: drawW, height: drawH });

  const out = await pdf.save();
  return Buffer.from(out);
}

function formatDate(dateString: string): string {
  if (!dateString) return "N/A";
  
  try {
    const date = new Date(dateString);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    
    return `${month}/${day}/${year}`;
  } catch {
    return dateString || "N/A";
  }
}

function generateApplicationPdfBuffer(formData: any, appId: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFKitDocument({ size: "LETTER", margin: 50, bufferPages: true, autoFirstPage: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    drawModernHeader(doc, appId);

function formatEIN(ein: string): string {
  const digits = digitsOnly(ein);
  if (digits.length === 9) {
    return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  }
  return ein || "N/A";
}

function formatRevenue(revenue: string): string {
  const digits = digitsOnly(revenue);
  if (!digits) return "N/A";
  
  const num = parseInt(digits, 10);
  return `$${num.toLocaleString('en-US')}`;
}

    drawModernSection(doc, "Business Information");
    drawInfoCard(doc, [
      ["Legal Business Name", safeText(formData.legalBusinessName)],
      ["DBA Name", safeText(formData.dbaName)],
      ["Date Established", formatDate(formData.businessEstablishedDate)],
      ["Taxpayer ID (EIN)", formatEIN(formData.taxpayerId)],
      ["FNS NO", safeText(formData.fnsNumber)],
      ["Annual Revenue(approx)", formatRevenue(formData.annualRevenue)],
      ["Business Phone", safeText(formData.businessPhone)],
      ["Business Email", safeText(formData.businessEmail)],
      ["Business Website", safeText(formData.businessWebsite)],
      ]);

    drawModernSection(doc, "Physical Location");
    drawInfoCard(doc, [
      ["Street Address", safeText(formData.physicalStreet)],
      ["Unit/Suite", safeText(formData.physicalUnit)],
      ["City", safeText(formData.physicalCity)],
      ["State", safeText(formData.physicalState)],
      ["ZIP Code", safeText(formData.physicalZip)]
    ]);

    drawModernSection(doc, "Mailing Address");
    drawInfoCard(doc, [
      ["Street Address", safeText(formData.businessStreet)],
      ["Unit/Suite", safeText(formData.businessUnit)],
      ["City", safeText(formData.businessCity)],
      ["State", safeText(formData.businessState)],
      ["ZIP Code", safeText(formData.businessZip)]
    ]);

    drawModernSection(doc, "Principal / Owner Information");
    drawInfoCard(doc, [
      ["Full Name", `${safeText(formData.ownerFirstName)} ${safeText(formData.ownerLastName)}`.trim()],
      ["Title", safeText(formData.ownerTitle)],
      ["Ownership Percentage", safeText(formData.ownerOwnershipPct) ? `${safeText(formData.ownerOwnershipPct)}%` : "—"],
      ["Date of Birth", formatDate(formData.dob)],
      ["Social Security Number", safeText(formData.ownerSsn)],
      ["Email Address", safeText(formData.contactEmail)],
      ["Cell Phone", safeText(formData.contactPhone)],
      ["Home Phone", safeText(formData.ownerHomePhone)]
    ]);

    drawModernSection(doc, "Principal Residence");
    drawInfoCard(doc, [
      ["Street Address", safeText(formData.principalAddressStreet)],
      ["Unit/Suite", safeText(formData.principalAddressUnit)],
      ["City", safeText(formData.principalAddressCity)],
      ["State", safeText(formData.principalAddressState)],
      ["ZIP Code", safeText(formData.principalAddressZip)]
    ]);

    drawModernSection(doc, "Identification");
    drawInfoCard(doc, [
      ["License Number", safeText(formData.idNumber)],
      ["Issuing State", safeText(formData.dlState)],
      ["Expiration Date", formatDate(formData.idExp)]
    ]);

    drawModernSection(doc, "Banking Information");
    drawInfoCard(doc, [
      ["Bank Name", safeText(formData.bankName)],
      ["Routing Number", safeText(formData.routingNumber)],
      ["Account Number", safeText(formData.accountNumber)]
    ]);

    drawModernSection(doc, "Additional Information");
    drawInfoCard(doc, [
      // ["Terminal", safeText(formData.ccTerminal)],
      // ["Encryption", safeText(formData.encryption)],
      // ["Gas Station POS", safeText(formData.gasStationPos)],
      // ["PRICING", safeText(formData.pricing)],
      // ["Installation Date", safeText(formData.installationDate)],
      // ["OTHER FLEET CARDS", safeText(formData.otherFleetCards || formData.otherfleetcards)],
      ["Other Notes", safeText(formData.otherNotes)]
    ]);

    drawSignatureSection(doc, formData);

    doc.flushPages();
    const range = (doc as any).bufferedPageRange();
    const pageCount = range.count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      const bottomY = doc.page.height - 35;

      doc.save()
        .moveTo(doc.page.margins.left, bottomY - 12)
        .lineTo(doc.page.width - doc.page.margins.right, bottomY - 12)
        .lineWidth(1)
        .strokeColor(colors.border)
        .stroke()
        .restore();

      doc.fillColor(colors.mediumGray).font("Helvetica").fontSize(9)
        .text(`Page ${i + 1} of ${pageCount}`, doc.page.margins.left, bottomY, { width: 150 });

      doc.fillColor(colors.lightGray).font("Helvetica").fontSize(8)
        .text(`Generated: ${new Date().toLocaleDateString()}`, doc.page.margins.left, bottomY, {
          align: "center",
          width: doc.page.width - doc.page.margins.left - doc.page.margins.right
        });

      doc.fillColor(colors.mediumGray).font("Helvetica-Bold").fontSize(8)
        .text("Confidential", doc.page.width - doc.page.margins.right - 150, bottomY, { align: "right", width: 150 });
    }

    doc.end();
  });
}

export {
  generateApplicationPdfBuffer,
  dataUrlToPdfBuffer,
  mergePdfBuffersInOrder
};