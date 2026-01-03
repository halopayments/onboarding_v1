import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import confetti from "canvas-confetti";

type SubmissionResponse = {
  success: true;
  appId: string;
  businessName: string;
  ownerName: string;
  createdAt: string;
  driveLink?: string;
  driveDirectDownloadUrl?: string;
};



function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

function safeDateLabel(v: string | undefined | null): string {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

export default function Success() {
  const q = useQuery();
  const navigate = useNavigate();

  const appId = q.get("appId") || "";
  const [data, setData] = useState<SubmissionResponse | null>(null);
  const [err, setErr] = useState<string>("");

  const [secondsLeft, setSecondsLeft] = useState(15);

  const pdfUrl = useMemo(() => {
    if (!appId) return "";
    return `/api/submission/${encodeURIComponent(appId)}/pdf`;
  }, [appId]);

  useEffect(() => {
    if (!appId) {
      setErr("Missing appId in URL.");
      return;
    }

    (async () => {
      try {
        setErr("");
        const resp = await fetch(`/api/submission/${encodeURIComponent(appId)}`);
        const json = (await resp.json()) as SubmissionResponse | { success: false; error?: string };

        if (!resp.ok || !("success" in json) || json.success !== true) {
          throw new Error(("error" in json && json.error) ? json.error : "Failed to load submission");
        }

        setData(json);

      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to load submission";
        setErr(msg);
      }
    })();
  }, [appId]);

  useEffect(() => {
  const duration = 1200;
  const end = Date.now() + duration;

  (function frame() {
    confetti({
      particleCount: 6,
      spread: 70,
      origin: { y: 0.6 }
    });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}, []);


  // redirect timer (15 sec)
  useEffect(() => {
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(t);
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (secondsLeft <= 0) {
      window.location.assign("https://halopayments.com");
    }
  }, [secondsLeft]);

  return (
    <div className="container">
      <div className="card">
        <div className="cardTitle">Application Submitted</div>

        {appId ? (
          <div className="notice">
            <b>Application ID:</b> {appId}
          </div>
        ) : null}

        {err ? <div className="notice" style={{ color: "crimson" }}>{err}</div> : null}

        {data && (
          <div className="details">
            <div><b>Business:</b> {data.businessName || "-"}</div>
            <div><b>Owner:</b> {data.ownerName || "-"}</div>
            <div><b>Created:</b> {safeDateLabel(data.createdAt)}</div>
          </div>
        )}

        <div className="successHero">
        <div className="successIcon">✅</div>
        <div className="successTitle">Application Submitted</div>
        <div className="successSubtitle">We’ll review it and get back to you shortly.</div>
      </div>

        
        <div className="btnRow" style={{ marginTop: 12 }}>
          <button
            className="btn btnPrimary"
            onClick={() => {
              if (!pdfUrl) return;
              // force download navigation
              window.location.assign(pdfUrl);
            }}
            disabled={!appId}
          >
            Download PDF
          </button>

          <button className="btn btnGhost" onClick={() => navigate("/", { replace: true })}>
            Back to Form
          </button>
        </div>

        <div className="notice subtle" style={{ marginTop: 12 }}>
          Redirecting to halopayments.com in <b>{Math.max(secondsLeft, 0)}</b> seconds
        </div>
      </div>
    </div>
  );
}
