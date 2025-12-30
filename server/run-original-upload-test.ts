import "dotenv/config";
import fs from "fs";
import path from "path";
import { uploadMergedPdfToDrive } from "./cloudstorage"; // <-- adjust

console.log("[drive] DRIVE_DISABLE:", process.env.DRIVE_DISABLE);
console.log("[drive] using DRIVE_ROOT_FOLDER_ID:", process.env.DRIVE_ROOT_FOLDER_ID);
console.log("[drive] rootFolderId resolved:", process.env.DRIVE_ROOT_FOLDER_ID || "root");
console.log("[drive] using creds source:", process.env.DRIVE_SA_JSON ? "DRIVE_SA_JSON" : "DRIVE_SA_PATH");


async function main() {
  // load any PDF from disk to mimic your real buffer
  const pdfPath = process.env.TEST_PDF_PATH || "./test.pdf";
  const buf = fs.readFileSync(pdfPath);

  const out = await uploadMergedPdfToDrive({
    appId: "debug-test",
    mergedPdfBuffer: buf,
    filename: `original-script-test-${Date.now()}.pdf`,
  });

  console.log("RESULT:", out);
}

main().catch((e) => {
  console.error("FAILED:", e?.message || e);
  console.error(e?.stack || "");
  process.exit(1);
});
