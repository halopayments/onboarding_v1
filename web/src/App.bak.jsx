import React, { useEffect, useMemo, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import * as pdfjsLib from "pdfjs-dist";
import Success from "./Success";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const STEPS = [
  { key: "upload", label: "1) Upload" },
  { key: "business", label: "2) Business" },
  { key: "principal", label: "3) Principal + Banking" },
  { key: "additional", label: "4) Additional + Sign" }
];

// ✅ IMPORTANT: If you have emptyForm elsewhere, keep yours.
// I’m not repeating it here to avoid messing it up.

function normalizeISODate(s) {
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = String(s).match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (!m) return "";
  return `${m[3]}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
}

function digitsOnly(s) {
  return String(s || "").replace(/\D/g, "");
}
function validLenDigits(s, len) {
  const d = digitsOnly(s);
  return d.length === len;
}

/**
 * ✅ Use Vite proxy for /api
 * ✅ For assets like /public/logo.svg, we can point to the same server origin in dev/prod
 *
 * In DEV:
 * - API calls should use "/api/..." (proxy)
 * - Logo should come from server (http://192.168.0.14:4000/public/logo.svg)
 *
 * In PROD:
 * - If you deploy behind one domain, you can make server also serve the web build
 *   then logo can just be "/public/logo.svg"
 */
const SERVER_ORIGIN =
  import.meta?.env?.VITE_SERVER_ORIGIN ||
  "http://192.168.0.14:4000"; // fallback if env not set

async function fileToImageDataUrl(file) {
  if (!file) return null;

  if (file.type.startsWith("image/")) {
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  if (file.type === "application/pdf") {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1.6 });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL("image/png");
  }

  return null;
}

async function fileToDataUrlRaw(file) {
  if (!file) return null;
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// ✅ Signature resize helper for full-width signing
function resizeSigCanvas(sigRef) {
  if (!sigRef?.current) return;

  const canvas = sigRef.current.getCanvas?.();
  if (!canvas) return;

  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  const parent = canvas.parentElement;
  if (!parent) return;

  const w = parent.clientWidth;
  const h = 220;

  // Save current drawing
  const data = sigRef.current.toDataURL?.();

  // Resize backing store
  canvas.width = Math.floor(w * ratio);
  canvas.height = Math.floor(h * ratio);

  // Resize CSS
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  // Scale drawing context
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  // Restore drawing
  sigRef.current.clear();
  if (data && data !== "data:,") {
    sigRef.current.fromDataURL(data, { ratio: 1 });
  }
}

export default function App() {
  // ✅ SIMPLE ROUTE GATE
  if (window.location.pathname === "/success") {
    return <Success serverOrigin={SERVER_ORIGIN} />;
  }

  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex].key;

  // ⚠️ keep your existing emptyForm reference
  const [form, setForm] = useState(emptyForm);

  const [idFile, setIdFile] = useState(null);
  const [checkFile, setCheckFile] = useState(null);
  const [w9File, setW9File] = useState(null);

  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const [showEIN, setShowEIN] = useState(true);
  const [showSSN, setShowSSN] = useState(true);

  const sigRef = useRef(null);

  // ✅ Resize signature on mount + window resize
  useEffect(() => {
    const t = setTimeout(() => resizeSigCanvas(sigRef), 0);

    const onResize = () => resizeSigCanvas(sigRef);
    window.addEventListener("resize", onResize);

    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  // ✅ Resize signature when entering the signature step
  useEffect(() => {
    if (step === "additional") {
      const t = setTimeout(() => resizeSigCanvas(sigRef), 0);
      return () => clearTimeout(t);
    }
  }, [step]);

  const canNextFromUpload = useMemo(() => !!(idFile || checkFile || w9File), [idFile, checkFile, w9File]);

  function setVal(k, v) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function syncBizAddress(checked) {
    setVal("businessSameAsPhysical", checked);
    if (checked) {
      setForm((p) => ({
        ...p,
        businessStreet: p.physicalStreet,
        businessUnit: p.physicalUnit,
        businessCity: p.physicalCity,
        businessState: p.physicalState,
        businessZip: p.physicalZip
      }));
    }
  }

  async function handlePrefill() {
    try {
      if (!consent) {
        alert("Please check consent to OCR prefill.");
        return;
      }
      if (!canNextFromUpload) {
        alert("Upload at least one file.");
        return;
      }

      setBusy(true);
      setStatus("Scanning documents…");

      const [idImg, checkImg, w9Img] = await Promise.all([
        fileToImageDataUrl(idFile),
        fileToImageDataUrl(checkFile),
        fileToImageDataUrl(w9File)
      ]);

      if ((idFile && !idImg) || (checkFile && !checkImg) || (w9File && !w9Img)) {
        throw new Error("Could not convert one of the uploaded PDFs/images for OCR. Try re-uploading as an image.");
      }

      const resp = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consent,
          idImageDataUrl: idImg,
          checkImageDataUrl: checkImg,
          w9ImageDataUrl: w9Img
        })
      });

      const json = await resp.json();
      if (!resp.ok || !json.success) throw new Error(json.error || "Extract failed");

      const { id_fields, bank_fields, w9_fields } = json.extracted || {};

      setForm((p) => {
        const next = { ...p };

        if (id_fields) {
          next.ownerFirstName = id_fields.first_name || next.ownerFirstName;
          next.ownerMiddleName = id_fields.middle_name || next.ownerMiddleName;
          next.ownerLastName = id_fields.last_name || next.ownerLastName;
          next.dob = normalizeISODate(id_fields.dob) || next.dob;
          next.idNumber = id_fields.id_number || next.idNumber;
          next.idExp = normalizeISODate(id_fields.id_expiration) || next.idExp;

          next.principalAddressStreet = id_fields.address_line || next.principalAddressStreet;
          next.principalAddressCity = id_fields.city || next.principalAddressCity;
          next.principalAddressState = id_fields.state || next.principalAddressState;
          next.principalAddressZip = id_fields.postal_code || next.principalAddressZip;
          next.dlState = id_fields.state || next.dlState;
        }

        if (bank_fields) {
          next.bankName = bank_fields.bank_name || next.bankName;
          next.routingNumber = bank_fields.routing_number || next.routingNumber;
          next.accountNumber = bank_fields.account_number || next.accountNumber;
        }

        if (w9_fields) {
          next.legalBusinessName = w9_fields.business_name || w9_fields.name || next.legalBusinessName;
          next.physicalStreet = w9_fields.address_line || next.physicalStreet;
          next.physicalCity = w9_fields.city || next.physicalCity;
          next.physicalState = w9_fields.state || next.physicalState;
          next.physicalZip = w9_fields.postal_code || next.physicalZip;
        }

        if (next.businessSameAsPhysical) {
          next.businessStreet = next.physicalStreet;
          next.businessUnit = next.physicalUnit;
          next.businessCity = next.physicalCity;
          next.businessState = next.physicalState;
          next.businessZip = next.physicalZip;
        }

        return next;
      });

      setStatus("✅ Prefill complete. Continue to complete the application.");
    } catch (e) {
      console.error(e);
      setStatus("❌ Prefill failed.");
      alert(e.message || "Prefill failed");
    } finally {
      setBusy(false);
    }
  }

  function validateStepOrAlert() {
    if (step === "business") {
      const required = [
        "legalBusinessName",
        "dbaName",
        "businessEstablishedDate",
        "taxpayerId",
        "businessPhone",
        "businessType",
        "physicalStreet",
        "physicalCity",
        "physicalState",
        "physicalZip",
        "businessEmail"
      ];
      for (const k of required) {
        if (!String(form[k] || "").trim()) return alert(`Missing required: ${k}`), false;
      }
      if (!validLenDigits(form.taxpayerId, 9)) return alert("EIN must be 9 digits."), false;
      return true;
    }

    if (step === "principal") {
      const required = [
        "ownerFirstName",
        "ownerLastName",
        "ownerTitle",
        "ownerOwnershipPct",
        "dob",
        "ownerSsn",
        "principalAddressStreet",
        "principalAddressCity",
        "principalAddressState",
        "principalAddressZip",
        "idNumber",
        "dlState",
        "idExp",
        "contactEmail",
        "contactPhone",
        "bankName",
        "routingNumber",
        "accountNumber"
      ];
      for (const k of required) {
        if (!String(form[k] || "").trim()) return alert(`Missing required: ${k}`), false;
      }
      if (!validLenDigits(form.ownerSsn, 9)) return alert("SSN must be 9 digits."), false;
      if (form.contactPhone && !validLenDigits(form.contactPhone, 10)) return alert("Cell phone must be 10 digits."), false;
      if (form.ownerHomePhone && !validLenDigits(form.ownerHomePhone, 10)) return alert("Home phone must be 10 digits."), false;
      return true;
    }

    if (step === "additional") {
      if (!String(form.signatureName || "").trim()) return alert("Signature name is required."), false;
      if (!String(form.signatureDate || "").trim()) return alert("Signature date is required."), false;
      if (!form.termsAccepted) return alert("You must accept Terms & Conditions."), false;
      if (!sigRef.current || sigRef.current.isEmpty()) return alert("Please sign in the signature box."), false;
      return true;
    }

    return true;
  }

  async function handleSubmit() {
    try {
      if (!validateStepOrAlert()) return;

      setBusy(true);
      setStatus("Submitting…");

      const signatureDataUrl = sigRef.current.toDataURL("image/png");
      const finalForm = {
        ...form,
        signatureImageDataUrl: signatureDataUrl,
        termsAccepted: !!form.termsAccepted
      };

      const [idRaw, checkRaw, w9Raw] = await Promise.all([
        fileToDataUrlRaw(idFile),
        fileToDataUrlRaw(checkFile),
        fileToDataUrlRaw(w9File)
      ]);

      const fileAttachments = {};
      if (idFile && idRaw) fileAttachments.idFile = { filename: idFile.name, mimeType: idFile.type, dataUrl: idRaw };
      if (checkFile && checkRaw) fileAttachments.checkFile = { filename: checkFile.name, mimeType: checkFile.type, dataUrl: checkRaw };
      if (w9File && w9Raw) fileAttachments.w9File = { filename: w9File.name, mimeType: w9File.type, dataUrl: w9Raw };

      const resp = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formData: finalForm, fileAttachments })
      });

      const json = await resp.json();
      if (!resp.ok || !json.success) throw new Error(json.error || "Submit failed");

      // ✅ redirect to success page
      window.location.href = `/success?appId=${encodeURIComponent(json.appId)}`;
    } catch (e) {
      console.error(e);
      alert(e.message || "Submit failed");
      setStatus("❌ Submit failed.");
    } finally {
      setBusy(false);
    }
  }

  function next() {
    if (step !== "upload" && !validateStepOrAlert()) return;
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }

  function back() {
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  return (
    <div className="container">
      <div className="header">
        <div className="logo-wrap">
          {/* ✅ Correct path. In Vite, /public/logo.svg is WRONG.
              If server hosts it: use SERVER_ORIGIN + /public/logo.svg
           */}
          <img src={`${SERVER_ORIGIN}/public/logo.svg`} alt="Halo" />
        </div>

        <h1 className="h1">Merchant Application - V3</h1>
        <p className="sub">
          Upload documents, optionally prefill with OCR (with consent), then submit. We email one merged PDF.
        </p>
      </div>

      <div className="stepper">
        {STEPS.map((s, idx) => (
          <div key={s.key} className={"pill " + (idx === stepIndex ? "pillActive" : "")}>
            {s.label}
          </div>
        ))}
      </div>

      {/* ===== UPLOAD STEP ===== */}
      {step === "upload" && (
        <div className="card">
          <div className="cardTitle">1) Upload Documents</div>

          <div className="grid2">
            <div className="row">
              <div className="label">Photo ID (image or PDF)</div>
              <input className="input" type="file" accept="image/*,.pdf" onChange={(e) => setIdFile(e.target.files?.[0] || null)} />
            </div>

            <div className="row">
              <div className="label">Voided Check or Bank letter (image or PDF)</div>
              <input className="input" type="file" accept="image/*,.pdf" onChange={(e) => setCheckFile(e.target.files?.[0] || null)} />
            </div>

            <div className="row">
              <div className="label">W-9 (image or PDF)</div>
              <input className="input" type="file" accept="image/*,.pdf" onChange={(e) => setW9File(e.target.files?.[0] || null)} />
              <div className="notice">
                Download blank W-9 from IRS:{" "}
                <a href="https://www.irs.gov/pub/irs-pdf/fw9.pdf" target="_blank" rel="noreferrer">
                  fw9.pdf
                </a>
              </div>
            </div>

            <div className="row">
              <label className="notice checkboxLine">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> I consent to OCR prefill from uploaded documents
              </label>
              <div className="notice subtle">Note: We do not OCR SSN/EIN from W-9.</div>
            </div>
          </div>

          <div className="btnRow">
            <button className="btn btnPrimary" disabled={busy} onClick={handlePrefill}>
              {busy ? "Scanning…" : "Prefill Application"}
            </button>
            <button className="btn btnGhost" disabled={busy} onClick={() => setStepIndex(1)}>
              Continue
            </button>
          </div>

          {!!status && <div className="notice" style={{ marginTop: 10 }}>{status}</div>}
        </div>
      )}

      {/* ===== BUSINESS STEP ===== */}
      {/* ✅ Keep the rest of your JSX exactly as you already have for business/principal/additional.
          No changes needed except it will now redirect to /success.
      */}
      {/* ... your existing business/principal/additional blocks ... */}

    </div>
  );
}
