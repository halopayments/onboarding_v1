import "dotenv/config";
import fs from "fs";
import { google } from "googleapis";

function reqEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function monthLabel(d: Date): string {
  return d.toLocaleString("en-US", { month: "short" }); // Jan, Feb, ...
}

async function getDriveAuth() {
  const p = reqEnv("DRIVE_SA_PATH");
  const creds = JSON.parse(fs.readFileSync(p, "utf8"));

  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
}

async function assertSharedDriveFolder(drive: any, folderId: string) {
  const meta = await drive.files.get({
    fileId: folderId,
    fields: "id,name,mimeType,driveId,capabilities",
    supportsAllDrives: true,
  });

  console.log("Root folder meta:", meta.data);

  if (meta.data.mimeType !== "application/vnd.google-apps.folder") {
    throw new Error(`DRIVE_ROOT_FOLDER_ID is not a folder: ${folderId}`);
  }
  if (!meta.data.driveId) {
    throw new Error(`Root folder is NOT in a Shared Drive (driveId missing).`);
  }
  if (!meta.data.capabilities?.canAddChildren) {
    throw new Error(`Service account can't create children in root folder.`);
  }

  return meta.data.driveId as string;
}

async function findFolderByName(drive: any, parentId: string, name: string) {
  // escape single quotes for query
  const safeName = name.replace(/'/g, "\\'");

  const q =
    `mimeType='application/vnd.google-apps.folder' and ` +
    `name='${safeName}' and ` +
    `'${parentId}' in parents and trashed=false`;

  const resp = await drive.files.list({
    q,
    fields: "files(id,name,webViewLink)",
    pageSize: 10,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  return resp.data.files?.[0] || null;
}

async function createFolder(drive: any, parentId: string, name: string) {
  const resp = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id,name,webViewLink",
    supportsAllDrives: true,
  });

  return resp.data;
}

async function ensureFolder(drive: any, parentId: string, name: string) {
  const existing = await findFolderByName(drive, parentId, name);
  if (existing?.id) {
    console.log(`Found folder "${name}" -> ${existing.id}`);
    return existing.id;
  }
  const created = await createFolder(drive, parentId, name);
  if (!created?.id) throw new Error(`Failed to create folder: ${name}`);
  console.log(`Created folder "${name}" -> ${created.id}`);
  return created.id;
}

async function main() {
  const auth = await getDriveAuth();
  const drive = google.drive({ version: "v3", auth });

  const rootFolderId = reqEnv("DRIVE_ROOT_FOLDER_ID");
  await assertSharedDriveFolder(drive, rootFolderId);

  const now = new Date();
  const year = String(now.getFullYear());
  const month = monthLabel(now);

  console.log(`Ensuring year folder: ${year}`);
  const yearId = await ensureFolder(drive, rootFolderId, year);

  console.log(`Ensuring month folder: ${month}`);
  const monthId = await ensureFolder(drive, yearId, month);

  // Fetch links for convenience
  const yearMeta = await drive.files.get({
    fileId: yearId,
    fields: "id,name,webViewLink,driveId",
    supportsAllDrives: true,
  });
  const monthMeta = await drive.files.get({
    fileId: monthId,
    fields: "id,name,webViewLink,driveId",
    supportsAllDrives: true,
  });

  console.log("✅ Done");
  console.log("Year:", yearMeta.data);
  console.log("Month:", monthMeta.data);
}

main().catch((err) => {
  console.error("🔥 Folder test failed:");
  console.error(err?.response?.data || err.message || err);
  process.exit(1);
});
