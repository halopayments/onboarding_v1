const fs = require("fs");
const path = require("path");

// IMPORTANT: adjust path if your server file is named differently
const { generateApplicationPdfBuffer } = require("../server.cjs");

(async () => {
  const sampleForm = {
    legalBusinessName: "AAA INC",
    dbaName: "AAA Store",
    businessEstablishedDate: "2020-01-15",
    taxpayerId: "123456789",
    businessPhone: "5080000000",
    businessEmail: "test@example.com",
    businessWebsite: "https://example.com",
    fnsNumber: "FNS123456",

    physicalStreet: "123 North Main Street",
    physicalUnit: "Apt 1",
    physicalCity: "North Quincy",
    physicalState: "MA",
    physicalZip: "02171",

    businessStreet: "123 North Main Street",
    businessUnit: "Apt 1",
    businessCity: "North Quincy",
    businessState: "MA",
    businessZip: "02171",

    ownerFirstName: "Connor",
    ownerLastName: "Sample",
    ownerTitle: "Owner",
    ownerOwnershipPct: "99",
    dob: "1959-01-12",
    ownerSsn: "999880000",
    ownerHomePhone: "5080000000",

    principalAddressStreet: "123 North Main Street",
    principalAddressUnit: "Apt 2",
    principalAddressCity: "North Quincy",
    principalAddressState: "MA",
    principalAddressZip: "02171",

    idNumber: "S99988801",
    dlState: "MA",
    idExp: "2026-01-12",
    contactEmail: "test@email.com",
    contactPhone: "5080000000",

    bankName: "TRUE NORTH FEDERAL CREDIT UNION",
    routingNumber: "123456789",
    accountNumber: "00007890",

    // ✅ new additional fields
    ccTerminal: "Ingenico iCT250",
    encryption: "WF-350",
    gasStationPos: "PetrotechPOS",
    pricing: "$0.10/gal",
    installationDate: "2025-01-15",
    otherFleetCards: "WEX",

    otherNotes: "Preferred contact time: 9 AM - 5 PM EST",

    signatureName: "Connor Sample",
    signatureDate: "2025-12-24"
    // signatureImageDataUrl optional
  };

  const appId = "20251224-00001";
  const buf = await generateApplicationPdfBuffer(sampleForm, appId);

  const outDir = path.join(__dirname, "..", "out");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  const outPath = path.join(outDir, "application-modern.pdf");
  fs.writeFileSync(outPath, buf);

  console.log("✅ PDF written to:", outPath);
})();
