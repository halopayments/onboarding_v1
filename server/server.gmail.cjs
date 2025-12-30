"use strict";

/**
 * Halo Merchant Application - Server (CommonJS)
 * - /api/extract : OCR prefill via OpenAI Vision (consent required)
 * - /api/submit  : Generate application PDF + merge (ID+Check+W9+Application) into one PDF + email + monday
 *
 * NOTE: SOC2-friendly baseline:
 * - No file storage to disk (memory only)
 * - Minimal logging (no PII logs)
 * - W9 OCR excludes TIN extraction
 */

require("dotenv").config();
// Simple in-memory store (OK for dev). For prod, store in DB + S3.
const submissions = new Map(); // appId -> { appId, businessName, ownerName, createdAtISO, pdfBuffer }

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const fs = require("fs");

const PDFKitDocument = require("pdfkit");
const nodemailer = require("nodemailer");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");

let OpenAI;
try {
  OpenAI = require("openai");
} catch (e) {
  console.warn("[boot] openai package not found. Install with: npm i openai");
}

const app = express();

// ---------- Security-ish defaults ----------
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: true, credentials: false }));
app.use(express.json({ limit: "35mb" }));
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false
  })
);

// Static assets (logo.png etc)
app.use("/public", express.static(path.join(__dirname, "public")));

// ---------- Env ----------
const {
  OPENAI_API_KEY,
  OPENAI_VISION_MODEL,
  INTERNAL_RECEIPT_EMAIL,

  EMAIL_FROM, // optional (if using SES SMTP)
  SES_SMTP_HOST,
  SES_SMTP_PORT,
  SES_SMTP_USER,
  SES_SMTP_PASS
} = process.env;

const VISION_MODEL = OPENAI_VISION_MODEL || "gpt-4o-mini"; // set in .env if needed
const RECEIPT_EMAIL = INTERNAL_RECEIPT_EMAIL || "onboarding@yourdomain.com";

// ---------- Helpers ----------
function safeB64ToBuffer(dataUrl) {
  if (!dataUrl) return null;
  const m = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  return Buffer.from(m[2], "base64");
}

function getDataUrlMime(dataUrl) {
  const m = String(dataUrl).match(/^data:([^;]+);base64,/);
  return m ? m[1] : "";
}

/**
 * Responses API can return text in different nested places depending on SDK/version.
 * This function reliably extracts any text content.
 */
function getResponseText(resp) {
  if (!resp) return "";

  if (typeof resp.output_text === "string" && resp.output_text.trim()) {
    return resp.output_text.trim();
  }

  const out = resp.output || [];
  let text = "";

  for (const item of out) {
    if (Array.isArray(item.content)) {
      for (const c of item.content) {
        if (c && typeof c.text === "string") text += c.text;
        if (c && typeof c.output_text === "string") text += c.output_text;
      }
    }
    if (typeof item.text === "string") text += item.text;
    if (typeof item.output_text === "string") text += item.output_text;
  }

  return String(text || "").trim();
}

