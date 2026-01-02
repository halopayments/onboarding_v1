import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import * as fs from 'fs';
import path from 'path';
import nodemailer from "nodemailer";
import OpenAI from "openai";

import {
  generateApplicationPdfBuffer,
  dataUrlToPdfBuffer,
  mergePdfBuffersInOrder
} from "./pdfgen";

import {
  uploadMergedPdfToDrive,
  makeDriveFilePublicOrSkip,
  driveDirectDownloadUrl
} from "./cloudstorage";

import { sendWhatsAppNotification } from "./whatsapp";
import { createMondayItem } from "./monday";

type Submission = {
  appId: string;
  businessName: string;
  ownerName: string;
  createdAtISO: string;
  pdfBuffer: Buffer;
  drive?: any;
};

const app = express();
const distPath = path.resolve("/var/www/onboarding_v1/web/dist");
app.use(express.static(distPath));

app.set("trust proxy", 1);

// // Add this test endpoint in your server.ts
// app.get('/test-counter', (req, res) => {
//   const appId = makeAppId();
//   res.json({ 
//     message: 'Counter test',
//     appId: appId,
//     currentCounters: Object.fromEntries(countersByDate)
//   });
// });


app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors());
app.use(express.json({ limit: "35mb" }));
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false
  })
);

// static assets (logo)
app.use("/public", express.static(path.join(__dirname, "public")));

// in-memory store (swap later with DB)
const submissions = new Map<string, Submission>();

// ---------- utilities ----------
export function safeText(v: unknown): string {
  return String(v ?? "").trim();
}

function nowISO(): string {
  return new Date().toISOString();
}

// Add at the top of server.ts (after imports)
const COUNTER_FILE = path.join(__dirname, 'app-counters.json');

// Load counters from file on startup
function loadCounters(): Map<string, number> {
  try {
    if (fs.existsSync(COUNTER_FILE)) {
      const data = fs.readFileSync(COUNTER_FILE, 'utf-8');
      const obj = JSON.parse(data);
      return new Map(Object.entries(obj));
    }
  } catch (err) {
    console.error('Error loading counters:', err);
  }
  return new Map<string, number>();
}

// Save counters to file
function saveCounters(counters: Map<string, number>): void {
  try {
    const obj = Object.fromEntries(counters);
    fs.writeFileSync(COUNTER_FILE, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving counters:', err);
  }
}

const countersByDate = loadCounters(); // ← Replaces your old Map

function makeAppId(): string {
  const d = new Date();
  const base =
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

  const next = (countersByDate.get(base) || 0) + 1;
  countersByDate.set(base, next);
  
  saveCounters(countersByDate); // ← Add this line

  return `${base}-${String(next).padStart(4, "0")}`;
}



function sanitizeFilePart(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "merchant";
}

function buildPdfFileName(formData: any, appId: string): string {
  const dba = sanitizeFilePart(String(formData?.dbaName || formData?.legalBusinessName || ""));
  return `${dba}_halo_${appId}.pdf`;
}

// function buildMailer() {
//   const host = process.env.SMTP_HOST || "smtp-relay.gmail.com";
//   const port = Number(process.env.SMTP_PORT || 587);
//   return nodemailer.createTransport({
//     host,
//     port,
//     secure: false,
//     requireTLS: true
//   });
// }

function buildMailer() {
  const host = process.env.SMTP_HOST || "smtp-relay.gmail.com";
  const port = Number(process.env.SMTP_PORT || 587);

  return nodemailer.createTransport({
    host,
    port,
    secure: false,            // correct for 587
    requireTLS: true,

    // 👇 IMPORTANT: this becomes the EHLO/HELO name
    name: process.env.SMTP_EHLO_NAME || "mailer.yourdomain.com",

    tls: {
      servername: host,       // helps with TLS/SNI
    },
  });
}


function normalizeISODate(val: string): string {
  if (!val) return "";
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
}

function safeJsonParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ---------- OpenAI OCR helper ----------
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function extractJsonFromImage(params: {
  label: "id" | "check" | "w9";
  imageDataUrl: string;
  prompt: string;
  schemaHint: string;
}): Promise<any> {
  const { label, imageDataUrl, prompt, schemaHint } = params;

  // IMPORTANT: This casting avoids the SDK typing mismatch you’re seeing,
  // while still sending the correct multimodal payload.
  const resp = await openai.responses.create(
    {
      model: process.env.OCR_MODEL || "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: `${prompt}\n\nSchema:\n${schemaHint}\n\nReturn ONLY valid JSON.. No markdown, no commentary.` },
            // SDK typing can differ across versions; this works at runtime.
            { type: "input_image", image_url: imageDataUrl }
          ]
        }
      ]
    } as any
  );

  const outputText = (resp as any).output_text || "";
  console.log(`[extract:${label}] output_text first 500:\n${String(outputText).slice(0, 500)}\n`);

  const json = safeJsonParse(String(outputText).trim());
  if (!json) {
    console.warn(`[extract:${label}] JSON parse failed.`);
    return {};
  }
  return json;
}

