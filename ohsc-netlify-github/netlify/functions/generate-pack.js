\
const JSZip = require("jszip");

function nowISO(){
  return new Date().toISOString().slice(0,10);
}

function safeName(name){
  return String(name || "PRACTICE").replace(/[^\w\-]+/g, "_").slice(0,60);
}

function resolvePOPIA(record_system){
  if(record_system === "Electronic") return "Electronic";
  if(record_system === "Both") return "Hybrid";
  return "Paper";
}

function resolveDispensing(dispensing_status){
  if(dispensing_status === "Dispensing practice") return "Dispensing";
  if(dispensing_status === "Emergency meds only") return "EmergencyOnly";
  return "NoDispensing";
}

function buildEvidenceList(data){
  const year = new Date().getFullYear();
  const list = [];

  // Governance
  list.push(["Governance", "Practice Profile", `01_GOVERNANCE/01_Practice_Profile_${year}.txt`]);
  list.push(["Governance", "Governance Policy", `01_GOVERNANCE/02_Governance_Policy_${year}.txt`]);
  list.push(["Governance", `POPIA & Confidentiality (${resolvePOPIA(data.record_system)})`, `01_GOVERNANCE/03_POPIA_${resolvePOPIA(data.record_system)}_${year}.txt`]);
  list.push(["Governance", "Patient Rights Charter", `01_GOVERNANCE/04_Patient_Rights_Charter_${year}.txt`]);
  list.push(["Governance", "Complaints SOP", `01_GOVERNANCE/05_Complaints_SOP_${year}.txt`]);
  list.push(["Governance", "Complaints Register (template)", `01_GOVERNANCE/06_Complaints_Register_${year}.txt`]);

  // IPC
  list.push(["IPC", "IPC Policy", `02_IPC/01_IPC_Policy_${year}.txt`]);
  list.push(["IPC", "Hand Hygiene SOP", `02_IPC/02_Hand_Hygiene_SOP_${year}.txt`]);
  list.push(["IPC", data.treatment_room === "Yes" ? "Cleaning SOP (High-risk)" : "Cleaning SOP (Standard)", `02_IPC/03_Cleaning_SOP_${year}.txt`]);
  list.push(["IPC", "Waste Management SOP", `02_IPC/04_Waste_Management_SOP_${year}.txt`]);
  list.push(["IPC", "Needlestick/Exposure SOP", `02_IPC/05_Needlestick_Exposure_SOP_${year}.txt`]);

  // Medicines (conditional)
  if(data.dispensing_status !== "No dispensing"){
    list.push(["Medicines", "Medicines Management Policy", `03_MEDICINES/01_Medicines_Management_Policy_${year}.txt`]);
    list.push(["Medicines", `Dispensing SOP (${resolveDispensing(data.dispensing_status)})`, `03_MEDICINES/02_Dispensing_SOP_${resolveDispensing(data.dispensing_status)}_${year}.txt`]);
    list.push(["Medicines", "Storage & Temperature SOP", `03_MEDICINES/03_Storage_Temperature_SOP_${year}.txt`]);
  }
  if(data.schedule_56 === "Yes"){
    list.push(["Medicines", "Schedule 5/6 SOP + Register", `03_MEDICINES/04_Schedule56_${year}.txt`]);
  }

  // HR (conditional)
  if(data.has_staff === "Yes"){
    list.push(["HR", "HR Policy", `04_HR/01_HR_Policy_${year}.txt`]);
    list.push(["HR", "Induction SOP", `04_HR/02_Induction_SOP_${year}.txt`]);
    list.push(["HR", "Training/CPD Policy", `04_HR/03_Training_CPD_Policy_${year}.txt`]);
    list.push(["HR", "Staff Register (template)", `04_HR/04_Staff_Register_${year}.txt`]);
    list.push(["HR", "Training Register (template)", `04_HR/05_Training_Register_${year}.txt`]);
  }

  // Safety
  list.push(["Safety", `Fire & Evacuation (${data.building_type || "Single-storey"})`, `05_SAFETY/01_Fire_Evacuation_${year}.txt`]);
  list.push(["Safety", "Disaster Management SOP", `05_SAFETY/02_Disaster_Management_SOP_${year}.txt`]);
  list.push(["Safety", "Medical Emergency SOP", `05_SAFETY/03_Medical_Emergency_SOP_${year}.txt`]);
  list.push(["Safety", "Emergency Equipment Checklist (template)", `05_SAFETY/04_Emergency_Equipment_Checklist_${year}.txt`]);
  list.push(["Safety", "Fire Equipment Register (template)", `05_SAFETY/05_Fire_Equipment_Register_${year}.txt`]);
  list.push(["Safety", "Drill Register (template)", `05_SAFETY/06_Drill_Register_${year}.txt`]);

  return list;
}

function docHeader(data){
  return [
    `Practice: ${data.practice_name || ""}`,
    `BHF: ${data.bhf_practice_number || ""}`,
    `Address: ${data.physical_address || ""}`,
    `Email: ${data.practice_email || ""}`,
    `Responsible Practitioner: ${data.practitioner_name || ""} (HPCSA: ${data.hpcsa_number || ""})`,
    `Record System: ${data.record_system || ""}`,
    `Dispensing Status: ${data.dispensing_status || ""}`,
    `Treatment Room: ${data.treatment_room || ""}`,
    `Schedule 5/6: ${data.schedule_56 || ""}`,
    `Has Staff: ${data.has_staff || ""}`,
    `Building Type: ${data.building_type || ""}`,
    `Approved by: ${data.signature_name || ""}`,
    `Date: ${data.signature_date || nowISO()}`,
    `Version: OHSC-${new Date().getFullYear()}.1`,
    ""
  ].join("\n");
}

exports.handler = async (event) => {
  try{
    const data = JSON.parse(event.body || "{}");

    // Basic validation (keep minimal for demo)
    if(!data.practice_name || !data.bhf_practice_number){
      return { statusCode: 400, body: "Missing required fields: practice_name, bhf_practice_number" };
    }

    const year = new Date().getFullYear();
    const zip = new JSZip();

    const evidence = buildEvidenceList(data);

    // Create placeholder documents
    for(const [area, evidenceName, relPath] of evidence){
      const content = docHeader(data) + `DOCUMENT: ${evidenceName}\nAREA: ${area}\n\n` +
        "This is a placeholder file generated by the demo starter.\n" +
        "Replace this with your real PDF/DOCX output in production.\n";
      zip.file(relPath, content);
    }

    // Inspection Index
    const indexLines = [];
    indexLines.push(docHeader(data));
    indexLines.push("INSPECTION INDEX (Evidence Map)");
    indexLines.push("------------------------------------------------------------");
    indexLines.push("Area | Evidence | File");
    indexLines.push("------------------------------------------------------------");
    for(const [area, evidenceName, relPath] of evidence){
      indexLines.push(`${area} | ${evidenceName} | ${relPath}`);
    }
    indexLines.push("\nNote: This demo outputs TXT placeholders. Swap with PDFs/DOCX in production.");
    zip.file(`INSPECTION_INDEX_${year}.txt`, indexLines.join("\n"));

    // Generate ZIP buffer
    const buffer = await zip.generateAsync({ type:"nodebuffer", compression:"DEFLATE", compressionOptions:{ level: 6 } });

    const filename = `OHSC_COMPLIANCE_${safeName(data.practice_name)}_${year}.zip`;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
        "X-Filename": filename
      },
      body: buffer.toString("base64"),
      isBase64Encoded: true
    };
  }catch(err){
    return { statusCode: 500, body: (err && err.stack) ? err.stack : String(err) };
  }
};
