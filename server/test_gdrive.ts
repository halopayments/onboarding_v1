import fs from "fs";
import { google } from "googleapis";

import "dotenv/config";


async function testDriveAuth() {
  const creds = JSON.parse(
    fs.readFileSync(process.env.DRIVE_SA_PATH!, "utf8")
  );

  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  const drive = google.drive({ version: "v3", auth });

  console.log("🔐 Auth created");

  // 1) Who am I?
  const about = await drive.about.get({
    fields: "user(emailAddress,permissionId)",
  });

  console.log("👤 Auth identity:", about.data.user);

  // 2) Fetch test folder metadata
  const folderId = process.env.DRIVE_TEST_FOLDER_ID!;
  const meta = await drive.files.get({
    fileId: folderId,
    fields: "id,name,mimeType,driveId,parents,capabilities",
    supportsAllDrives: true,
  });

  console.log("📁 Folder metadata:");
  console.log(JSON.stringify(meta.data, null, 2));

  // 3) Validate shared drive
  if (!meta.data.driveId) {
    throw new Error("❌ Folder is NOT in a Shared Drive (driveId missing)");
  }

  if (!meta.data.capabilities?.canAddChildren) {
    throw new Error("❌ Service account cannot create files in this folder");
  }

  console.log("✅ Auth + Shared Drive access looks GOOD");
}

testDriveAuth().catch((err) => {
  console.error("🔥 Test failed:");
  console.error(err?.response?.data || err.message || err);
  process.exit(1);
});
