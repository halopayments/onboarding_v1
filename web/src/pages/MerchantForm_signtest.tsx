import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Modal from "../components/Modal";
import SignaturePad, { SignaturePadRef } from "../components/SignaturePad";

import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

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

function digitsOnly(s: string) {
  return String(s || "").replace(/\D/g, "");
}

export default function MerchantForm() {
  // TEMP: Start directly at step 4 for testing
  const [stepIndex, setStepIndex] = useState(3);
  const step = STEPS[stepIndex].key;

  const [hasSignature, setHasSignature] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const sigPadRef = useRef<SignaturePadRef | null>(null);

  // Stabilize callback with useCallback to prevent SignaturePad re-renders
  const handleSignatureChange = useCallback((hasSig: boolean) => {
    setHasSignature(hasSig);
  }, []);

  // modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("Notice");
  const [modalMsg, setModalMsg] = useState("");

  function showModal(title: string, msg: string) {
    setModalTitle(title);
    setModalMsg(msg);
    setModalOpen(true);
  }

  function setVal<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function handleSubmit() {
    try {
      if (!String(form.signatureName || "").trim()) {
        showModal("Missing required", "Signer name is required.");
        return;
      }
      if (!String(form.signatureDate || "").trim()) {
        showModal("Missing required", "Signature date is required.");
        return;
      }
      if (!form.termsAccepted) {
        showModal("Terms required", "You must accept Terms & Conditions.");
        return;
      }
      if (!sigPadRef.current || sigPadRef.current.isEmpty()) {
        showModal("Signature required", "Please sign in the signature box.");
        return;
      }

      setBusy(true);
      setStatus("Submitting…");

      const signatureDataUrl = sigPadRef.current?.toDataURL("image/png") || "";
      const finalForm = {
        ...form,
        signatureImageDataUrl: signatureDataUrl,
        termsAccepted: !!form.termsAccepted
      };

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      setStatus(`✅ Submitted successfully!`);
      showModal("Success", "Form submitted successfully!");
    } catch (e: any) {
      console.error(e);
      setStatus("❌ Submit failed.");
      showModal("Submit failed", e?.message || "Submit failed");
    } finally {
      setBusy(false);
    }
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
        <h1 className="h1">Merchant Application - TESTING STEP 4</h1>
        <p className="sub">Testing signature field only</p>
      </div>

      <div className="stepper">
        {STEPS.map((s, idx) => {
          return (
            <div
              key={s.key}
              className={"pill " + (idx === stepIndex ? "pillActive" : "")}
            >
              {s.label}
            </div>
          );
        })}
      </div>

      {/* STEP 4 - TESTING ONLY */}
      <div className="card">
        <div className="cardTitle">4) Additional + Signature (TEST MODE)</div>

        <div className="grid2">
          <div className="row">
            <div className="label">FNS NO. (IF YOU PROCESS EBT/FOODSTAMP):</div>
            <input 
              className="input" 
              inputMode="numeric" 
              value={form.ccTerminal} 
              onChange={(e) => setVal("ccTerminal", e.target.value)} 
            />
          </div>
        </div>

        <div className="row">
          <div className="label">Other Notes</div>
          <textarea 
            className="textarea" 
            value={form.otherNotes} 
            onChange={(e) => setVal("otherNotes", e.target.value)} 
          />
        </div>

        <div className="sectionHeading">Signature & Terms</div>

        <div className="row">
          <div className="label">Signature (required) - Try scrolling after signing!</div>
          
          <SignaturePad
            ref={sigPadRef}
            onSignatureChange={handleSignatureChange}
          />

          <div className="btnRow" style={{ marginTop: 8 }}>
            <button
              className="btn btnGhost"
              type="button"
              onClick={() => sigPadRef.current?.clear()}
            >
              Clear Signature
            </button>
          </div>
        </div>

        <div className="grid2">
          <div className="row">
            <div className="label">Signer Name *</div>
            <input 
              className="input" 
              value={form.signatureName} 
              onChange={(e) => setVal("signatureName", e.target.value)} 
            />
          </div>
          <div className="row">
            <div className="label">Signature Date *</div>
            <input 
              className="input" 
              type="date" 
              value={form.signatureDate} 
              onChange={(e) => setVal("signatureDate", e.target.value)} 
            />
          </div>
        </div>

        <div className="row">
          <label className="notice checkboxLine">
            <input 
              type="checkbox" 
              checked={form.termsAccepted} 
              onChange={(e) => setVal("termsAccepted", e.target.checked)} 
            /> I agree to Terms & Conditions *
          </label>
        </div>

        <div className="btnRow">
          <button 
            className="btn btnPrimary" 
            disabled={busy} 
            onClick={handleSubmit}
          >
            {busy ? "Submitting…" : "Submit (Test)"}
          </button>
        </div>

        {!!status && <div className="notice" style={{ marginTop: 10 }}>{status}</div>}
        
        <div className="notice" style={{ marginTop: 20, padding: 10, background: "#fff3cd", borderRadius: 8 }}>
          <strong>Testing Instructions:</strong>
          <ol style={{ marginTop: 8, paddingLeft: 20 }}>
            <li>Draw your signature in the box above</li>
            <li>Scroll up and down on the page</li>
            <li>Type in the "Signer Name" field</li>
            <li>Your signature should now remain intact!</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
