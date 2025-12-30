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

function asBool(v: string | undefined): boolean {
  return String(v || "").toLowerCase() === "true";
}

export function driveDirectDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
}

export async function makeDriveFilePublicOrSkip(fileId: string): Promise<void> {
  // Optional: only works if domain/drive policies allow. Keep safe.
  // For SOC2/PII, I recommend NOT making public. Instead share internally.
  const auth = await getDriveAuth();
  const drive = google.drive({ version: "v3", auth });

  await drive.permissions.create({
    fileId,
    supportsAllDrives: true,
    requestBody: { type: "anyone", role: "reader" }
  });
}

async function getDriveAuth() {
  // Option A: JSON content in env (rare, but supported)
  const inline = process.env.DRIVE_SA_JSON?.trim();
  let creds: any;

  if (inline && inline.startsWith("{")) {
    creds = JSON.parse(inline);
  } else {
    // Option B: path to JSON file (recommended)
    const p = reqEnv("DRIVE_SA_PATH");
    const raw = fs.readFileSync(p, "utf8");
    creds = JSON.parse(raw);
  }

  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/drive"]
  });

  return auth;
}

async function findFolderByName(params: {
  parentId: string;
  name: string;
}) {
  const auth = await getDriveAuth();
  const drive = google.drive({ version: "v3", auth });

  const { parentId, name } = params;

  // supports shared drives
  const q =
    `mimeType='application/vnd.google-apps.folder' and ` +
    `name='${name.replace(/'/g, "\\'")}' and ` +
    `'${parentId}' in parents and trashed=false`;

  const resp = await drive.files.list({
    q,
    fields: "files(id,name)",
    pageSize: 10,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  });

  return resp.data.files?.[0] || null;
}

async function createFolder(params: {
  parentId: string;
  name: string;
}) {
  const auth = await getDriveAuth();
  const drive = google.drive({ version: "v3", auth });
  const { parentId, name } = params;

  const resp = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId]
    },
    fields: "id,name",
    supportsAllDrives: true
  });

  return resp.data;
}

async function ensureFolder(params: { parentId: string; name: string }) {
  const existing = await findFolderByName(params);
  if (existing?.id) return existing.id;
  const created = await createFolder(params);
  if (!created?.id) throw new Error(`Failed to create folder: ${params.name}`);
  return created.id;
}

export async function uploadMergedPdfToDrive(params: {
  appId: string;
  mergedPdfBuffer: Buffer;
  filename: string; // final pdf name
}): Promise<{ skipped?: boolean; fileId?: string; webViewLink?: string }> {
  // If you want to disable drive easily
  if (asBool(process.env.DRIVE_DISABLE)) return { skipped: true };

  const auth = await getDriveAuth();
  const drive = google.drive({ version: "v3", auth });

  const rootFolderId = process.env.DRIVE_ROOT_FOLDER_ID || "root";
  const now = new Date();
  const year = String(now.getFullYear());
  const month = monthLabel(now); // Dec, Jan, ...

  // Ensure Year/Month folders
  let yearId: string;
  let monthId: string;

  try {
    yearId = await ensureFolder({ parentId: rootFolderId, name: year });
  } catch (e) {
    throw new Error(
      `Drive year folder failed (root=${rootFolderId}). ` +
      `Make sure service account has access. ` +
      `Original: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  monthId = await ensureFolder({ parentId: yearId, name: month });

  // Upload file
  const resp = await drive.files.create({
    requestBody: {
      name: params.filename,
      parents: [monthId]
    },
    media: {
      mimeType: "application/pdf",
      body: BufferToStream(params.mergedPdfBuffer)
    },
    fields: "id, webViewLink",
    supportsAllDrives: true
  });

  return {
    fileId: resp.data.id || undefined,
    webViewLink: resp.data.webViewLink || undefined
  };
}

// tiny helper to stream buffer
import { Readable } from "stream";
function BufferToStream(buf: Buffer): Readable {
  const r = new Readable();
  r.push(buf);
  r.push(null);
  return r;
}