// ---------- routes ----------
app.get("/api/health", (_req, res) => res.json({ ok: true }));

/**
 * /api/extract
 * - Requires ALL 3 docs (per your rule)
 * - If consent=false => skip OCR (return empty extraction)
 * - If consent=true => OCR using OpenAI
 */
app.post("/api/extract", async (req: Request, res: Response) => {
  try {
    const { consent, idImageDataUrl, checkImageDataUrl, w9ImageDataUrl } = (req.body || {}) as any;

    console.log("[extract] consent:", !!consent);
    console.log("[extract] has id/check/w9:", !!idImageDataUrl, !!checkImageDataUrl, !!w9ImageDataUrl);

    if (!idImageDataUrl || !checkImageDataUrl || !w9ImageDataUrl) {
      return res.status(400).json({ success: false, error: "All 3 documents are required (ID, Check/Letter, W-9)." });
    }

    // required behavior: if consent false -> skip OCR
    if (!consent) {
      return res.json({
        success: true,
        extracted: { id_fields: {}, bank_fields: {}, w9_fields: {} }
      });
    }

    const idPrompt = `Extract fields from a US Photo ID (driver license).`;
    const idSchema = `{
      "first_name": "",
      "middle_name": "",
      "last_name": "",
      "dob": "YYYY-MM-DD",
      "id_number": "",
      "id_expiration": "YYYY-MM-DD",
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

    const w9Prompt = `Extract ONLY NON-SENSITIVE fields from a W-9 (name + address). DO NOT extract SSN/EIN/TIN.`;
    const w9Schema = `{
      "name": "",
      "business_name": "",
      "address_line": "",
      "city": "",
      "state": "",
      "postal_code": ""
    }`;

    const [idRaw, bankRaw, w9Raw] = await Promise.all([
      extractJsonFromImage({ label: "id", imageDataUrl: idImageDataUrl, prompt: idPrompt, schemaHint: idSchema }),
      extractJsonFromImage({ label: "check", imageDataUrl: checkImageDataUrl, prompt: checkPrompt, schemaHint: checkSchema }),
      extractJsonFromImage({ label: "w9", imageDataUrl: w9ImageDataUrl, prompt: w9Prompt, schemaHint: w9Schema })
    ]);

    const id_fields = {
      first_name: safeText(idRaw.first_name),
      middle_name: safeText(idRaw.middle_name),
      last_name: safeText(idRaw.last_name),
      dob: normalizeISODate(safeText(idRaw.dob)),
      id_number: safeText(idRaw.id_number),
      id_expiration: normalizeISODate(safeText(idRaw.id_expiration)),
      address_line: safeText(idRaw.address_line),
      city: safeText(idRaw.city),
      state: safeText(idRaw.state),
      postal_code: safeText(idRaw.postal_code)
    };

    const bank_fields = {
      bank_name: safeText(bankRaw.bank_name),
      routing_number: safeText(bankRaw.routing_number).replace(/\D/g, ""),
      account_number: safeText(bankRaw.account_number).replace(/\D/g, "")
    };

    const w9_fields = {
      name: safeText(w9Raw.name),
      business_name: safeText(w9Raw.business_name),
      address_line: safeText(w9Raw.address_line),
      city: safeText(w9Raw.city),
      state: safeText(w9Raw.state),
      postal_code: safeText(w9Raw.postal_code)
    };

    return res.json({ success: true, extracted: { id_fields, bank_fields, w9_fields } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[extract] error:", msg);
    return res.status(500).json({ success: false, error: msg || "Extract failed" });
  }
});

/**
 * /api/submit
 * - Requires ALL 3 docs always
 * - Merges order: Application > Photo ID > Check/Letter > W-9
 * - Saves in-memory for success page + download
 * - Drive upload (Year/Month folders) optional
 * - Monday create item (optional)
 * - Email internal + CC merchant
 * - WhatsApp optional
 */
app.post("/api/submit", async (req: Request, res: Response) => {
  try {
    const { formData, fileAttachments } = (req.body || {}) as any;
    if (!formData) return res.status(400).json({ success: false, error: "Missing formData" });

    const idFile = fileAttachments?.idFile;
    const checkFile = fileAttachments?.checkFile;
    const w9File = fileAttachments?.w9File;

    if (!idFile || !checkFile || !w9File) {
      return res.status(400).json({
        success: false,
        error: "All 3 documents are required: Photo ID, Voided Check/Letter, W-9."
      });
    }

    const appId = makeAppId();
    const createdAtISO = nowISO();

    const businessName = safeText(formData.legalBusinessName);
    const ownerName = `${safeText(formData.ownerFirstName)} ${safeText(formData.ownerLastName)}`.trim();
    const pdfFileName = buildPdfFileName(formData, appId);

    // 1) application pdf
    const applicationPdfBuffer = await generateApplicationPdfBuffer(formData, appId);

    // 2) attachment pdfs
    const idPdf = await dataUrlToPdfBuffer(idFile.dataUrl, idFile.mimeType || "");
    const checkPdf = await dataUrlToPdfBuffer(checkFile.dataUrl, checkFile.mimeType || "");
    const w9Pdf = await dataUrlToPdfBuffer(w9File.dataUrl, w9File.mimeType || "");

    // 3) merge order ALWAYS
    const mergedPdfBuffer = await mergePdfBuffersInOrder([applicationPdfBuffer, idPdf, checkPdf, w9Pdf]);

    // store for success page + download
    submissions.set(appId, {
      appId,
      businessName,
      ownerName,
      createdAtISO,
      pdfBuffer: mergedPdfBuffer
    });

    // 4) Drive upload optional
    let drive: any = null;
    try {
      drive = await uploadMergedPdfToDrive({ appId, mergedPdfBuffer, filename: pdfFileName });

      if (drive && !drive.skipped && drive.fileId && process.env.DRIVE_MAKE_PUBLIC === "true") {
        await makeDriveFilePublicOrSkip(drive.fileId);
        drive.directDownloadUrl = driveDirectDownloadUrl(drive.fileId);
      }

      if (drive && !drive.skipped) {
        const sub = submissions.get(appId);
        if (sub) submissions.set(appId, { ...sub, drive });
      }
    } catch (e) {
      console.error("[drive] failed:", e instanceof Error ? e.message : String(e));
    }

    // 5) Monday optional
    try {
      await createMondayItem({ appId, businessName, ownerName, createdAtISO });
    } catch (e) {
      console.error("[monday] failed:", e instanceof Error ? e.message : String(e));
    }

    // 6) Email internal + CC merchant
    const recipientsCsv = process.env.RECIPIENTS || "";
    const internalRecipients = recipientsCsv
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);

        if (internalRecipients.length) {
      const transporter = buildMailer();

      try {
        await transporter.sendMail({
          from: process.env.EMAIL_FROM || "onboarding@halopayments.com",
          to: internalRecipients,
          subject: `New Merchant Application ${appId}`,
          text:
            `New application submitted.\n` +
            `App ID: ${appId}\n` +
            `Created: ${createdAtISO}\n` +
            `Business: ${businessName}\n` +
            `Owner: ${ownerName}`,
          attachments: [
            {
              filename: pdfFileName,
              content: mergedPdfBuffer,
              contentType: "application/pdf"
            }
          ]
        });

        console.log("[email][internal] sent", {
          to: internalRecipients,
          appId,
          hasAttachment: true
        });

      } catch (e) {
        console.error(
          "[email][internal] failed",
          e instanceof Error ? e.message : String(e)
        );
      }
    }

    const merchantEmail = safeText(formData?.contactEmail);

    if (merchantEmail) {
      const transporter = buildMailer();

      try {
        await transporter.sendMail({
          from: process.env.EMAIL_FROM || "onboarding@halopayments.com",
          to: merchantEmail,
          subject: `We received your application (${appId})`,
          text:
            'Dear Merchant,\n\n'+
            `Thank you for submitting your application. We will get back to you shortly.\n\n` +
            `App ID: ${appId}\n` +
            `Created: ${createdAtISO}\n` +
            `Business: ${businessName}\n` +
            `Owner: ${ownerName}\n\n` +
            'For any questions regarding your application, please reach out to onboarding@halopayments.com \n\n\n' +
            'Best Regards,\n'+
            'Onboarding Team\n'+
            'Halo Payments.\n'
        });

        console.log("[email][merchant] sent", {
          to: merchantEmail,
          appId
        });

      } catch (e) {
        console.error(
          "[email][merchant] failed",
          e instanceof Error ? e.message : String(e)
        );
      }
    }



    // 7) WhatsApp optional
    const numbersCsv = process.env.WHATSAPP_NOTIFY_TO || "";
    const toNumbers = numbersCsv.split(",").map((s) => s.trim()).filter(Boolean);

    const waBody =
      `✅ New Merchant Application\n` +
      `AppId: ${appId}\n` +
      `Business: ${businessName || "-"}\n` +
      `Owner: ${ownerName || "-"}\n` +
      `Created: ${createdAtISO}`;

    const mediaUrl =
      submissions.get(appId)?.drive?.directDownloadUrl ||
      (process.env.PUBLIC_BASE_URL ? `${process.env.PUBLIC_BASE_URL}/api/submission/${encodeURIComponent(appId)}/pdf` : "");

    if (toNumbers.length) {
      try {
        await sendWhatsAppNotification({ toNumbers, body: waBody, mediaUrl: mediaUrl || undefined });
      } catch (e) {
        console.error("[whatsapp] failed:", e instanceof Error ? e.message : String(e));
      }
    }

    return res.json({
      success: true,
      appId,
      businessName,
      ownerName,
      createdAt: createdAtISO
    });
  } catch (e: unknown) {
    console.error("[submit] error:", e);
    return res.status(500).json({ success: false, error: e instanceof Error ? e.message : "Submit failed" });
  }
});

app.get("/api/submission/:appId", (req: Request, res: Response) => {
  const appId = req.params.appId;
  const sub = submissions.get(appId);
  if (!sub) return res.status(404).json({ success: false, error: "Not found" });

  return res.json({
    success: true,
    appId: sub.appId,
    businessName: sub.businessName,
    ownerName: sub.ownerName,
    createdAt: sub.createdAtISO,
    driveLink: sub.drive?.webViewLink || "",
    driveDirectDownloadUrl: sub.drive?.directDownloadUrl || ""
  });
});

app.get("/api/submission/:appId/pdf", (req: Request, res: Response) => {
  const appId = req.params.appId;
  const sub = submissions.get(appId);
  if (!sub?.pdfBuffer) return res.status(404).send("Not found");

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${appId}.pdf"`);
  return res.send(sub.pdfBuffer);
});

const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running at http://0.0.0.0:${PORT}`);
});