function stripJsonFences(s) {
  if (!s) return "";
  // remove ```json ... ``` or ``` ... ```
  return String(s)
    .replace(/```json/gi, "```")
    .replace(/```/g, "")
    .trim();
}

function normalizeISODate(s) {
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = String(s).match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (!m) return "";
  return `${m[3]}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
}

function makeAppId() {
  // yyyymmdd-0001 style (in-memory counter; replace with DB counter in prod)
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  makeAppId._seq = (makeAppId._seq || 0) + 1;
  const seq = String(makeAppId._seq).padStart(4, "0");
  return `${y}${m}${day}-${seq}`;
}

// ---------- Email (SES SMTP) ----------
// function buildEmailTransporter() {
//   if (!SES_SMTP_HOST || !SES_SMTP_PORT || !SES_SMTP_USER || !SES_SMTP_PASS) {
//     console.warn("[email] SES SMTP env vars not set. Email sending will fail.");
//   }
//   return nodemailer.createTransport({
//     host: SES_SMTP_HOST,
//     port: Number(SES_SMTP_PORT || 587),
//     secure: Number(SES_SMTP_PORT) === 465,
//     auth: {
//       user: SES_SMTP_USER,
//       pass: SES_SMTP_PASS
//     }
//   });
// }
// ---------- Email (GMAIL) ----------
function buildEmailTransporter() {
  if (!SES_SMTP_HOST || !SES_SMTP_PORT) {
    console.warn("[email] GMAIL SMTP env vars not set. Email sending will fail.");
  }

  return nodemailer.createTransport({
    host: SES_SMTP_HOST,                          // e.g. smtp-relay.gmail.com
    port: Number(SES_SMTP_PORT || 587),           // typically 587 for relay
    secure: false,                                // STARTTLS on 587
    requireTLS: true,                             // fail if TLS not available
    // no auth: relay will trust your IP / cert per Admin Console config
  });
}


async function sendApplicationEmail({ toContactEmail, appId, mergedPdfBuffer }) {
  const transporter = buildEmailTransporter();

  const from = EMAIL_FROM || "no-reply@halopayments.com";
  const to = [toContactEmail, RECEIPT_EMAIL].filter(Boolean);

  const subject = `Halo Payments — Application Received (${appId})`;
  const text = `We received your merchant application.\n\nApplication ID: ${appId}\n\nAttached: Your application\n`;

  const info = await transporter.sendMail({
    from,
    to,
    subject,
    text,
    attachments: [
      {
        filename: `halo-merchant-application-${appId}.pdf`,
        content: mergedPdfBuffer,
        contentType: "application/pdf"
      }
    ]
  });

  console.log("[email] ✅ sent:", info.messageId);
  return info;
}

// ---------- OpenAI client ----------
function getOpenAIClient() {
  if (!OpenAI) throw new Error("OpenAI SDK not installed. Run: npm i openai");
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");
  return new OpenAI({ apiKey: OPENAI_API_KEY });
}

/**
 * Call OpenAI Vision and ask it to return STRICT JSON only.
 * imageDataUrl: data:image/...;base64,...
 */
async function extractJsonFromImage({ label, imageDataUrl, prompt, schemaHint }) {
  if (!imageDataUrl) return {};
  const client = getOpenAIClient();

  const resp = await client.responses.create({
    model: VISION_MODEL,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              `${prompt}\n\nReturn ONLY valid JSON. No markdown, no commentary.\n` +
              `Schema:\n${schemaHint}\n\nIf unknown, use empty string.`
          },
          { type: "input_image", image_url: imageDataUrl }
        ]
      }
    ],
    // A little extra nudge toward JSON-only:
    text: { format: { type: "json_object" } }
  });

  const raw = stripJsonFences(getResponseText(resp));
  if (!raw) {
    console.log(`[extract:${label}] empty model text`);
    return {};
  }

  // Debug first 300 only (no PII dumps)
  console.log(`[extract:${label}] output (first 300):`, raw.slice(0, 300));

  try {
    return JSON.parse(raw);
  } catch (e) {
    console.log(`[extract:${label}] JSON parse failed.`);
    return {};
  }
}

