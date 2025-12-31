import React, { useEffect, useMemo, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import Modal from "../components/Modal";

import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";


pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";



type StepKey = "upload" | "business" | "principal" | "additional";




const STEPS: { key: StepKey; label: string }[] = [
  { key: "upload", label: "1) Upload" },
  { key: "business", label: "2) Business" },
  { key: "principal", label: "3) Principal + Banking" },
  { key: "additional", label: "4) Additional + Sign" }
];

type FormState = {
  legalBusinessName: string;
  dbaName: string;
  businessEstablishedDate: string;
  taxpayerId: string;
  businessPhone: string;
  businessType: string;
  businessTypeOther: string;
  physicalStreet: string;
  physicalUnit: string;
  physicalCity: string;
  physicalState: string;
  physicalZip: string;
  businessSameAsPhysical: boolean;
  businessStreet: string;
  businessUnit: string;
  businessCity: string;
  businessState: string;
  businessZip: string;
  businessEmail: string;
  businessWebsite: string;
  fnsNumber: string;

  ownerLastName: string;
  ownerFirstName: string;
  ownerMiddleName: string;
  ownerTitle: string;
  ownerOwnershipPct: string;
  dob: string;
  ownerSsn: string;
  ownerHomePhone: string;
  principalAddressStreet: string;
  principalAddressUnit: string;
  principalAddressCity: string;
  principalAddressState: string;
  principalAddressZip: string;
  idNumber: string;
  dlState: string;
  idExp: string;
  contactEmail: string;
  contactPhone: string;

  bankName: string;
  routingNumber: string;
  accountNumber: string;

  // additional fields
  ccTerminal: string;
  encryption: string;
  gasStationPos: string;
  pricing: string;
  installationDate: string;
  otherFleetCards: string;
  siteId: string;
  otherNotes: string;

  signatureName: string;
  signatureDate: string;
  signatureImageDataUrl: string;
  termsAccepted: boolean;
};

const emptyForm: FormState = {
  legalBusinessName: "",
  dbaName: "",
  businessEstablishedDate: "",
  taxpayerId: "",
  businessPhone: "",
  businessType: "",
  businessTypeOther: "",
  physicalStreet: "",
  physicalUnit: "",
  physicalCity: "",
  physicalState: "",
  physicalZip: "",
  businessSameAsPhysical: false,
  businessStreet: "",
  businessUnit: "",
  businessCity: "",
  businessState: "",
  businessZip: "",
  businessEmail: "",
  businessWebsite: "",
  fnsNumber: "",

  ownerLastName: "",
  ownerFirstName: "",
  ownerMiddleName: "",
  ownerTitle: "",
  ownerOwnershipPct: "",
  dob: "",
  ownerSsn: "",
  ownerHomePhone: "",
  principalAddressStreet: "",
  principalAddressUnit: "",
  principalAddressCity: "",
  principalAddressState: "",
  principalAddressZip: "",
  idNumber: "",
  dlState: "",
  idExp: "",
  contactEmail: "",
  contactPhone: "",

  bankName: "",
  routingNumber: "",
  accountNumber: "",

  ccTerminal: "",
  encryption: "",
  gasStationPos: "",
  pricing: "",
  installationDate: "",
  otherFleetCards: "",
  siteId: "",
  otherNotes: "",

  signatureName: "",
  signatureDate: "",
  signatureImageDataUrl: "",
  termsAccepted: false
};

function normalizeISODate(s: string) {
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = String(s).match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (!m) return "";
  return `${m[3]}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
}

function digitsOnly(s: string) {
  return String(s || "").replace(/\D/g, "");
}

function validLenDigits(s: string, len: number) {
  const d = digitsOnly(s);
  return d.length === len;
}

async function fileToImageDataUrl(file: File | null): Promise<string | null> {
  if (!file) return null;

  // If image, just read as data URL
  if (file.type.startsWith("image/")) {
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  // If PDF, render page 1 into a canvas
  if (file.type === "application/pdf") {
    const buf = await file.arrayBuffer();

    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const page = await pdf.getPage(1);

    const viewport = page.getViewport({ scale: 1.6 });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) return null;

    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    const renderTask = page.render({
      canvas,               // ✅ v4 types want this
      canvasContext: ctx,   // ✅ keep this too (works at runtime)
      viewport
    });

    await renderTask.promise;

    return canvas.toDataURL("image/png");
  }

  return null;
}


async function fileToDataUrlRaw(file: File | null): Promise<string | null> {
  if (!file) return null;
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function resizeSigCanvas(sigRef: React.RefObject<SignatureCanvas>) {
  const sig = sigRef.current;
  if (!sig) return;

  const canvas = sig.getCanvas();
  const wrapper = canvas.parentElement;
  if (!wrapper) return;

  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  const w = wrapper.clientWidth;
  const h = 220;

  // preserve current drawing
  const data = sig.toData();

  canvas.width = Math.floor(w * ratio);
  canvas.height = Math.floor(h * ratio);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  const ctx = canvas.getContext("2d");
  if (ctx) ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  sig.clear();
  sig.fromData(data);
}

function prefillCountGet(): number {
  const v = sessionStorage.getItem("prefillCount");
  const n = Number(v || "0");
  return Number.isFinite(n) ? n : 0;
}
function prefillCountInc(): number {
  const next = prefillCountGet() + 1;
  sessionStorage.setItem("prefillCount", String(next));
  return next;
}

export default function MerchantForm() {
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex].key;

  const [form, setForm] = useState<FormState>(emptyForm);

  const [idFile, setIdFile] = useState<File | null>(null);
  const [checkFile, setCheckFile] = useState<File | null>(null);
  const [w9File, setW9File] = useState<File | null>(null);

  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const [showEIN, setShowEIN] = useState(true);
  const [showSSN, setShowSSN] = useState(true);

  const sigRef = useRef<SignatureCanvas | null>(null);

  // modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("Notice");
  const [modalMsg, setModalMsg] = useState("");

  function showModal(title: string, msg: string) {
    setModalTitle(title);
    setModalMsg(msg);
    setModalOpen(true);
  }

  // Signature resize
  useEffect(() => {
    const t = setTimeout(() => resizeSigCanvas(sigRef as any), 0);
    const onResize = () => resizeSigCanvas(sigRef as any);
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    if (step === "additional") {
      const t = setTimeout(() => resizeSigCanvas(sigRef as any), 0);
      return () => clearTimeout(t);
    }
  }, [step]);

  const all3DocsPresent = useMemo(() => !!(idFile && checkFile && w9File), [idFile, checkFile, w9File]);

  function setVal<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function syncBizAddress(checked: boolean) {
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
      if (!all3DocsPresent) {
        showModal("Missing documents", "All 3 documents are required: Photo ID, Voided Check/Letter, and Form W-9.");
        return;
      }

      // enforce 3-per-session only when consent true (actual OCR attempt)
      if (consent) {
        const cnt = prefillCountGet();
        if (cnt >= 3) {
          showModal("Prefill limit reached", "You can only click Prefill 3 times per session. Refresh the page to reset.");
          return;
        }
      }

      setBusy(true);
      setStatus(consent ? "Scanning documents…" : "Consent not checked — skipping OCR (no prefill).");

      const [idImg, checkImg, w9Img] = await Promise.all([
        fileToImageDataUrl(idFile),
        fileToImageDataUrl(checkFile),
        fileToImageDataUrl(w9File)
      ]);

      if (!idImg || !checkImg || !w9Img) {
        throw new Error("Could not convert one of the uploaded documents for OCR. Try uploading as an image.");
      }

      if (consent) prefillCountInc();

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

        // W9: non-sensitive only
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

      setStatus(consent ? "✅ Prefill complete." : "✅ Skipped OCR (consent not checked).");
      showModal("Prefill", consent ? "Prefill completed, Please click on 'Continue'." : "Consent was not checked, so OCR was skipped.");
    } catch (e: any) {
      console.error(e);
      setStatus("❌ Prefill failed.");
      showModal("Prefill failed", e?.message || "Prefill failed");
    } finally {
      setBusy(false);
    }
  }

  function validateStepOrModal(): boolean {
    if (step === "upload") {
      if (!all3DocsPresent) {
        showModal("Missing documents", "All 3 documents are required: Photo ID, Voided Check/Letter, and Form W-9.");
        return false;
      }
      return true;
    }

    if (step === "business") {
      const required: (keyof FormState)[] = [
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
        if (!String(form[k] || "").trim()) {
          showModal("Missing required", `Missing required: ${String(k)}`);
          return false;
        }
      }
      if (!validLenDigits(form.taxpayerId, 9)) {
        showModal("Invalid EIN", "EIN must be 9 digits.");
        return false;
      }
      if (form.businessPhone && !validLenDigits(form.businessPhone, 10)) {
        showModal("Invalid phone", "Business phone must be 10 digits.");
        return false;
      }
      return true;
    }

    if (step === "principal") {
      const required: (keyof FormState)[] = [
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
        if (!String(form[k] || "").trim()) {
          showModal("Missing required", `Missing required: ${String(k)}`);
          return false;
        }
      }
      if (!validLenDigits(form.ownerSsn, 9)) {
        showModal("Invalid SSN", "SSN must be 9 digits.");
        return false;
      }
      if (form.contactPhone && !validLenDigits(form.contactPhone, 10)) {
        showModal("Invalid phone", "Cell phone must be 10 digits.");
        return false;
      }
      if (form.ownerHomePhone && !validLenDigits(form.ownerHomePhone, 10)) {
        showModal("Invalid phone", "Home phone must be 10 digits.");
        return false;
      }
      return true;
    }

    if (step === "additional") {
      if (!String(form.signatureName || "").trim()) {
        showModal("Missing required", "Signer name is required.");
        return false;
      }
      if (!String(form.signatureDate || "").trim()) {
        showModal("Missing required", "Signature date is required.");
        return false;
      }
      if (!form.termsAccepted) {
        showModal("Terms required", "You must accept Terms & Conditions.");
        return false;
      }
      if (!sigRef.current || sigRef.current.isEmpty()) {
        showModal("Signature required", "Please sign in the signature box.");
        return false;
      }
      return true;
    }

    return true;
  }

  async function handleSubmit() {
    try {
      if (!validateStepOrModal()) return;
      if (!all3DocsPresent) {
        showModal("Missing documents", "All 3 documents are required.");
        return;
      }

      setBusy(true);
      setStatus("Submitting…");

      const signatureDataUrl = sigRef.current?.toDataURL("image/png") || "";
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

      const fileAttachments: any = {
        idFile: { filename: idFile?.name, mimeType: idFile?.type, dataUrl: idRaw },
        checkFile: { filename: checkFile?.name, mimeType: checkFile?.type, dataUrl: checkRaw },
        w9File: { filename: w9File?.name, mimeType: w9File?.type, dataUrl: w9Raw }
      };

      const resp = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formData: finalForm, fileAttachments })
      });

      const json = await resp.json();
      if (!resp.ok || !json.success) throw new Error(json.error || "Submit failed");

      setStatus(`✅ Submitted. App ID: ${json.appId}`);

      // redirect to success
      window.location.assign(`/success?appId=${encodeURIComponent(json.appId)}`);
    } catch (e: any) {
      console.error(e);
      setStatus("❌ Submit failed.");
      showModal("Submit failed", e?.message || "Submit failed");
    } finally {
      setBusy(false);
    }
  }

  function next() {
    if (!validateStepOrModal()) return;
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }

  function back() {
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  return (
    <div className="container">
      <Modal open={modalOpen} title={modalTitle} onClose={() => setModalOpen(false)}>
        <div style={{ lineHeight: 1.5 }}>{modalMsg}</div>
        <div className="btnRow" style={{ marginTop: 14 }}>
          <button className="btn btnPrimary" onClick={() => setModalOpen(false)}>
            OK
          </button>
        </div>
      </Modal>

      <div className="header">
        <div className="logo-wrap">
          <img src="/logo.svg" alt="Halo" />
        </div>
        <h1 className="h1">Merchant Application</h1>
        <p className="sub">Upload all documents, optionally prefill (with consent), then submit.</p>
      </div>

      <div className="stepper">
        {STEPS.map((s, idx) => {
          const clickable = idx <= stepIndex; // safe: only back/current
          return (
            <div
              key={s.key}
              className={"pill " + (idx === stepIndex ? "pillActive" : "") + (clickable ? " pillClickable" : "")}
              onClick={() => clickable && setStepIndex(idx)}
              role={clickable ? "button" : undefined}
            >
              {s.label}
            </div>
          );
        })}
      </div>

      {/* STEP 1 */}
      {step === "upload" && (
        <div className="card">
          <div className="cardTitle">1) Upload Documents (Required)</div>

          <div className="grid2">
            <div className="row">
              <div className="label">Photo ID *</div>
              <input className="input" type="file" accept="image/*,.pdf" onChange={(e) => setIdFile(e.target.files?.[0] || null)} />
            </div>

            <div className="row">
              <div className="label">Voided Check / Bank Letter *</div>
              <input className="input" type="file" accept="image/*,.pdf" onChange={(e) => setCheckFile(e.target.files?.[0] || null)} />
            </div>

            <div className="row">
              <div className="label">Form W-9 *</div>
              <input className="input" type="file" accept="image/*,.pdf" onChange={(e) => setW9File(e.target.files?.[0] || null)} />
              <div className="notice">
                Download blank W-9:{" "}
                <a href="https://www.irs.gov/pub/irs-pdf/fw9.pdf" target="_blank" rel="noreferrer">
                  fw9.pdf
                </a>
              </div>
            </div>

            <div className="row">
              <label className="notice checkboxLine">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> I consent to OCR prefill
              </label>
              <div className="notice subtle">
                Prefill limit: <b>{Math.max(0, 3 - prefillCountGet())}</b> remaining this session.
              </div>
              <div className="notice subtle">Note: From W-9 SSN/EIN is not extracted.</div>
            </div>
          </div>

         <div className="btnRow">
          <button
            className="btn btnPrimary"
            disabled={busy || !consent || !(idFile && checkFile && w9File)}
            onClick={handlePrefill}
            title={
              !consent
                ? "Check consent to enable OCR prefill"
                : !(idFile && checkFile && w9File)
                ? "Upload Photo ID, Voided Check/Letter, and W-9 to enable OCR prefill"
                : ""
            }
          >
            {busy ? "Working…" : "Prefill Application"}
          </button>

          <button className="btn btnGhost" disabled={busy} onClick={next}>
            Continue
          </button>
        </div>


          {!!status && <div className="notice" style={{ marginTop: 10 }}>{status}</div>}
        </div>
      )}

      {/* STEP 2 */}
      {step === "business" && (
        <div className="card">
          <div className="cardTitle">2) Business Information</div>

          <div className="grid2">
            <div className="row">
              <div className="label">Legal Business Name *</div>
              <input className="input" value={form.legalBusinessName} onChange={(e) => setVal("legalBusinessName", e.target.value)} />
            </div>

            <div className="row">
              <div className="label">DBA Name *</div>
              <input className="input" value={form.dbaName} onChange={(e) => setVal("dbaName", e.target.value)} />
            </div>

            <div className="row">
              <div className="label">Date Established *</div>
              <input className="input" type="date" value={form.businessEstablishedDate} onChange={(e) => setVal("businessEstablishedDate", e.target.value)} />
            </div>

            <div className="row">
              <div className="label">Taxpayer ID (EIN) * (9 digits)</div>
              <div className="eyeWrap">
                <input
                  className="input eyeInput"
                  type={showEIN ? "text" : "password"}
                  inputMode="numeric"
                  value={form.taxpayerId}
                  onChange={(e) => setVal("taxpayerId", digitsOnly(e.target.value).slice(0, 9))}
                  placeholder="#########"
                />
                <button type="button" className="eyeBtn" onClick={() => setShowEIN((s) => !s)}>
                  {showEIN ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div className="row">
              <div className="label">Business Phone *</div>
              <input
                className="input"
                inputMode="numeric"
                value={form.businessPhone}
                onChange={(e) => setVal("businessPhone", digitsOnly(e.target.value).slice(0, 10))}
              />
            </div>

            <div className="row">
              <div className="label">Business Type *</div>
              <select className="select" value={form.businessType} onChange={(e) => setVal("businessType", e.target.value)}>
                <option value="">Select…</option>
                <option value="restaurant">Restaurant</option>
                <option value="convenience">Convenience Store</option>
                <option value="liquor">Liquor Store</option>
                <option value="ecommerce">E-Commerce</option>
                <option value="service">Service</option>
                <option value="other">Other</option>
              </select>
            </div>

            {form.businessType === "other" && (
              <div className="row">
                <div className="label">If Other, Describe</div>
                <input className="input" value={form.businessTypeOther} onChange={(e) => setVal("businessTypeOther", e.target.value)} />
              </div>
            )}
          </div>

          <div className="sectionHeading">Physical Address</div>
          <div className="grid3">
            <div className="row">
              <div className="label">Street *</div>
              <input className="input" value={form.physicalStreet} onChange={(e) => setVal("physicalStreet", e.target.value)} />
            </div>
            <div className="row">
              <div className="label">Unit #</div>
              <input className="input" value={form.physicalUnit} onChange={(e) => setVal("physicalUnit", e.target.value)} />
            </div>
            <div className="row">
              <div className="label">City *</div>
              <input className="input" value={form.physicalCity} onChange={(e) => setVal("physicalCity", e.target.value)} />
            </div>
            <div className="row">
              <div className="label">State *</div>
              <input className="input" value={form.physicalState} onChange={(e) => setVal("physicalState", e.target.value)} />
            </div>
            <div className="row">
              <div className="label">ZIP *</div>
              <input className="input" inputMode="numeric" value={form.physicalZip} onChange={(e) => setVal("physicalZip", digitsOnly(e.target.value).slice(0, 10))} />
            </div>
          </div>

          <div className="row">
            <label className="notice checkboxLine">
              <input type="checkbox" checked={form.businessSameAsPhysical} onChange={(e) => syncBizAddress(e.target.checked)} /> Business address same as physical
            </label>
          </div>

          <div className="sectionHeading">Mailing Address</div>
          <div className="grid3">
            <div className="row">
              <div className="label">Street *</div>
              <input className="input" value={form.businessStreet} onChange={(e) => setVal("businessStreet", e.target.value)} />
            </div>
            <div className="row">
              <div className="label">Unit #</div>
              <input className="input" value={form.businessUnit} onChange={(e) => setVal("businessUnit", e.target.value)} />
            </div>
            <div className="row">
              <div className="label">City *</div>
              <input className="input" value={form.businessCity} onChange={(e) => setVal("businessCity", e.target.value)} />
            </div>
            <div className="row">
              <div className="label">State *</div>
              <input className="input" value={form.businessState} onChange={(e) => setVal("businessState", e.target.value)} />
            </div>
            <div className="row">
              <div className="label">ZIP *</div>
              <input className="input" inputMode="numeric" value={form.businessZip} onChange={(e) => setVal("businessZip", digitsOnly(e.target.value).slice(0, 10))} />
            </div>
          </div>

          <div className="grid2">
            <div className="row">
              <div className="label">Business Email *</div>
              <input className="input" value={form.businessEmail} onChange={(e) => setVal("businessEmail", e.target.value)} />
            </div>
            <div className="row">
              <div className="label">Website</div>
              <input className="input" value={form.businessWebsite} onChange={(e) => setVal("businessWebsite", e.target.value)} />
            </div>
          </div>

          <div className="btnRow">
            <button className="btn btnGhost" onClick={back}>Back</button>
            <button className="btn btnPrimary" onClick={next}>Next</button>
          </div>
        </div>
      )}

      {/* STEP 3 */}
      {step === "principal" && (
        <div className="card">
          <div className="cardTitle">3) Principal + Banking</div>

          <div className="sectionHeading">Principal</div>
          <div className="grid2">
            <div className="row">
              <div className="label">First Name *</div>
              <input className="input" value={form.ownerFirstName} onChange={(e) => setVal("ownerFirstName", e.target.value)} />
            </div>
            <div className="row">
              <div className="label">Last Name *</div>
              <input className="input" value={form.ownerLastName} onChange={(e) => setVal("ownerLastName", e.target.value)} />
            </div>

            <div className="row">
              <div className="label">Owner Title *</div>
              <input className="input" value={form.ownerTitle} onChange={(e) => setVal("ownerTitle", e.target.value)} />
            </div>

            <div className="row">
              <div className="label">Ownership % *</div>
              <input className="input" inputMode="numeric" value={form.ownerOwnershipPct} onChange={(e) => setVal("ownerOwnershipPct", digitsOnly(e.target.value).slice(0, 3))} />
            </div>

            <div className="row">
              <div className="label">DOB *</div>
              <input className="input" type="date" value={form.dob} onChange={(e) => setVal("dob", e.target.value)} />
            </div>

            <div className="row">
              <div className="label">SSN * (9 digits)</div>
              <div className="eyeWrap">
                <input
                  className="input eyeInput"
                  type={showSSN ? "text" : "password"}
                  inputMode="numeric"
                  value={form.ownerSsn}
                  onChange={(e) => setVal("ownerSsn", digitsOnly(e.target.value).slice(0, 9))}
                />
                <button type="button" className="eyeBtn" onClick={() => setShowSSN((s) => !s)}>
                  {showSSN ? "Hide" : "Show"}
                </button>
              </div>
            </div>
          </div>

          <div className="sectionHeading">Principal Address</div>
          <div className="grid3">
            <div className="row">
              <div className="label">Street *</div>
              <input className="input" value={form.principalAddressStreet} onChange={(e) => setVal("principalAddressStreet", e.target.value)} />
            </div>
            <div className="row">
              <div className="label">Unit #</div>
              <input className="input" value={form.principalAddressUnit} onChange={(e) => setVal("principalAddressUnit", e.target.value)} />
            </div>
            <div className="row">
              <div className="label">City *</div>
              <input className="input" value={form.principalAddressCity} onChange={(e) => setVal("principalAddressCity", e.target.value)} />
            </div>
            <div className="row">
              <div className="label">State *</div>
              <input className="input" value={form.principalAddressState} onChange={(e) => setVal("principalAddressState", e.target.value)} />
            </div>
            <div className="row">
              <div className="label">ZIP *</div>
              <input className="input" inputMode="numeric" value={form.principalAddressZip} onChange={(e) => setVal("principalAddressZip", digitsOnly(e.target.value).slice(0, 10))} />
            </div>
          </div>

          <div className="sectionHeading">ID + Contact</div>
          <div className="grid2">
            <div className="row">
              <div className="label">Driver’s License # *</div>
              <input className="input" value={form.idNumber} onChange={(e) => setVal("idNumber", e.target.value)} />
            </div>
            <div className="row">
              <div className="label">State Issued *</div>
              <input className="input" value={form.dlState} onChange={(e) => setVal("dlState", e.target.value)} />
            </div>
            <div className="row">
              <div className="label">Expiration *</div>
              <input className="input" type="date" value={form.idExp} onChange={(e) => setVal("idExp", e.target.value)} />
            </div>
            <div className="row">
              <div className="label">Owner Email *</div>
              <input className="input" value={form.contactEmail} onChange={(e) => setVal("contactEmail", e.target.value)} />
            </div>
            <div className="row">
              <div className="label">Cell Phone * (10 digits)</div>
              <input className="input" inputMode="numeric" value={form.contactPhone} onChange={(e) => setVal("contactPhone", digitsOnly(e.target.value).slice(0, 10))} />
            </div>
            <div className="row">
              <div className="label">Home Phone (10 digits)</div>
              <input className="input" inputMode="numeric" value={form.ownerHomePhone} onChange={(e) => setVal("ownerHomePhone", digitsOnly(e.target.value).slice(0, 10))} />
            </div>
          </div>

          <div className="sectionHeading">Banking Information</div>
          <div className="grid2">
            <div className="row">
              <div className="label">Bank Name *</div>
              <input className="input" value={form.bankName} onChange={(e) => setVal("bankName", e.target.value)} />
            </div>
            <div className="row">
              <div className="label">Routing Number *</div>
              <input className="input" inputMode="numeric" value={form.routingNumber} onChange={(e) => setVal("routingNumber", digitsOnly(e.target.value))} />
            </div>
            <div className="row">
              <div className="label">Account Number *</div>
              <input className="input" inputMode="numeric" value={form.accountNumber} onChange={(e) => setVal("accountNumber", digitsOnly(e.target.value))} />
            </div>
          </div>

          <div className="btnRow">
            <button className="btn btnGhost" onClick={back}>Back</button>
            <button className="btn btnPrimary" onClick={next}>Next</button>
          </div>
        </div>
      )}

      {/* STEP 4 */}
      {step === "additional" && (
        <div className="card">
          <div className="cardTitle">4) Additional + Signature</div>

          <div className="sectionHeading">Additional Information</div>
          <div className="grid2">
            <div className="row">
              <div className="label">Terminal</div>
              <input className="input" value={form.ccTerminal} onChange={(e) => setVal("ccTerminal", e.target.value)} />
            </div>

            <div className="row">
              <div className="label">Encryption</div>
              <select className="select" value={form.encryption} onChange={(e) => setVal("encryption", e.target.value)}>
                <option value="">Select…</option>
                <option value="WF 350">WF 350</option>
                <option value="WF 351">WF 351</option>
              </select>
            </div>

            <div className="row">
              <div className="label">Gas Station POS</div>
              <select className="select" value={form.gasStationPos} onChange={(e) => setVal("gasStationPos", e.target.value)}>
                <option value="">Select…</option>
                <option value="petrotechPOS">petrotechPOS</option>
                <option value="ruby">ruby</option>
              </select>
            </div>

            <div className="row">
              <div className="label">PRICING</div>
              <input className="input" value={form.pricing} onChange={(e) => setVal("pricing", e.target.value)} />
            </div>

            <div className="row">
              <div className="label">Installation Date</div>
              <input className="input" type="date" value={form.installationDate} onChange={(e) => setVal("installationDate", e.target.value)} />
            </div>

            <div className="row">
              <div className="label">Other Fleet Cards</div>
              <input className="input" value={form.otherFleetCards} onChange={(e) => setVal("otherFleetCards", e.target.value)} />
            </div>

            <div className="row">
              <div className="label">Site ID #</div>
              <input className="input" value={form.siteId} onChange={(e) => setVal("siteId", e.target.value)} />
            </div>
          </div>

          <div className="row">
            <div className="label">Other Notes</div>
            <textarea className="textarea" value={form.otherNotes} onChange={(e) => setVal("otherNotes", e.target.value)} />
          </div>

          <div className="sectionHeading">Signature & Terms</div>

          <div className="row">
            <div className="label">Signature (required)</div>
            <div className="sigBox">
              <SignatureCanvas
                ref={sigRef as any}
                penColor="black"
                backgroundColor="white"
                canvasProps={{
                  style: {
                    width: "100%",
                    height: "220px",
                    borderRadius: "12px"
                  }
                }}
              />
            </div>
            <div className="btnRow" style={{ marginTop: 8 }}>
              <button className="btn btnGhost" type="button" onClick={() => sigRef.current?.clear()}>
                Clear Signature
              </button>
            </div>
          </div>

          <div className="grid2">
            <div className="row">
              <div className="label">Signer Name *</div>
              <input className="input" value={form.signatureName} onChange={(e) => setVal("signatureName", e.target.value)} />
            </div>
            <div className="row">
              <div className="label">Signature Date *</div>
              <input className="input" type="date" value={form.signatureDate} onChange={(e) => setVal("signatureDate", e.target.value)} />
            </div>
          </div>

          <div className="row">
            <label className="notice checkboxLine">
              <input type="checkbox" checked={form.termsAccepted} onChange={(e) => setVal("termsAccepted", e.target.checked)} /> I agree to Terms & Conditions *
            </label>
          </div>

          <div className="btnRow">
            <button className="btn btnGhost" onClick={back}>Back</button>
            <button className="btn btnPrimary" disabled={busy} onClick={handleSubmit}>
              {busy ? "Submitting…" : "Submit"}
            </button>
          </div>

          {!!status && <div className="notice" style={{ marginTop: 10 }}>{status}</div>}
        </div>
      )}
    </div>
  );
}
