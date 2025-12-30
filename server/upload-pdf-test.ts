import "dotenv/config";
import fs from "fs";
import { google } from "googleapis";

async function uploadPdfTest() {
  const saPath = process.env.DRIVE_SA_PATH;
  const folderId = process.env.DRIVE_TEST_FOLDER_ID;
  const pdfPath = process.env.TEST_PDF_PATH;

  if (!saPath) throw new Error("Missing env: DRIVE_SA_PATH");
  if (!folderId) throw new Error("Missing env: DRIVE_TEST_FOLDER_ID");
  if (!pdfPath) throw new Error("Missing env: TEST_PDF_PATH");

  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF not found at ${pdfPath}`);
  }

  const creds = JSON.parse(fs.readFileSync(saPath, "utf8"));

  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  const drive = google.drive({ version: "v3", auth });

  const fileName = `sa-pdf-test-${Date.now()}.pdf`;

  const resp = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType: "application/pdf",
      body: fs.createReadStream(pdfPath),
    },
    fields: "id,name,webViewLink,driveId",
    supportsAllDrives: true,
  });

  console.log("✅ PDF uploaded successfully:");
  console.log(JSON.stringify(resp.data, null, 2));
}

uploadPdfTest().catch((err) => {
  console.error("🔥 PDF upload failed:");
  console.error(err?.response?.data || err.message || err);
  process.exit(1);
});