// ---------- PDF: Application (modern-ish layout) ----------
function generateApplicationPdfBuffer(formData, appId) {
  return new Promise((resolve, reject) => {
    const doc = new PDFKitDocument({ size: "LETTER", margin: 40 });
    const chunks = [];

    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width;
    const left = 40;
    const right = pageWidth - 40;

    // Header bar
    doc.save().rect(0, 0, pageWidth, 90).fill("#0b1220");

    // Logo
    const logoPath = path.join(__dirname, "public", "logo.png");
    try {
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, left, 22, { height: 38 });
      }
    } catch (_) {}

    doc.fillColor("#ffffff");
    doc.font("Helvetica-Bold").fontSize(18).text("Halo Payments", left + 60, 24);
    doc.font("Helvetica").fontSize(11).fillColor("#cbd5e1").text("Merchant Application", left + 60, 48);

    doc.font("Helvetica").fontSize(9).fillColor("#cbd5e1").text(`Application ID: ${appId}`, 0, 32, {
      align: "right"
    });

    doc.restore();
    doc.moveDown(3);

    // helpers
    function sectionTitle(label) {
      doc.moveDown(0.6);
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a").text(label);
      doc.moveDown(0.2);
      doc.lineWidth(1).moveTo(left, doc.y).lineTo(right, doc.y).strokeColor("#e2e8f0").stroke();
      doc.moveDown(0.4);
    }

    function kv(label, value) {
      doc.font("Helvetica").fontSize(9).fillColor("#475569").text(`${label}:`, { continued: true });
      doc.font("Helvetica-Bold").fillColor("#0f172a").text(` ${value || "-"}`);
    }

    const f = formData || {};

    sectionTitle("Business Information");
    kv("Legal Name", f.legalBusinessName);
    kv("DBA", f.dbaName);
    kv("Date Established", f.businessEstablishedDate);
    kv("Taxpayer ID (EIN)", f.taxpayerId);
    kv("Business Phone", f.businessPhone);
    kv("Type of Business", f.businessType);
    kv("Other Type", f.businessTypeOther);

    sectionTitle("Physical Address");
    kv("Street", f.physicalStreet);
    kv("Unit", f.physicalUnit);
    kv("City", f.physicalCity);
    kv("State", f.physicalState);
    kv("ZIP", f.physicalZip);

    sectionTitle("Business Address");
    kv("Street", f.businessStreet);
    kv("Unit", f.businessUnit);
    kv("City", f.businessCity);
    kv("State", f.businessState);
    kv("ZIP", f.businessZip);

    sectionTitle("Principal Information");
    kv("Owner Name", `${f.ownerFirstName || ""} ${f.ownerMiddleName || ""} ${f.ownerLastName || ""}`.replace(/\s+/g, " ").trim());
    kv("Title", f.ownerTitle);
    kv("Ownership %", f.ownerOwnershipPct);
    kv("DOB", f.dob);
    kv("SSN", f.ownerSsn ? "***-**-" + String(f.ownerSsn).slice(-4) : ""); // mask
    kv("Owner Email", f.contactEmail);
    kv("Cell Phone", f.contactPhone);
    kv("Home Phone", f.ownerHomePhone);

    sectionTitle("Principal Address");
    kv("Street", f.principalAddressStreet);
    kv("Unit", f.principalAddressUnit);
    kv("City", f.principalAddressCity);
    kv("State", f.principalAddressState);
    kv("ZIP", f.principalAddressZip);

    sectionTitle("ID Details");
    kv("License #", f.idNumber);
    kv("Issued State", f.dlState);
    kv("Expiration", f.idExp);

    sectionTitle("Banking Information");
    kv("Bank Name", f.bankName);
    kv("Routing Number", f.routingNumber);
    kv("Account Number", f.accountNumber ? "••••" + String(f.accountNumber).slice(-4) : "");

    sectionTitle("Additional Information");
    kv("Terminal", f.ccTerminal);
    kv("Encryption", f.encryption);
    kv("Gas Station POS", f.gasStationPos);
    kv("Pricing", f.pricing);    
    kv("Installation Date", f.installationDate);
    kv("Other Fleet Cards", f.otherfleetcards);
    kv("Other Notes", f.otherNotes);

    // Signature image (if provided)
    if (f.signatureImageDataUrl) {
      try {
        const b = safeB64ToBuffer(f.signatureImageDataUrl);
        if (b) {
          doc.moveDown(0.5);
          sectionTitle("Signature");
          doc.font("Helvetica").fontSize(9).fillColor("#475569").text("Electronic Signature:");
          doc.image(b, left, doc.y + 6, { width: 250 });
          doc.moveDown(4.5);
          kv("Signer Name", f.signatureName);
          kv("Signature Date", f.signatureDate);
        }
      } catch (_) {}
    } else {
      sectionTitle("Signature");
      kv("Signer Name", f.signatureName);
      kv("Signature Date", f.signatureDate);
    }

    doc.end();
  });
}

