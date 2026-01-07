
const JSZip = require("jszip");
const PDFDocument = require("pdfkit");

function yearNow(){ return new Date().getFullYear(); }
function safeName(name){ return String(name||"PRACTICE").replace(/[^\w\-]+/g,"_").slice(0,60); }

function toStr(v){ return (v===undefined||v===null) ? "" : String(v).trim(); }

function docMeta(data){
  const y = yearNow();
  return {
    version: `OHSC-${y}.1`,
    effective: `01 January ${y}`,
    review: `31 December ${y}`,
    generated: new Date().toISOString().slice(0,10),
  };
}

function headerLines(data, meta){
  return [
    `Practice: ${toStr(data.practice_name)}`,
    `Practice No: ${toStr(data.practice_number)}`,
    `Physical Address: ${toStr(data.physical_address)}`,
    `Postal Address: ${toStr(data.postal_address)}`,
    `Contact: ${toStr(data.contact_number)}   Email: ${toStr(data.practice_email)}`,
    `Operating hours: ${toStr(data.operating_hours)}`,
    `After-hours: ${toStr(data.after_hours)}`,
    `Responsible practitioner: ${toStr(data.practitioner_name)} (HPCSA: ${toStr(data.hpcsa_number)})`,
    `Qualification: ${toStr(data.qualification)}   Scope: ${toStr(data.scope)}`,
    `Practice type: ${toStr(data.practice_type)}   Records: ${toStr(data.records)}`,
    `Version: ${meta.version}   Effective: ${meta.effective}   Review: ${meta.review}`,
  ];
}

function pdfFromLines(title, lines, data){
  const meta = docMeta(data);
  return new Promise((resolve, reject) => {
    try{
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const chunks = [];
      doc.on("data", (d)=>chunks.push(d));
      doc.on("end", ()=>resolve(Buffer.concat(chunks)));

      doc.fontSize(18).text(toStr(data.practice_name) || "Practice", { align: "left" });
      doc.moveDown(0.2);
      doc.fontSize(11).fillColor("#444").text(`Generated: ${meta.generated}`, { align: "left" });
      doc.fillColor("black");
      doc.moveDown(0.6);

      doc.fontSize(16).text(title);
      doc.moveDown(0.5);

      doc.fontSize(10);
      headerLines(data, meta).forEach(l => doc.text(l));
      doc.moveDown(0.8);

      doc.fontSize(11);
      lines.forEach(l => {
        if(l === "---"){ doc.moveDown(0.4); doc.moveTo(doc.x, doc.y).lineTo(545, doc.y).strokeColor("#ccc").stroke(); doc.moveDown(0.4); doc.strokeColor("black"); }
        else doc.text(l, { align: "left" });
      });

      doc.moveDown(1.2);
      doc.fontSize(10).fillColor("#444").text(`Approved by: ${toStr(data.signature_name)}`, { align: "left" });
      doc.end();
    }catch(e){ reject(e); }
  });
}

function registerPdf(title, headers, data){
  const meta = docMeta(data);
  return new Promise((resolve, reject) => {
    try{
      const doc = new PDFDocument({ size:"A4", margin:50 });
      const chunks=[];
      doc.on("data",(d)=>chunks.push(d));
      doc.on("end",()=>resolve(Buffer.concat(chunks)));

      doc.fontSize(18).text(toStr(data.practice_name) || "Practice");
      doc.moveDown(0.4);
      doc.fontSize(16).text(title);
      doc.moveDown(0.6);

      doc.fontSize(9).fillColor("#444").text(`Version: ${meta.version} | Effective: ${meta.effective} | Review: ${meta.review}`);
      doc.fillColor("black");
      doc.moveDown(0.6);

      // Simple table-like layout (no external table libs)
      const startX = doc.x;
      const startY = doc.y;
      const colCount = headers.length;
      const colWidth = (545 - startX) / colCount;

      doc.fontSize(9).font("Helvetica-Bold");
      headers.forEach((h, i)=>{
        doc.text(h, startX + i*colWidth, startY, { width: colWidth-2 });
      });
      doc.font("Helvetica").moveDown(1.2);

      let y = startY + 18;
      doc.lineWidth(0.5).strokeColor("#bbb");
      doc.moveTo(startX, y).lineTo(545, y).stroke();
      y += 6;

      for(let r=0; r<18; r++){
        headers.forEach((_, i)=>{
          doc.text("__________________", startX + i*colWidth, y, { width: colWidth-2 });
        });
        y += 18;
        if(y > 760){
          doc.addPage();
          y = 60;
        }
      }

      doc.moveDown(2);
      doc.fontSize(10).fillColor("#444").text(`Approved by: ${toStr(data.signature_name)}`);
      doc.end();
    }catch(e){ reject(e); }
  });
}

