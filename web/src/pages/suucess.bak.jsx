

// export default function Success() {
//   const [params] = useSearchParams();
//   const appId = params.get("appId");

//   return (
//     <div className="container">
//       <h1>✅ Application Received</h1>
//       <p>Your application has been successfully submitted.</p>

//       {appId && (
//         <div className="card">
//           <strong>Application ID:</strong>
//           <div>{appId}</div>
//         </div>
//       )}

//       <a className="btn btnPrimary" href="/">
//         Submit another application
//       </a>
//     </div>
//   );
// }

import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

export default function Success() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  const params = new URLSearchParams(window.location.search);
  const appId = params.get("appId") || "";

  useEffect(() => {
    if (!appId) return;
    (async () => {
      try {
        const r = await fetch(`/api/submission/${encodeURIComponent(appId)}`);
        const j = await r.json();
        if (!r.ok || !j.success) throw new Error(j.error || "Failed to load submission");
        setData(j);
      } catch (e) {
        setErr(e.message || "Error");
      }
    })();
  }, [appId]);

  if (!appId) {
    return (
      <div className="card">
        <h2>Missing Application ID</h2>
        <p>Please return and submit the application again.</p>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card">
        <div className="successTitle">✅ Application Submitted</div>
        <div className="muted">Application ID</div>
        <div className="appId">{appId}</div>

        {err && <div className="errorBox">{err}</div>}

        {data && (
          <div className="details">
            <div><b>Business:</b> {data.businessName || "-"}</div>
            <div><b>Owner:</b> {data.ownerName || "-"}</div>
            <div><b>Created:</b> {data.createdAt || "-"}</div>
          </div>
        )}

        <div className="btnRow" style={{ marginTop: 14 }}>
          <a
            className="btn btnPrimary"
            href={`/api/submission/${encodeURIComponent(appId)}/pdf`}
            target="_blank"
            rel="noreferrer"
          >
            Download PDF
          </a>
          <br></br>

          <button className="btn btnGhost" onClick={() => (window.location.href = "/")}>
            Start New Application
          </button>
        </div>

        {/* <div className="muted" style={{ marginTop: 12 }}>
          The downloaded file is the single merged PDF in this order:
          Application form → Photo ID → Voided check/bank letter → W-9.
        </div> */}
      </div>
    </div>
  );
}