// ---------- PDF Merge: convert ID/Check/W9 into PDF pages + merge all ----------
async function mergeAllToSinglePdf({
  applicationPdfBuffer,
  idFile,
  checkFile,
  w9File
}) {
  const outPdf = await PDFDocument.create();

  async function addAnyFile(fileObj) {
    if (!fileObj || !fileObj.dataUrl) return;

    const mime = getDataUrlMime(fileObj.dataUrl);
    const buf = safeB64ToBuffer(fileObj.dataUrl);
    if (!buf) return;

    // If it's already a PDF, copy pages
    if (mime === "application/pdf") {
      const src = await PDFDocument.load(buf);
      const pages = await outPdf.copyPages(src, src.getPageIndices());
      for (const p of pages) outPdf.addPage(p);
      return;
    }

    // If image, embed as a new page
    if (mime === "image/jpeg" || mime === "image/jpg" || mime === "image/png" || mime === "image/webp") {
      let img;
      if (mime === "image/png") img = await outPdf.embedPng(buf);
      else img = await outPdf.embedJpg(buf); // jpg/webp may fail; safest is jpg/png

      const page = outPdf.addPage([612, 792]); // Letter points
      const { width, height } = img.scale(1);

      // Fit within margins
      const margin = 36;
      const maxW = 612 - margin * 2;
      const maxH = 792 - margin * 2;

      const scale = Math.min(maxW / width, maxH / height);
      const drawW = width * scale;
      const drawH = height * scale;
      const x = (612 - drawW) / 2;
      const y = (792 - drawH) / 2;

      page.drawImage(img, { x, y, width: drawW, height: drawH });
      return;
    }
  }

  // 1) ID
  await addAnyFile(idFile);
  // 2) Check
  await addAnyFile(checkFile);
  // 3) W9
  await addAnyFile(w9File);

  // 4) Application PDF at the end
  const appPdf = await PDFDocument.load(applicationPdfBuffer);
  const appPages = await outPdf.copyPages(appPdf, appPdf.getPageIndices());
  for (const p of appPages) outPdf.addPage(p);

  return await outPdf.save();
}
// ---------- Routes ----------
app.get("/health", (req, res) => res.json({ ok: true }));

/**
 * POST /api/extract
 * Body: { consent: boolean, idImageDataUrl?, checkImageDataUrl?, w9ImageDataUrl? }
 *
 * Returns: { success:true, extracted:{ id_fields, bank_fields, w9_fields } }
 */
app.post("/api/extract", async (req, res) => {
  try {
    const { consent, idImageDataUrl, checkImageDataUrl, w9ImageDataUrl } = req.body || {};

    console.log("[extract] consent:", !!consent);

    // Require all 3 images (since docs are mandatory in your flow)
  if (!idImageDataUrl || !checkImageDataUrl || !w9ImageDataUrl) {
    return res.status(400).json({ success: false, error: "All 3 documents are required." });
  }

    if (!consent) {
      return res.json({
        success: true,
        extracted: { id_fields: {}, bank_fields: {}, w9_fields: {} }
      });
    }

    // Small sanity logs (bytes only, no PII)
    const idBuf = safeB64ToBuffer(idImageDataUrl);
    const ckBuf = safeB64ToBuffer(checkImageDataUrl);
    const w9Buf = safeB64ToBuffer(w9ImageDataUrl);
    console.log("[extract] id bytes:", idBuf ? idBuf.length : 0);
    console.log("[extract] check bytes:", ckBuf ? ckBuf.length : 0);
    console.log("[extract] w9 bytes:", w9Buf ? w9Buf.length : 0);

    const idPrompt = `Extract fields from a US Photo ID (driver license).`;
    const idSchema = `{
  "first_name": "",
  "middle_name": "",
  "last_name": "",
  "dob": "YYYY-MM-DD or empty",
  "id_number": "",
  "id_expiration": "YYYY-MM-DD or empty",
  "address_line": "",
  "city": "",
  "state": "",
  "postal_code": ""
}`;

    const checkPrompt = `Extract bank fields from a voided check or bank letter.`;
    const checkSchema = `{
  "bank_name": "",
  "routing_number": "",
  "account_number": ""
}`;

    // W9 prompt: DO NOT extract TIN
    const w9Prompt = `Extract NON-SENSITIVE fields from a W-9.
Do NOT extract SSN/EIN/TIN.
Return business/person name + address fields only.`;
    const w9Schema = `{
  "name": "",
  "business_name": "",
  "address_line": "",
  "city": "",
  "state": "",
  "postal_code": ""
}`;

    const [id_fields_raw, bank_fields_raw, w9_fields_raw] = await Promise.all([
      idImageDataUrl
        ? extractJsonFromImage({ label: "id", imageDataUrl: idImageDataUrl, prompt: idPrompt, schemaHint: idSchema })
        : Promise.resolve({}),
      checkImageDataUrl
        ? extractJsonFromImage({ label: "check", imageDataUrl: checkImageDataUrl, prompt: checkPrompt, schemaHint: checkSchema })
        : Promise.resolve({}),
      w9ImageDataUrl
        ? extractJsonFromImage({ label: "w9", imageDataUrl: w9ImageDataUrl, prompt: w9Prompt, schemaHint: w9Schema })
        : Promise.resolve({})
    ]);

    const id_fields = {
      first_name: id_fields_raw.first_name || "",
      middle_name: id_fields_raw.middle_name || "",
      last_name: id_fields_raw.last_name || "",
      dob: normalizeISODate(id_fields_raw.dob || ""),
      id_number: id_fields_raw.id_number || "",
      id_expiration: normalizeISODate(id_fields_raw.id_expiration || ""),
      address_line: id_fields_raw.address_line || "",
      city: id_fields_raw.city || "",
      state: id_fields_raw.state || "",
      postal_code: id_fields_raw.postal_code || ""
    };

    const bank_fields = {
      bank_name: bank_fields_raw.bank_name || "",
      routing_number: (bank_fields_raw.routing_number || "").replace(/\D/g, ""),
      account_number: (bank_fields_raw.account_number || "").replace(/\D/g, "")
    };

    const w9_fields = {
      name: w9_fields_raw.name || "",
      business_name: w9_fields_raw.business_name || "",
      address_line: w9_fields_raw.address_line || "",
      city: w9_fields_raw.city || "",
      state: w9_fields_raw.state || "",
      postal_code: w9_fields_raw.postal_code || ""
    };

    return res.json({
      success: true,
      extracted: { id_fields, bank_fields, w9_fields }
    });
  } catch (err) {
    console.error("[extract] error:", err?.message || err);
    return res.status(500).json({ success: false, error: err?.message || "extract failed" });
  }
});