exports.handler = async (event) => {
  try{
    const data = JSON.parse(event.body || "{}");
    // Minimal required fields
    const required = ["practice_name","practice_number","physical_address","postal_address","contact_number","operating_hours","after_hours","practitioner_name","hpcsa_number","practice_type","records","signature_name","building_type","has_staff","schedule_56"];
    for(const k of required){
      if(!toStr(data[k])) return { statusCode: 400, body: `Missing required field: ${k}` };
    }

    const zip = new JSZip();
    const y = yearNow();
    const practiceSlug = safeName(data.practice_name);

    // Determine conditionals
    const dispensing = /dispens/i.test(toStr(data.practice_type));
    const sched56 = toStr(data.schedule_56).toLowerCase() === "yes";
    const hasStaff = toStr(data.has_staff).toLowerCase() === "yes";

    const docs = [];

    // Pack 1 Governance (detailed) + additions
    docs.push({folder:"01_GOVERNANCE", file:`01_Practice_Profile_${y}.pdf`, title:"Practice Profile", type:"text", lines:[
      "1. Practice overview", 
      "This practice provides primary healthcare services within its scope and applicable SA legislation.",
      "2. Services offered",
      "General medical consultations; preventive care and screening; chronic disease management; minor procedures.",
      "3. Governance structure",
      "Clinical and operational governance rests with the responsible practitioner; policies are reviewed annually.",
      "---",
      "Operating hours and access to care are documented above. After-hours access is provided as stated."
    ]});
    docs.push({folder:"01_GOVERNANCE", file:`02_Governance_Accountability_Policy_${y}.pdf`, title:"Governance & Accountability Policy", type:"text", lines:[
      "Purpose: Define governance structures, accountability and quality oversight.",
      "Leadership: Responsible practitioner ensures compliance with OHSC standards and professional rules.",
      "Risk management: Identify, document and mitigate clinical/operational risks; record incidents and corrective actions.",
      "Quality improvement: Use audits, complaints, incident reviews, and feedback to improve service quality."
    ]});
    docs.push({folder:"01_GOVERNANCE", file:`03_POPIA_Confidentiality_Policy_${y}.pdf`, title:"Confidentiality & POPIA Policy", type:"text", lines:[
      "Patient information is confidential and protected in line with POPIA and ethical duties.",
      "Records: secure electronic access controls; secure paper filing; controlled retrieval and return.",
      "Access: role-based, authorised staff only; disclosure only where lawful and necessary.",
      "Breach management: report, investigate, mitigate, and document incidents; notify as required."
    ]});
    docs.push({folder:"01_GOVERNANCE", file:`04_Patient_Rights_Charter_${y}.pdf`, title:"Patient Rights Charter", type:"text", lines:[
      "Patients have the right to access care without discrimination, to dignity, privacy and confidentiality.",
      "Patients have the right to information, participation in decisions, and informed consent.",
      "Patients may provide feedback or lodge complaints without fear of prejudice."
    ]});
    docs.push({folder:"01_GOVERNANCE", file:`05_Complaints_Management_SOP_${y}.pdf`, title:"Complaints Management SOP", type:"text", lines:[
      "Complaints can be submitted verbally or in writing.",
      "Record all complaints in the complaints register; acknowledge receipt; investigate; respond with outcome and corrective actions.",
      "Review trends periodically to improve service quality."
    ]});
    docs.push({folder:"01_GOVERNANCE", file:`06_Complaints_Register_${y}.pdf`, title:"Complaints Register", type:"register",
      headers:["Date","Patient (optional)","Complaint","Action Taken","Outcome","Responsible","Signature"]});
    docs.push({folder:"01_GOVERNANCE", file:`07_Incident_NearMiss_Register_${y}.pdf`, title:"Incident & Near Miss Register", type:"register",
      headers:["Date","Incident","Person","Immediate Action","Follow-up","Reported By","Signature"]});
    docs.push({folder:"01_GOVERNANCE", file:`08_Declaration_of_Compliance_${y}.pdf`, title:"Declaration of Compliance", type:"text", lines:[
      "I declare that the practice implements policies, SOPs and registers aligned to OHSC norms and standards.",
      "Documents are reviewed at least annually and updated as required.",
      "This declaration is provided for inspection and governance purposes."
    ]});

    // Pack 2 IPC (policies + registers)
    docs.push({folder:"02_IPC", file:`01_IPC_Policy_${y}.pdf`, title:"Infection Prevention & Control Policy", type:"text", lines:[
      "Standard precautions apply to all patients at all times.",
      "Transmission-based precautions are applied when indicated.",
      "IPC training is conducted and recorded; exposure incidents are documented and followed up."
    ]});
    docs.push({folder:"02_IPC", file:`02_Hand_Hygiene_SOP_${y}.pdf`, title:"Hand Hygiene SOP", type:"text", lines:[
      "Perform hand hygiene before and after patient contact and after contact with potentially contaminated surfaces.",
      "Use alcohol-based hand rub when hands are not visibly soiled; use soap and water when visibly soiled.",
      "Maintain hand hygiene supplies and monitor compliance."
    ]});
    docs.push({folder:"02_IPC", file:`03_Cleaning_Disinfection_SOP_${y}.pdf`, title:"Cleaning & Disinfection SOP", type:"text", lines:[
      "Clean all areas according to a schedule; increase frequency for high-touch surfaces.",
      "Use approved disinfectants according to manufacturer instructions.",
      "Document completion in the cleaning register."
    ]});
    docs.push({folder:"02_IPC", file:`04_Waste_Management_SOP_${y}.pdf`, title:"Healthcare Risk Waste Management SOP", type:"text", lines:[
      "Segregate waste at point of generation; use approved sharps containers; store waste securely.",
      "Arrange collection by an approved service provider and maintain records.",
      "Document incidents/spills and corrective actions."
    ]});
    docs.push({folder:"02_IPC", file:`05_Needlestick_Exposure_SOP_${y}.pdf`, title:"Needlestick & Occupational Exposure SOP", type:"text", lines:[
      "Treat exposures as urgent; provide immediate first aid; report promptly; document and arrange follow-up.",
      "Record incidents in the exposure register and review for prevention."
    ]});
    docs.push({folder:"02_IPC", file:`06_Cleaning_Register_${y}.pdf`, title:"Cleaning & Disinfection Register", type:"register",
      headers:["Date","Area","Frequency","Disinfectant","Responsible","Signature"]});
    docs.push({folder:"02_IPC", file:`07_Waste_Register_${y}.pdf`, title:"Healthcare Risk Waste Register", type:"register",
      headers:["Date","Waste Type","Container ID","Fill Level","Action","Collected By","Signature"]});
    docs.push({folder:"02_IPC", file:`08_Sharps_Log_${y}.pdf`, title:"Sharps Container Monitoring Log", type:"register",
      headers:["Date","Location","Container No","Fill Level","Replaced (Y/N)","Signature"]});
    docs.push({folder:"02_IPC", file:`09_Exposure_Register_${y}.pdf`, title:"Occupational Exposure Register", type:"register",
      headers:["Date","Staff","Exposure Type","Immediate Action","Follow-up","Signature"]});
    docs.push({folder:"02_IPC", file:`10_IPC_Training_Register_${y}.pdf`, title:"IPC Training Register", type:"register",
      headers:["Staff","Role","Topic","Date","Trainer","Signature"]});

    // Pack 3 Medicines (conditional on dispensing; schedule56)
    docs.push({folder:"03_MEDICINES", file:`01_Medicines_Management_Policy_${y}.pdf`, title:"Medicines Management Policy", type:"text", lines:[
      "Medicines are procured from licensed suppliers and stored securely.",
      "Stock is monitored for expiry, batch and storage conditions; discrepancies are investigated.",
      "Dispensing, where applicable, includes counselling, labeling and documentation."
    ]});
    if(dispensing){
      docs.push({folder:"03_MEDICINES", file:`02_Dispensing_SOP_${y}.pdf`, title:"Dispensing SOP", type:"text", lines:[
        "Dispensing is performed by authorised personnel under practitioner oversight.",
        "Provide counselling on dose, administration, storage and side effects.",
        "Maintain records and ensure safe labeling and patient understanding."
      ]});
      docs.push({folder:"03_MEDICINES", file:`03_Storage_Temperature_SOP_${y}.pdf`, title:"Storage & Temperature Control SOP", type:"text", lines:[
        "Maintain secure storage areas; monitor medicine fridge temperatures daily.",
        "Remove expired/damaged stock immediately and document action."
      ]});
      docs.push({folder:"03_MEDICINES", file:`04_Stock_Register_${y}.pdf`, title:"Medicine Stock Register", type:"register",
        headers:["Date","Medicine","Batch","Expiry","Qty In","Qty Out","Balance","Signature"]});
      docs.push({folder:"03_MEDICINES", file:`05_Fridge_Temp_Log_${y}.pdf`, title:"Fridge Temperature Log", type:"register",
        headers:["Date","AM Temp (°C)","PM Temp (°C)","Action if out of range","Signature"]});
      docs.push({folder:"03_MEDICINES", file:`06_ADR_Register_${y}.pdf`, title:"Adverse Drug Reaction Register", type:"register",
        headers:["Date","Patient (Initials)","Medicine","Reaction","Action","Reported To","Signature"]});
    }
    if(sched56){
      docs.push({folder:"03_MEDICINES", file:`07_Schedule56_SOP_${y}.pdf`, title:"Schedule 5 & 6 Medicines SOP", type:"text", lines:[
        "Schedule 5/6 medicines are stored with restricted access; balances are checked and documented.",
        "Maintain accurate records for receipt, dispensing and reconciliation; investigate discrepancies."
      ]});
      docs.push({folder:"03_MEDICINES", file:`08_Schedule56_Register_${y}.pdf`, title:"Schedule 5 & 6 Medicines Register", type:"register",
        headers:["Date","Medicine","Patient","Quantity","Balance","Prescriber","Signature"]});
    }

    // Pack 4 HR (conditional on hasStaff)
    docs.push({folder:"04_HR", file:`01_HR_Policy_${y}.pdf`, title:"Human Resources Policy", type:"text", lines:[
      "Recruitment and employment are fair and lawful; roles and responsibilities are defined.",
      "Confidentiality and professionalism are mandatory; misconduct is managed through clear procedures."
    ]});
    docs.push({folder:"04_HR", file:`02_Code_of_Conduct_${y}.pdf`, title:"Staff Code of Conduct", type:"text", lines:[
      "Staff must treat patients with dignity and respect; maintain confidentiality; follow IPC and safety procedures."
    ]});
    if(hasStaff){
      docs.push({folder:"04_HR", file:`03_Induction_SOP_${y}.pdf`, title:"Staff Induction SOP", type:"text", lines:[
        "Induction covers IPC, emergency procedures, confidentiality and practice workflows; completion is documented."
      ]});
      docs.push({folder:"04_HR", file:`04_Training_CPD_Policy_${y}.pdf`, title:"Training & CPD Policy", type:"text", lines:[
        "Training needs are identified and recorded; CPD is maintained where applicable."
      ]});
      docs.push({folder:"04_HR", file:`05_Staff_Register_${y}.pdf`, title:"Staff Register", type:"register",
        headers:["Staff Name","Role","Start Date","Qualifications","Reg No","Signature"]});
      docs.push({folder:"04_HR", file:`06_Training_Register_${y}.pdf`, title:"Training & CPD Register", type:"register",
        headers:["Staff Name","Topic","Date","Provider","CPD Points","Signature"]});
      docs.push({folder:"04_HR", file:`07_Induction_Checklist_${y}.pdf`, title:"Induction Checklist", type:"register",
        headers:["Staff Name","Induction Item","Completed (Y/N)","Date","Signature"]});
    }

    // Pack 5 Safety
    docs.push({folder:"05_SAFETY", file:`01_Fire_Evacuation_Policy_${y}.pdf`, title:"Fire & Evacuation Policy", type:"text", lines:[
      `Building type: ${toStr(data.building_type)}.`,
      "Fire equipment is maintained; evacuation routes are displayed; drills are conducted and recorded."
    ]});
    docs.push({folder:"05_SAFETY", file:`02_Disaster_Management_SOP_${y}.pdf`, title:"Emergency & Disaster Management SOP", type:"text", lines:[
      "Prepare for emergencies; define roles; maintain emergency contacts; document incidents and lessons learned."
    ]});
    docs.push({folder:"05_SAFETY", file:`03_Medical_Emergency_Response_SOP_${y}.pdf`, title:"Medical Emergency Response SOP", type:"text", lines:[
      "Maintain appropriate emergency equipment and ensure staff know response steps and escalation pathways."
    ]});
    docs.push({folder:"05_SAFETY", file:`04_OHS_Policy_${y}.pdf`, title:"Occupational Health & Safety Policy", type:"text", lines:[
      "Identify hazards, implement controls and encourage reporting; maintain a safe work environment."
    ]});
    docs.push({folder:"05_SAFETY", file:`05_Fire_Equipment_Register_${y}.pdf`, title:"Fire Equipment Register", type:"register",
      headers:["Date","Equipment Type","Location","Condition","Action","Signature"]});
    docs.push({folder:"05_SAFETY", file:`06_Emergency_Equipment_Checklist_${y}.pdf`, title:"Emergency Equipment Checklist", type:"register",
      headers:["Date","Item","Available (Y/N)","Condition","Checked By","Signature"]});
    docs.push({folder:"05_SAFETY", file:`07_Drill_Register_${y}.pdf`, title:"Evacuation & Drill Register", type:"register",
      headers:["Date","Drill Type","Participants","Outcome","Corrective Action","Signature"]});

    // Document Control + Master Inspection Index
    const meta = docMeta(data);
    const controlBuf = await pdfFromLines("Document Control (Master Pack)", [
      "This page demonstrates annual review/version control for your compliance file.",
      `Version: ${meta.version}`,
      `Effective date: ${meta.effective}`,
      `Review date: ${meta.review}`,
      "---",
      "For annual renewal, regenerate this master pack and increment the year/version (e.g., OHSC-2027.1)."
    ], data);
    zip.file(`DOCUMENT_CONTROL_${y}.pdf`, controlBuf);

    // Create all PDFs
    const indexRows = [];
    for(const d of docs){
      if(d.type === "register"){
        const buf = await registerPdf(d.title, d.headers, data);
        zip.file(`${d.folder}/${d.file}`, buf);
      }else{
        const buf = await pdfFromLines(d.title, d.lines, data);
        zip.file(`${d.folder}/${d.file}`, buf);
      }
      indexRows.push(`${d.folder} | ${d.title} | ${d.folder}/${d.file}`);
    }

    const indexBuf = await pdfFromLines("Master Inspection Index (Packs 1–5)", [
      "Use this index during inspection to quickly locate evidence in the folder structure.",
      "---",
      "Folder | Document | Path",
      ...indexRows
    ], data);
    zip.file(`INSPECTION_INDEX_Master_${y}.pdf`, indexBuf);

    const out = await zip.generateAsync({ type:"nodebuffer", compression:"DEFLATE", compressionOptions:{ level: 6 } });
    const filename = `OHSC_MasterPack_${practiceSlug}_${y}.zip`;

    return {
      statusCode: 200,
      headers: {
        "Content-Type":"application/zip",
        "Content-Disposition":`attachment; filename="${filename}"`,
        "Cache-Control":"no-store",
        "X-Filename": filename,
        "Access-Control-Allow-Origin":"*"
      },
      body: out.toString("base64"),
      isBase64Encoded: true
    };
  }catch(err){
    return { statusCode: 500, body: (err && err.stack) ? err.stack : String(err) };
  }
};