/**
 * POST /api/submit
 * Body: { formData, fileAttachments: { idFile?, checkFile?, w9File? } }
 *
 * Returns: { success:true, appId }
 */
app.post("/api/submit", async (req, res) => {
  try {
    const { formData, fileAttachments } = req.body || {};
    if (!formData) return res.status(400).json({ success: false, error: "Missing formData" });

    const appId = makeAppId();
  

    // Generate application PDF
    const applicationPdfBuffer = await generateApplicationPdfBuffer(formData, appId);

    // Merge: ID + Check + W9 + Application => single PDF
    const mergedBytes = await mergeAllToSinglePdf({
      applicationPdfBuffer,
      idFile: fileAttachments?.idFile || null,
      checkFile: fileAttachments?.checkFile || null,
      w9File: fileAttachments?.w9File || null
    });
    const mergedPdfBuffer = Buffer.from(mergedBytes);

    // Send email (to contactEmail + receipt)
    const toContactEmail = formData.contactEmail || formData.businessEmail || "";
    if (!toContactEmail) {
      console.warn("[submit] contact email missing; skipping email send");
    } else {
      await sendApplicationEmail({ toContactEmail, appId, mergedPdfBuffer });
    }

    // TODO: Monday integration call here (you said it’s already good)
    // await createMondayItem(formData, appId);

    return res.json({ success: true, appId });
  } catch (err) {
    console.error("[submit] error:", err?.message || err);
    return res.status(500).json({ success: false, error: err?.message || "submit failed" });
  }
});

app.get("/api/submission/:appId", (req, res) => {
  const { appId } = req.params;
  const rec = submissions.get(appId);
  if (!rec) return res.status(404).json({ success: false, error: "Not found" });

  res.json({
    success: true,
    appId: rec.appId,
    businessName: rec.businessName,
    ownerName: rec.ownerName,
    createdAt: rec.createdAtISO
  });
});

app.get("/api/submission/:appId/pdf", (req, res) => {
  const { appId } = req.params;
  const rec = submissions.get(appId);
  if (!rec?.pdfBuffer) return res.status(404).send("Not found");

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="Halo-Application-${appId}.pdf"`);
  res.send(rec.pdfBuffer);
});


// ---------- Start server ----------
const HOST = "0.0.0.0";
const PORT = 4000;

app.listen(PORT, HOST, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
  console.log(`✅ Server running at http://${HOST}:${PORT}`);
});
