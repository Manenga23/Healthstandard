
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


function applyTokens(lines, data){
  const map = {
    practice_name: toStr(data.practice_name),
    practice_no: toStr(data.practice_number),
    physical_address: toStr(data.physical_address),
    postal_address: toStr(data.postal_address),
    contact_number: toStr(data.contact_number),
    operating_hours: toStr(data.operating_hours),
    responsible_practitioner: toStr(data.responsible_practitioner),
    hpcsa_number: toStr(data.hpcsa_number),
    signature_name: toStr(data.signature_name),
    signature_date: toStr(data.signature_date),
  };
  return (lines || []).map(l => {
    if(typeof l !== "string") return l;
    return l.replace(/\{\{(practice_name|practice_no|physical_address|postal_address|contact_number|operating_hours|responsible_practitioner|hpcsa_number|signature_name|signature_date)\}\}/g,
      (_,k)=>map[k] || "");
  });
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
      applyTokens(lines, data).forEach(l => {
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
    const selectedPack = String(data.selected_pack || "MASTER").toUpperCase(); // PACK1..PACK6 or MASTER
    const mode = selectedPack === "MASTER" ? "MASTER" : "SINGLE";

    function want(packCode){
      if(mode === "MASTER") return true;
      return selectedPack === packCode;
    }

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


    // Pack 1 Governance (DETAILED)
    if(want("PACK1")){
    docs.push({folder:"01_GOVERNANCE", file:`01_Practice_Profile_2026.pdf`, title:"Practice Profile (Detailed)", type:"text", lines:[
      "1. PRACTICE OVERVIEW",
      "This document describes the practice profile for inspection and governance purposes.",
      "- Practice name: {{practice_name}}",
      "- Practice number: {{practice_no}}",
      "- Physical address: {{physical_address}}",
      "- Postal address: {{postal_address}}",
      "- Contact: {{contact_number}}",
      "- Operating hours: {{operating_hours}}",
      "- After-hours: Telemedicine via website/myCG (if applicable)",
      "---",
      "2. SCOPE OF SERVICES (GP)",
      "- Acute care: minor illnesses/injuries and short-term conditions",
      "- Chronic disease management: hypertension, diabetes, asthma/COPD, HIV/TB support (as applicable)",
      "- Preventive care: screening, immunisation advice, lifestyle counselling",
      "- Minor procedures: wound care, injections, suturing (as applicable)",
      "- Dispensing: per practice status and authorisation",
      "---",
      "3. PRACTICE TYPE & RECORDS",
      "- Practice type: Consulting and/or Dispensing (selected in intake form)",
      "- Records: Electronic and/or Paper (selected in intake form)",
      "- Confidentiality and POPIA controls are implemented for both record types.",
      "---",
      "4. GOVERNANCE & ACCOUNTABILITY",
      "- Responsible practitioner/manager: {{responsible_practitioner}} (HPCSA: {{hpcsa_number}})",
      "- Staff roles: admin/assistant/nurse (if applicable)",
      "- Policies and SOPs are reviewed annually and after major incidents.",
      "---",
      "5. PATIENT ACCESS, COMMUNICATION & CONTINUITY",
      "- Appointments and walk-ins: per practice workflow",
      "- Emergency escalation: call EMS when clinically indicated",
      "- Referrals: documented and followed up",
      "- Patient education: provided verbally and/or in print/digital form",
      "---",
      "6. FACILITY DESCRIPTION (SUMMARY)",
      "- Waiting area, consultation room(s), treatment area (if applicable)",
      "- Cleaning and waste routes defined",
      "- Fire safety equipment and evacuation route displayed",
      "---",
      "7. DOCUMENT CONTROL",
      "- Version: OHSC-2026.1",
      "- Effective date: 01 January 2026",
      "- Review date: 31 December 2026",
      "- Approved by: {{signature_name}}",
    ] });
    docs.push({folder:"01_GOVERNANCE", file:`02_Governance_Accountability_2026.pdf`, title:"Governance & Accountability Policy (Detailed)", type:"text", lines:[
      "PURPOSE",
      "To define leadership, accountability, decision-making, and quality oversight within the practice.",
      "---",
      "SCOPE",
      "Applies to all practice activities including clinical care, administration, medicines, IPC, and safety.",
      "---",
      "RESPONSIBILITIES",
      "- Responsible Practitioner/Manager: overall accountability, policy approval, incident review.",
      "- All staff: comply with policies, report incidents and risks, participate in training.",
      "- Contractors/service providers: comply with site rules (waste, cleaning, maintenance).",
      "---",
      "PROCEDURE (STEP-BY-STEP)",
      "1. Maintain an up-to-date compliance file (policies, SOPs, registers, inspection index).",
      "2. Identify key risks (clinical, IPC, medicines, safety, POPIA) and document controls.",
      "3. Hold a minimum quarterly internal review (or monthly if high volume) covering: complaints, incidents, stock issues, IPC issues.",
      "4. Record decisions and corrective actions in an action log; assign responsible person and due date.",
      "5. Ensure staff induction and refresher training; keep training evidence.",
      "6. Conduct spot checks: hand hygiene supplies, waste segregation, fridge temps (if applicable), fire equipment.",
      "7. Escalate\u91cd\u5927 risks immediately (e.g., sharps injury, fridge failure, data breach, fire hazard).",
      "8. Review this policy annually and after any serious incident or inspection finding.",
      "---",
      "RECORDS / FORMS / EVIDENCE",
      "- Inspection index; action log; complaints register; incident/near-miss register; training register; audit checklists.",
      "---",
      "MONITORING, AUDIT & REVIEW",
      "- Documented internal review and corrective actions completed, tracked, and signed off by the responsible practitioner.",
      "---",
      "REFERENCES",
      "- OHSC norms/standards guidance; HPCSA ethical rules; POPIA requirements; applicable medicines/occupational health laws.",
    ] });
    docs.push({folder:"01_GOVERNANCE", file:`03_POPIA_Confidentiality_2026.pdf`, title:"Confidentiality & POPIA Policy (Detailed)", type:"text", lines:[
      "PURPOSE",
      "To protect patient personal information and ensure lawful processing, access control, and confidentiality.",
      "---",
      "SCOPE",
      "Applies to paper records, electronic records, messaging/telemedicine, and any third-party processors.",
      "---",
      "RESPONSIBILITIES",
      "- Responsible Practitioner/Information Officer: oversight of data protection and breach management.",
      "- All staff: confidentiality, secure handling, minimal access, and incident reporting.",
      "- IT/service providers: implement security controls and confidentiality agreements.",
      "---",
      "PROCEDURE (STEP-BY-STEP)",
      "1. Collect only information necessary for care and administration; explain purpose to patient.",
      "2. Store paper records in a locked cabinet/room; control keys; keep sign-out log if removed.",
      "3. Store electronic records in password-protected systems; use role-based access; enable auto-lock and backups.",
      "4. Do not share patient information without consent unless legally required or clinically necessary for referral.",
      "5. Use private areas for calls; verify patient identity before discussing clinical information.",
      "6. For telemedicine/myCG: use secure platform; avoid sharing sensitive data over unsecured channels.",
      "7. Dispose of confidential waste via shredding/secure disposal; never place patient identifiers in general waste.",
      "8. If a suspected data breach occurs: contain, assess impact, document, notify as required, implement corrective actions.",
      "9. Review access lists and passwords regularly; enforce strong passwords and (where available) 2FA.",
      "---",
      "RECORDS / FORMS / EVIDENCE",
      "- Consent forms; access log; breach/incident log; shredding certificate (if available); IT backup evidence; confidentiality agreements.",
      "---",
      "MONITORING, AUDIT & REVIEW",
      "- Annual review of POPIA controls and immediate review after any breach/near miss.",
    ] });
    docs.push({folder:"01_GOVERNANCE", file:`04_Patient_Rights_Charter_2026.pdf`, title:"Patient Rights Charter", type:"text", lines:[
      "PATIENT RIGHTS CHARTER (PRACTICE VERSION)",
      "- Right to access healthcare services without unfair discrimination.",
      "- Right to dignity, respect and privacy during consultation and examination.",
      "- Right to information in a language and manner the patient can understand.",
      "- Right to informed consent and participation in decisions about care.",
      "- Right to confidentiality of medical information and secure records.",
      "- Right to safe care, including infection prevention measures.",
      "- Right to continuity of care and appropriate referral when needed.",
      "- Right to complain and receive a fair response without prejudice.",
      "---",
      "HOW TO PROVIDE FEEDBACK / COMPLAINTS",
      "1. Speak to reception/admin or request the complaints form/register entry.",
      "2. Provide details: date, concern, desired outcome, contact details (optional).",
      "3. Practice will acknowledge, investigate, and respond within a reasonable timeframe.",
      "4. Serious complaints are escalated to the responsible practitioner immediately.",
    ] });
    docs.push({folder:"01_GOVERNANCE", file:`05_Complaints_Management_SOP_2026.pdf`, title:"Complaints Management SOP (Detailed)", type:"text", lines:[
      "PURPOSE",
      "To provide a transparent process for receiving, documenting, investigating and resolving complaints.",
      "---",
      "SCOPE",
      "Applies to all complaints from patients, family, visitors, staff, or third parties related to service delivery.",
      "---",
      "RESPONSIBILITIES",
      "- Reception/Admin: receive and log complaint, acknowledge receipt, route to practitioner/manager.",
      "- Responsible Practitioner/Manager: investigate, decide corrective actions, communicate outcome.",
      "- All staff: cooperate with investigations and implement corrective actions.",
      "---",
      "PROCEDURE (STEP-BY-STEP)",
      "1. Receive complaint verbally or in writing; treat complainant with respect and privacy.",
      "2. Record complaint in the Complaints Register: date, description, category, person receiving, reference number.",
      "3. Acknowledge receipt (same day when possible) and explain investigation process.",
      "4. Assess severity: if clinical safety risk, escalate immediately and take urgent action.",
      "5. Investigate: review records, speak to staff involved, gather statements if needed.",
      "6. Decide outcome: apology/explanation, service correction, refund/fee review (if applicable), training, process change.",
      "7. Document corrective actions and assign responsibility and due date; track until closed.",
      "8. Communicate outcome to complainant in a respectful manner; document communication.",
      "9. Trend review: monthly/quarterly review complaints for patterns; implement quality improvement.",
      "10. File supporting documents confidentially; update inspection index evidence if requested.",
      "---",
      "RECORDS / FORMS / EVIDENCE",
      "- Complaints Register; action log; correspondence; meeting notes; updated SOP/policy versions.",
      "---",
      "MONITORING, AUDIT & REVIEW",
      "- Quarterly complaints trend review and evidence of corrective actions.",
    ] });
    docs.push({folder:"01_GOVERNANCE", file:`06_Complaints_Register_2026.pdf`, title:"Complaints Register", type:"register", headers:["Date", "Patient (optional)", "Complaint", "Action Taken", "Outcome", "Responsible Person", "Signature"] });
    docs.push({folder:"01_GOVERNANCE", file:`07_Incident_NearMiss_Register_2026.pdf`, title:"Incident & Near-Miss Register", type:"register", headers:["Date", "Incident/Near-miss", "Person Involved", "Immediate Action", "Follow-up", "Reported By", "Signature"] });
    docs.push({folder:"01_GOVERNANCE", file:`08_Declaration_of_Compliance_2026.pdf`, title:"Declaration of Compliance", type:"text", lines:[
      "DECLARATION OF COMPLIANCE",
      "I, the undersigned, declare that the practice implements the policies, SOPs and registers contained in this compliance file and strives to comply with applicable OHSC norms and standards.",
      "This declaration is made in good faith for regulatory and inspection purposes.",
      "---",
      "Signed (typed): {{signature_name}}",
      "Date: {{signature_date}}",
    ] });
    }


    // Pack 2 IPC (DETAILED)
    if(want("PACK2")){
    docs.push({folder:"02_IPC", file:`01_IPC_Policy_2026.pdf`, title:"IPC Policy (Detailed)", type:"text", lines:[
      "PURPOSE",
      "To prevent and control infections, protecting patients, staff and visitors.",
      "---",
      "SCOPE",
      "Applies to all staff, contractors, and all clinical/non-clinical areas of the practice.",
      "---",
      "RESPONSIBILITIES",
      "- Responsible practitioner/IPC lead: oversight, resources, audits, incident management.",
      "- All staff: follow standard precautions and report IPC risks.",
      "- Cleaning staff/contractors: follow cleaning schedules and chemical instructions.",
      "---",
      "PROCEDURE (STEP-BY-STEP)",
      "1. Apply standard precautions to every patient: hand hygiene, PPE when indicated, safe sharps, environmental cleaning.",
      "2. Implement transmission-based precautions when indicated (droplet/contact/airborne) and arrange referral/isolation as appropriate.",
      "3. Ensure availability of hand rub, soap, towels, PPE, sharps containers, waste bins, disinfectants.",
      "4. Maintain cleaning schedule for high-touch surfaces and clinical areas.",
      "5. Ensure appropriate waste segregation at point of generation (general vs healthcare risk waste).",
      "6. Manage occupational exposures as medical emergencies and document all exposures.",
      "7. Train staff on IPC at induction and annually; document training.",
      "8. Perform periodic IPC audits (hand hygiene supplies, waste segregation, cleaning logs) and document findings.",
      "---",
      "RECORDS / FORMS / EVIDENCE",
      "- Cleaning register; waste register; sharps log; exposure register; IPC training register; audit checklists.",
      "---",
      "MONITORING, AUDIT & REVIEW",
      "- Monthly IPC review and annual policy review, plus review after any outbreak/exposure incident.",
    ] });
    docs.push({folder:"02_IPC", file:`02_Hand_Hygiene_SOP_2026.pdf`, title:"Hand Hygiene SOP (Detailed)", type:"text", lines:[
      "PURPOSE",
      "To standardise hand hygiene practices to reduce healthcare-associated infections.",
      "---",
      "SCOPE",
      "Applies to all staff, before/after patient contact and after glove removal.",
      "---",
      "RESPONSIBILITIES",
      "- All staff: perform hand hygiene at indicated moments and maintain nails/jewellery standards.",
      "- Manager/IPC lead: ensure supplies and monitor compliance.",
      "---",
      "PROCEDURE (STEP-BY-STEP)",
      "1. Ensure hand rub is available at point of care and reception.",
      "2. Perform hand hygiene at minimum: before touching a patient; before aseptic task; after body fluid exposure risk; after touching a patient; after touching patient surroundings.",
      "3. Use alcohol-based hand rub when hands are not visibly soiled (rub for 20\u201330 seconds).",
      "4. Use soap and water when hands are visibly soiled, after toilet use, and when clinically indicated (wash 40\u201360 seconds).",
      "5. Keep nails short; avoid artificial nails; minimise jewellery; cover cuts with waterproof dressings.",
      "6. Replace hand hygiene supplies promptly; document shortages as an IPC risk.",
      "---",
      "RECORDS / FORMS / EVIDENCE",
      "- IPC audit checklist; training register; incident log for supply shortages.",
      "---",
      "MONITORING, AUDIT & REVIEW",
      "- Spot checks weekly and formal monthly audit; refresher training annually.",
    ] });
    docs.push({folder:"02_IPC", file:`03_Cleaning_Disinfection_SOP_2026.pdf`, title:"Cleaning & Disinfection SOP (Detailed)", type:"text", lines:[
      "PURPOSE",
      "To maintain a clean environment, reducing infection risk through routine and terminal cleaning.",
      "---",
      "SCOPE",
      "Applies to all areas: waiting room, reception, toilets, consultation rooms, treatment areas, and shared equipment.",
      "---",
      "RESPONSIBILITIES",
      "- Cleaning staff/contractor: complete daily/weekly tasks and sign cleaning register.",
      "- IPC lead/manager: verify completion, ensure correct products and dilution, train staff.",
      "---",
      "PROCEDURE (STEP-BY-STEP)",
      "1. Prepare cleaning equipment: gloves, cloths, mop, buckets, detergent and approved disinfectant.",
      "2. Clean from clean-to-dirty and high-to-low; change cloths when visibly soiled.",
      "3. Daily: clean high-touch surfaces (door handles, counters, chairs, BP cuffs as needed).",
      "4. Clinical areas: disinfect examination couches and reusable surfaces between patients as appropriate.",
      "5. Spills of blood/body fluids: wear PPE, contain spill, clean with detergent, then disinfect; dispose waste as healthcare risk waste.",
      "6. Reusable equipment: clean/disinfect per manufacturer instructions; label if out of service.",
      "7. Record tasks in Cleaning & Disinfection Register; note any issues and corrective actions.",
      "---",
      "RECORDS / FORMS / EVIDENCE",
      "- Cleaning & Disinfection Register; chemical safety datasheets; dilution guide; audit checklist.",
      "---",
      "MONITORING, AUDIT & REVIEW",
      "- Manager reviews registers weekly; monthly IPC audit of cleaning compliance.",
    ] });
    docs.push({folder:"02_IPC", file:`04_Healthcare_Risk_Waste_SOP_2026.pdf`, title:"Healthcare Risk Waste SOP (Detailed)", type:"text", lines:[
      "PURPOSE",
      "To ensure safe segregation, storage and disposal of healthcare risk waste and sharps.",
      "---",
      "SCOPE",
      "Applies to all staff generating waste and all waste handling processes.",
      "---",
      "RESPONSIBILITIES",
      "- All staff: segregate waste at point of use and close sharps containers at fill line.",
      "- Manager: arrange licensed collection and keep proof of service; ensure storage area security.",
      "---",
      "PROCEDURE (STEP-BY-STEP)",
      "1. Segregate waste at point of generation: general waste vs healthcare risk waste; never mix.",
      "2. Sharps: dispose immediately after use into approved sharps container; do not recap needles unless clinically unavoidable.",
      "3. Do not overfill sharps containers; close at fill line; label with date/location; replace immediately.",
      "4. Store healthcare risk waste in a secure, labelled area with restricted access until collection.",
      "5. Arrange collection by approved service provider; retain manifests/certificates where available.",
      "6. Record waste movements and container replacement in Waste Register and Sharps Log.",
      "---",
      "RECORDS / FORMS / EVIDENCE",
      "- Waste register; sharps log; service provider collection records/manifests; incident log.",
      "---",
      "MONITORING, AUDIT & REVIEW",
      "- Monthly review of waste compliance and immediate review after any sharps incident.",
    ] });
    docs.push({folder:"02_IPC", file:`05_Needlestick_Exposure_SOP_2026.pdf`, title:"Needlestick & Exposure SOP (Detailed)", type:"text", lines:[
      "PURPOSE",
      "To provide an immediate step-by-step response to occupational exposure incidents.",
      "---",
      "SCOPE",
      "Applies to all staff and includes needlestick injuries, mucosal splash, or broken skin exposure.",
      "---",
      "RESPONSIBILITIES",
      "- Exposed staff member: immediate first aid and prompt reporting.",
      "- Responsible practitioner/manager: clinical assessment, PEP decision, follow-up and documentation.",
      "---",
      "PROCEDURE (STEP-BY-STEP)",
      "1. Stop procedure safely and perform immediate first aid: wash area with soap and water; do not squeeze aggressively; flush mucosa with water.",
      "2. Report exposure immediately to the responsible practitioner/manager.",
      "3. Document incident in Occupational Exposure Register with time, source details if known, and circumstances.",
      "4. Assess exposure risk and consider baseline testing per protocol; obtain consent where required.",
      "5. Initiate PEP as clinically indicated as soon as possible and document.",
      "6. Arrange follow-up: counselling, repeat testing schedule, and occupational health support.",
      "7. Review root cause and implement corrective actions (training, equipment changes, workflow).",
      "---",
      "RECORDS / FORMS / EVIDENCE",
      "- Occupational Exposure Register; incident log; PEP documentation; training records.",
      "---",
      "MONITORING, AUDIT & REVIEW",
      "- All exposures reviewed within 48 hours; quarterly trend analysis.",
    ] });
    docs.push({folder:"02_IPC", file:`06_Cleaning_Register_2026.pdf`, title:"Cleaning & Disinfection Register", type:"register", headers:["Date", "Area Cleaned", "Frequency", "Disinfectant Used", "Responsible Person", "Signature"] });
    docs.push({folder:"02_IPC", file:`07_Waste_Register_2026.pdf`, title:"Healthcare Risk Waste Register", type:"register", headers:["Date", "Waste Type", "Container ID", "Fill Level", "Action Taken", "Collected By", "Signature"] });
    docs.push({folder:"02_IPC", file:`08_Sharps_Log_2026.pdf`, title:"Sharps Container Monitoring Log", type:"register", headers:["Date", "Location", "Container Number", "Fill Level", "Replaced (Y/N)", "Signature"] });
    docs.push({folder:"02_IPC", file:`09_Exposure_Register_2026.pdf`, title:"Occupational Exposure Register", type:"register", headers:["Date", "Staff Member", "Type of Exposure", "Immediate Action", "Follow-up", "Signature"] });
    docs.push({folder:"02_IPC", file:`10_IPC_Training_Register_2026.pdf`, title:"IPC Training Register", type:"register", headers:["Staff Name", "Role", "Training Topic", "Date", "Trainer", "Signature"] });
    }


    // Pack 3 Medicines & Dispensing (DETAILED)
    if(want("PACK3")){
    if(isDispensing || isEmergencyMeds){
    docs.push({folder:"03_MEDICINES", file:`01_Medicines_Management_Policy_2026.pdf`, title:"Medicines Management Policy (Detailed)", type:"text", lines:[
      "PURPOSE",
      "To ensure safe, lawful procurement, storage, dispensing, and monitoring of medicines.",
      "---",
      "SCOPE",
      "Applies to all medicines held on site, including emergency medicines and any dispensing stock.",
      "---",
      "RESPONSIBILITIES",
      "- Responsible practitioner: overall medicines governance and authorisation.",
      "- Dispensing personnel (if any): stock handling, labelling, counselling, record-keeping.",
      "- Admin: ordering support and filing supplier invoices/records.",
      "---",
      "PROCEDURE (STEP-BY-STEP)",
      "1. Procure medicines from licensed suppliers; keep invoices and batch/expiry where available.",
      "2. Receive stock: check quantity, batch, expiry, and integrity; record discrepancies.",
      "3. Store medicines securely with restricted access; maintain appropriate temperature and light control.",
      "4. Separate expired/returned/damaged stock immediately; label and quarantine for disposal.",
      "5. Dispense medicines only with valid prescription/authorisation; verify patient identity and allergies where possible.",
      "6. Label clearly: patient name, medicine, dose, instructions, quantity, date, prescriber, warnings.",
      "7. Provide counselling: dosage, side effects, interactions, storage, adherence.",
      "8. Conduct periodic stock counts and expiry checks; document and correct variances.",
      "---",
      "RECORDS / FORMS / EVIDENCE",
      "- Stock register; invoices; expiry check log; fridge temp log (if applicable); schedule 5/6 register (if applicable); ADR register.",
      "---",
      "MONITORING, AUDIT & REVIEW",
      "- Monthly stock and expiry audit; annual policy review; immediate review after any dispensing error.",
    ] });
    docs.push({folder:"03_MEDICINES", file:`02_Dispensing_SOP_2026.pdf`, title:"Dispensing SOP (Detailed)", type:"text", lines:[
      "PURPOSE",
      "To standardise dispensing workflow and reduce dispensing errors through verification and counselling.",
      "---",
      "SCOPE",
      "Applies when the practice dispenses medicines (routine or emergency only).",
      "---",
      "RESPONSIBILITIES",
      "- Dispensing staff/practitioner: verify prescription, prepare and label medicine, counsel patient.",
      "- Responsible practitioner: oversight, review errors/incidents, training.",
      "---",
      "PROCEDURE (STEP-BY-STEP)",
      "1. Confirm dispensing authority and check prescription/clinical indication.",
      "2. Verify patient identity and key safety checks (allergies, pregnancy status where relevant, interactions).",
      "3. Select correct medicine: verify name, strength, dosage form, batch and expiry.",
      "4. Prepare quantity and label according to legal requirements; include clear instructions.",
      "5. Double-check (self-check or second checker if available): right patient, medicine, dose, route, time, quantity.",
      "6. Counsel patient: how to take, duration, side effects, red flags, storage, adherence.",
      "7. Document dispensing and update stock register; file prescription/record entry as applicable.",
      "8. If an error is suspected: stop supply if possible, inform practitioner, document incident, manage patient safety and follow-up.",
      "---",
      "RECORDS / FORMS / EVIDENCE",
      "- Prescription/record entry; dispensing label; stock register; incident log; patient counselling note (if used).",
      "---",
      "MONITORING, AUDIT & REVIEW",
      "- Quarterly review of dispensing incidents/near misses and corrective actions.",
    ] });
    docs.push({folder:"03_MEDICINES", file:`03_Storage_Temperature_SOP_2026.pdf`, title:"Storage & Temperature Control SOP (Detailed)", type:"text", lines:[
      "PURPOSE",
      "To maintain medicine potency and safety through correct storage and temperature monitoring.",
      "---",
      "SCOPE",
      "Applies to all storage areas, including medicine fridge(s) if used.",
      "---",
      "RESPONSIBILITIES",
      "- Designated staff: daily temperature checks and documentation.",
      "- Manager/practitioner: ensures equipment maintenance and corrective actions.",
      "---",
      "PROCEDURE (STEP-BY-STEP)",
      "1. Keep storage areas clean, dry, secure and away from direct sunlight.",
      "2. Store medicines by category and expiry (FEFO: first-expiry-first-out).",
      "3. If using a medicine fridge: check and record temperatures daily (AM/PM) where possible.",
      "4. If temperature is out of range: quarantine temperature-sensitive stock, investigate cause, document action, arrange repair.",
      "5. Maintain cold chain during receiving and transport; minimise time out of fridge.",
      "6. Perform monthly expiry checks; quarantine expired stock and record disposal pathway.",
      "---",
      "RECORDS / FORMS / EVIDENCE",
      "- Fridge temperature log; maintenance records; quarantine log; expiry check log.",
      "---",
      "MONITORING, AUDIT & REVIEW",
      "- Daily temperature monitoring and monthly review; annual SOP review.",
    ] });
    docs.push({folder:"03_MEDICINES", file:`04_Stock_Register_2026.pdf`, title:"Medicine Stock Register", type:"register", headers:["Date", "Medicine", "Batch No", "Expiry Date", "Qty In", "Qty Out", "Balance", "Signature"] });
    docs.push({folder:"03_MEDICINES", file:`05_Fridge_Temp_Log_2026.pdf`, title:"Fridge Temperature Log", type:"register", headers:["Date", "AM Temp (\u00b0C)", "PM Temp (\u00b0C)", "Action Taken (if out of range)", "Signature"] });
    docs.push({folder:"03_MEDICINES", file:`06_ADR_Register_2026.pdf`, title:"Adverse Drug Reaction (ADR) Register", type:"register", headers:["Date", "Patient Initials", "Medicine", "Reaction", "Action Taken", "Reported To", "Signature"] });
    }
    if(isSchedule56){
    docs.push({folder:"03_MEDICINES", file:`07_Schedule_5_6_SOP_2026.pdf`, title:"Schedule 5 & 6 SOP (Detailed)", type:"text", lines:[
      "PURPOSE",
      "To ensure secure storage, controlled access, accurate balances, and compliant dispensing of Schedule 5/6 medicines.",
      "---",
      "SCOPE",
      "Applies when Schedule 5/6 medicines are held/dispensed by the practice.",
      "---",
      "RESPONSIBILITIES",
      "- Responsible practitioner: authorisation, access control, audit, incident management.",
      "- Dispensing staff (if any): accurate register entries and balance checks.",
      "---",
      "PROCEDURE (STEP-BY-STEP)",
      "1. Store S5/6 medicines in a locked cabinet/safe with restricted access.",
      "2. Maintain an S5/6 register: record receipts, issues, patient details as required, quantities and running balance.",
      "3. Perform regular balance checks (at least weekly if active use, otherwise monthly) and document.",
      "4. Investigate discrepancies immediately; document incident and corrective action.",
      "5. Limit keys/access and keep key control; do not share access codes.",
      "6. Ensure expired S5/6 stock is quarantined and disposed of via approved route; record disposal.",
      "---",
      "RECORDS / FORMS / EVIDENCE",
      "- Schedule 5/6 register; balance check log; key control record; incident log; disposal evidence.",
      "---",
      "MONITORING, AUDIT & REVIEW",
      "- Weekly/monthly balance checks and quarterly audit; annual SOP review.",
    ] });
    docs.push({folder:"03_MEDICINES", file:`08_Schedule_5_6_Register_2026.pdf`, title:"Schedule 5 & 6 Register", type:"register", headers:["Date", "Medicine", "Patient", "Qty", "Balance", "Prescriber", "Signature"] });
    }
    }


    // Pack 4 HR & Training (DETAILED)
    if(want("PACK4")){
    if(hasStaff){
    docs.push({folder:"04_HR", file:`01_HR_Policy_2026.pdf`, title:"Human Resources Policy (Detailed)", type:"text", lines:[
      "PURPOSE",
      "To ensure fair recruitment, role clarity, training, confidentiality, and performance oversight.",
      "---",
      "SCOPE",
      "Applies to all employees and contracted staff working in the practice.",
      "---",
      "RESPONSIBILITIES",
      "- Responsible practitioner/manager: recruitment decisions, contracts, supervision, disciplinary processes.",
      "- All staff: comply with policies, maintain confidentiality, complete training.",
      "---",
      "PROCEDURE (STEP-BY-STEP)",
      "1. Recruit based on competence and operational needs; verify identity and qualifications where relevant.",
      "2. Issue role description and contract; maintain staff file (ID, contract, qualifications, confidentiality agreement).",
      "3. Conduct induction before duties; include IPC, emergencies, POPIA and workflow.",
      "4. Provide ongoing training and document in Training Register; schedule annual refreshers (IPC, emergencies, privacy).",
      "5. Use performance feedback and corrective action; document where appropriate.",
      "6. Address misconduct via fair process; document warnings and outcomes.",
      "---",
      "RECORDS / FORMS / EVIDENCE",
      "- Staff register; staff files; induction checklist; training register; disciplinary records (if any).",
      "---",
      "MONITORING, AUDIT & REVIEW",
      "- Annual HR file audit and training compliance review.",
    ] });
    docs.push({folder:"04_HR", file:`02_Induction_SOP_2026.pdf`, title:"Staff Induction SOP (Detailed)", type:"text", lines:[
      "PURPOSE",
      "To ensure new staff understand policies, workflow, IPC, safety and confidentiality before providing services.",
      "---",
      "SCOPE",
      "Applies to all new staff and temporary staff.",
      "---",
      "RESPONSIBILITIES",
      "- Manager/practitioner: delivers induction and signs off checklist.",
      "- New staff member: completes induction and acknowledges understanding.",
      "---",
      "PROCEDURE (STEP-BY-STEP)",
      "1. Provide orientation: facility layout, emergency exits, fire equipment, first aid kit and emergency numbers.",
      "2. Review key policies: POPIA/confidentiality, IPC, waste, incident reporting, complaints process.",
      "3. Train on practice workflow: booking, filing, billing, records handling, telemedicine (if used).",
      "4. Demonstrate hand hygiene and PPE; show cleaning/waste points and sharps containers.",
      "5. Explain incident/near-miss reporting and occupational exposure response.",
      "6. Complete and sign induction checklist; file in staff record.",
      "---",
      "RECORDS / FORMS / EVIDENCE",
      "- Induction checklist; training register; staff file acknowledgement.",
      "---",
      "MONITORING, AUDIT & REVIEW",
      "- All new staff inducted before duties; refresher induction annually or when policies change.",
    ] });
    docs.push({folder:"04_HR", file:`03_Training_CPD_Policy_2026.pdf`, title:"Training & CPD Policy (Detailed)", type:"text", lines:[
      "PURPOSE",
      "To maintain staff competency and ensure ongoing learning aligned to roles and regulatory expectations.",
      "---",
      "SCOPE",
      "Applies to all staff and includes mandatory refreshers and role-specific training.",
      "---",
      "RESPONSIBILITIES",
      "- Manager/practitioner: identify training needs, schedule refreshers, keep records.",
      "- All staff: attend training and sign registers.",
      "---",
      "PROCEDURE (STEP-BY-STEP)",
      "1. Identify training needs at induction, annually, and after incidents/audits.",
      "2. Mandatory annual refreshers: IPC, confidentiality/POPIA, fire & evacuation, basic emergency response.",
      "3. Role-specific training: dispensing workflow, stock control, data capture, telemedicine workflow (if applicable).",
      "4. Record training topic, date, provider/trainer, and (where relevant) CPD points.",
      "5. Evaluate training effectiveness through observation, audits, and incident trends.",
      "---",
      "RECORDS / FORMS / EVIDENCE",
      "- Training register; certificates; CPD evidence (for clinical staff); audit results.",
      "---",
      "MONITORING, AUDIT & REVIEW",
      "- Annual training plan review and quarterly monitoring of completion rates.",
    ] });
    docs.push({folder:"04_HR", file:`04_Code_of_Conduct_2026.pdf`, title:"Staff Code of Conduct", type:"text", lines:[
      "STAFF CODE OF CONDUCT",
      "1. Professionalism: be punctual, respectful, and patient-centred.",
      "2. Confidentiality: never disclose patient information improperly; follow POPIA policy.",
      "3. Respect & non-discrimination: treat all patients fairly.",
      "4. Safety: follow IPC and safety procedures; report hazards and incidents.",
      "5. Communication: explain processes clearly; escalate concerns to the practitioner/manager.",
      "6. Integrity: accurate records, honest billing, no falsification of registers.",
      "7. Social media: never share patient information or images; follow practice rules.",
      "---",
      "DISCIPLINARY PROCESS (SUMMARY)",
      "- Allegation reviewed; staff given opportunity to respond; fair corrective action applied.",
    ] });
    docs.push({folder:"04_HR", file:`05_Staff_Register_2026.pdf`, title:"Staff Register", type:"register", headers:["Staff Name", "Role", "Start Date", "Qualifications", "Reg No", "Signature"] });
    docs.push({folder:"04_HR", file:`06_Training_Register_2026.pdf`, title:"Training & CPD Register", type:"register", headers:["Staff Name", "Training Topic", "Date", "Provider", "CPD Points", "Signature"] });
    docs.push({folder:"04_HR", file:`07_Induction_Checklist_2026.pdf`, title:"Staff Induction Checklist", type:"register", headers:["Staff Name", "Induction Item", "Completed (Y/N)", "Date", "Signature"] });
    }
    }


    // Pack 5 Safety & Emergency (DETAILED)
    if(want("PACK5")){
    docs.push({folder:"05_SAFETY", file:`01_Fire_Evacuation_Policy_2026.pdf`, title:"Fire & Evacuation Policy (Detailed)", type:"text", lines:[
      "PURPOSE",
      "To prevent fire risks and ensure safe, orderly evacuation for patients, staff and visitors.",
      "---",
      "SCOPE",
      "Applies to all staff and all areas of the facility.",
      "---",
      "RESPONSIBILITIES",
      "- Manager: maintain fire equipment, evacuation signage, and drill schedule.",
      "- All staff: know exits, assist patients, follow evacuation procedures.",
      "---",
      "PROCEDURE (STEP-BY-STEP)",
      "1. Keep exits clear and signage visible; do not obstruct corridors or doors.",
      "2. Ensure fire extinguisher(s) are serviced and accessible; record checks in Fire Equipment Register.",
      "3. Display evacuation route and assembly point; brief new staff during induction.",
      "4. If fire/smoke detected: raise alarm, call emergency services, evacuate if safe, use extinguisher only if trained and safe.",
      "5. Account for staff and patients at assembly point; do not re-enter until declared safe.",
      "6. Record drills and any real events; implement corrective actions.",
      "---",
      "RECORDS / FORMS / EVIDENCE",
      "- Fire equipment register; evacuation/drill register; maintenance certificates; incident log.",
      "---",
      "MONITORING, AUDIT & REVIEW",
      "- Quarterly drill (or at least annually for small practices) and annual policy review.",
    ] });
    docs.push({folder:"05_SAFETY", file:`02_Emergency_Disaster_SOP_2026.pdf`, title:"Emergency & Disaster Management SOP (Detailed)", type:"text", lines:[
      "PURPOSE",
      "To provide a coordinated response to emergencies (fire, power failure, violence, severe weather, mass casualty).",
      "---",
      "SCOPE",
      "Applies to all staff and includes communication and continuity planning.",
      "---",
      "RESPONSIBILITIES",
      "- Manager/practitioner: lead response, communication, and post-incident review.",
      "- All staff: follow instructions, ensure patient safety, document actions.",
      "---",
      "PROCEDURE (STEP-BY-STEP)",
      "1. Maintain emergency contact list: EMS, police, fire, municipality, building owner, key suppliers.",
      "2. Identify critical services and backup: power (load shedding), lighting, communications, data backups.",
      "3. During an emergency: ensure immediate safety, call appropriate services, secure medicines/records where possible.",
      "4. Activate communication plan: notify staff, direct patients, post signage if closing.",
      "5. After event: document incident, assess damage/loss, implement corrective actions and review SOP.",
      "---",
      "RECORDS / FORMS / EVIDENCE",
      "- Emergency contact list; incident log; business continuity notes; maintenance/repair records.",
      "---",
      "MONITORING, AUDIT & REVIEW",
      "- Review after any major event and at least annually.",
    ] });
    docs.push({folder:"05_SAFETY", file:`03_Medical_Emergency_SOP_2026.pdf`, title:"Medical Emergency Response SOP (Detailed)", type:"text", lines:[
      "PURPOSE",
      "To ensure prompt, organised response to medical emergencies within the practice.",
      "---",
      "SCOPE",
      "Applies to all staff and covers collapse, severe allergic reactions, seizures, chest pain, etc.",
      "---",
      "RESPONSIBILITIES",
      "- First responder: call for help, initiate basic life support within scope.",
      "- Responsible practitioner: clinical leadership, EMS coordination, documentation.",
      "---",
      "PROCEDURE (STEP-BY-STEP)",
      "1. Recognise emergency and call for assistance; activate EMS when indicated.",
      "2. Assess airway, breathing, circulation; start BLS if required within training.",
      "3. Retrieve emergency equipment/medicines as per checklist; assign roles (call, assist, crowd control).",
      "4. Provide supportive care until EMS arrives; document vital signs and actions taken.",
      "5. After event: document in incident register and review response for improvement; restock equipment.",
      "---",
      "RECORDS / FORMS / EVIDENCE",
      "- Emergency equipment checklist; incident register; training records (BLS); restock log.",
      "---",
      "MONITORING, AUDIT & REVIEW",
      "- Monthly equipment checks and annual emergency drill/training refresh.",
    ] });
    docs.push({folder:"05_SAFETY", file:`04_OHS_Policy_2026.pdf`, title:"Occupational Health & Safety Policy (Detailed)", type:"text", lines:[
      "PURPOSE",
      "To provide a safe workplace by identifying hazards and implementing controls.",
      "---",
      "SCOPE",
      "Applies to all staff, contractors, and visitors on the premises.",
      "---",
      "RESPONSIBILITIES",
      "- Manager: hazard assessments, controls, reporting pathways, corrective actions.",
      "- All staff: follow safety rules and report hazards and incidents.",
      "---",
      "PROCEDURE (STEP-BY-STEP)",
      "1. Identify hazards: slips/trips, electrical, sharps, chemicals, ergonomics, security risks.",
      "2. Implement controls: housekeeping, PPE, safe storage, signage, equipment maintenance.",
      "3. Report hazards and incidents promptly; document in incident/near-miss register.",
      "4. Ensure staff know emergency procedures and contact numbers.",
      "5. Review safety performance and corrective actions regularly.",
      "---",
      "RECORDS / FORMS / EVIDENCE",
      "- Hazard checklist; incident/near-miss register; maintenance records; training register.",
      "---",
      "MONITORING, AUDIT & REVIEW",
      "- Quarterly safety walk-through and annual policy review.",
    ] });
    docs.push({folder:"05_SAFETY", file:`05_Fire_Equipment_Register_2026.pdf`, title:"Fire Equipment Register", type:"register", headers:["Date", "Equipment Type", "Location", "Condition", "Action Taken", "Signature"] });
    docs.push({folder:"05_SAFETY", file:`06_Emergency_Equipment_Checklist_2026.pdf`, title:"Emergency Equipment Checklist", type:"register", headers:["Date", "Equipment Item", "Available (Y/N)", "Condition", "Checked By", "Signature"] });
    docs.push({folder:"05_SAFETY", file:`07_Drill_Register_2026.pdf`, title:"Evacuation & Fire Drill Register", type:"register", headers:["Date", "Type of Drill", "Participants", "Outcome", "Corrective Action", "Signature"] });
    }
    // Pack 6 Advanced SOPs (DETAILED)
    if(want("PACK6")){
    docs.push({folder:"06_ADVANCED", file:`01_Patient_ID_SOP_2026.pdf`, title:"Patient Identification & Verification SOP", type:"text", lines:[
      "PURPOSE",
      "To ensure correct patient identification at every encounter and reduce errors.",
      "---",
      "SCOPE",
      "Applies to reception, clinical staff, telemedicine, and any documentation/dispensing.",
      "---",
      "RESPONSIBILITIES",
      "- Reception/Admin: verify identifiers and update demographics.",
      "- Clinician: confirm identity before assessment, procedures, prescribing/dispensing.",
      "- All staff: report near-misses related to identification.",
      "---",
      "PROCEDURE (STEP-BY-STEP)",
      "1. Ask the patient to state full name and date of birth (or ID number) and confirm contact number.",
      "2. If returning patient, confirm address and emergency contact; update changes immediately.",
      "3. For telemedicine: confirm at least two identifiers before discussing clinical details.",
      "4. Before prescribing/dispensing or procedures: re-confirm identifiers and allergies where possible.",
      "5. If identity cannot be confirmed: pause non-urgent care, escalate to practitioner, and document.",
      "---",
      "RECORDS / EVIDENCE",
      "- Patient registration fields in electronic/paper file.",
      "- Consent forms where used.",
      "- Incident/near-miss register for ID errors.",
      "---",
      "MONITORING, AUDIT & REVIEW",
      "- Quarterly spot-check of 10 random files for completeness of identifiers.",
    ] });
    docs.push({folder:"06_ADVANCED", file:`02_Referral_Continuity_SOP_2026.pdf`, title:"Referral & Continuity of Care SOP", type:"text", lines:[
      "PURPOSE",
      "To ensure timely referral, feedback tracking, and continuity of care.",
      "---",
      "SCOPE",
      "Applies to referrals to hospitals, specialists, allied health and diagnostics.",
      "---",
      "RESPONSIBILITIES",
      "- Clinician: decide referral, provide referral letter, document plan.",
      "- Admin: assist booking/follow-up where requested and file feedback.",
      "---",
      "PROCEDURE (STEP-BY-STEP)",
      "1. Identify need for referral and discuss with patient (reason, urgency, options).",
      "2. Complete referral note/letter including summary, findings, meds/allergies, urgency, contact details.",
      "3. Provide patient with instructions and red flags; document advice.",
      "4. Track referral outcome: file feedback report and update patient record.",
      "5. If no feedback within expected time, follow-up where appropriate and document.",
      "---",
      "RECORDS / EVIDENCE",
      "- Referral letters/requests.",
      "- Feedback reports.",
      "- Follow-up notes.",
      "---",
      "MONITORING, AUDIT & REVIEW",
      "- Quarterly review of referral tracking for completeness.",
    ] });
    docs.push({folder:"06_ADVANCED", file:`03_Prescription_Handling_SOP_2026.pdf`, title:"Prescription Handling & Documentation SOP", type:"text", lines:[
      "PURPOSE",
      "To standardise safe prescribing documentation and reduce prescription errors.",
      "---",
      "SCOPE",
      "Applies to all prescriptions and repeats issued by the practice.",
      "---",
      "RESPONSIBILITIES",
      "- Clinician: accurate prescription and documentation.",
      "- Dispensing staff (if any): verify and query unclear items.",
      "---",
      "PROCEDURE (STEP-BY-STEP)",
      "1. Confirm patient identifiers and relevant history (allergies, pregnancy status, interactions).",
      "2. Select correct medicine, strength, dose, frequency, duration and quantity.",
      "3. Write/issue prescription clearly; avoid ambiguous abbreviations.",
      "4. Document indication, counselling and follow-up plan in the clinical record.",
      "5. Manage repeats with review dates; avoid indefinite repeats without review.",
      "6. If an error is detected: correct promptly, inform patient if needed, document and log incident/near miss.",
      "---",
      "RECORDS / EVIDENCE",
      "- Prescription copies/entries.",
      "- Clinical notes.",
      "- Incident/near-miss log.",
      "---",
      "MONITORING, AUDIT & REVIEW",
      "- Quarterly audit of 10 prescriptions for completeness and legibility.",
    ] });
    docs.push({folder:"06_ADVANCED", file:`04_Loadshedding_PowerFailure_SOP_2026.pdf`, title:"Power Failure & Load Shedding SOP", type:"text", lines:[
      "PURPOSE",
      "To maintain patient safety and continuity during power outages.",
      "---",
      "SCOPE",
      "Applies to all staff and all outages (planned/unplanned).",
      "---",
      "RESPONSIBILITIES",
      "- Manager: readiness, backups, communication.",
      "- All staff: implement downtime workflow.",
      "---",
      "PROCEDURE (STEP-BY-STEP)",
      "1. Maintain backup lighting/charging options and printed downtime forms.",
      "2. During outage: keep patients safe, continue urgent care, and reschedule non-urgent services if needed.",
      "3. Protect medicines: keep fridge closed; record outage duration; quarantine if temperature integrity uncertain.",
      "4. Maintain confidentiality during manual processing; secure papers.",
      "5. After power returns: capture downtime records into the main system; review any incidents.",
      "---",
      "RECORDS / EVIDENCE",
      "- Downtime forms.",
      "- Fridge temp log/outage note.",
      "- Incident log if applicable.",
      "---",
      "MONITORING, AUDIT & REVIEW",
      "- Annual drill/review of downtime readiness.",
    ] });
    docs.push({folder:"06_ADVANCED", file:`05_Telemedicine_Workflow_Privacy_SOP_2026.pdf`, title:"Telemedicine Workflow & Privacy SOP", type:"text", lines:[
      "PURPOSE",
      "To provide safe telemedicine consultations with privacy and proper documentation.",
      "---",
      "SCOPE",
      "Applies when the practice offers telemedicine (e.g., myCG).",
      "---",
      "RESPONSIBILITIES",
      "- Clinician: clinical decision-making, consent, documentation.",
      "- Admin: booking support and patient instructions.",
      "---",
      "PROCEDURE (STEP-BY-STEP)",
      "1. Confirm patient identity using at least two identifiers.",
      "2. Obtain consent for telemedicine and explain limitations; document consent.",
      "3. Ensure the patient is in a private setting; clinician uses a private room/headset.",
      "4. Conduct consultation; document history, advice, and safety-net instructions.",
      "5. Prescribe/referral only when clinically appropriate; advise in-person review when needed.",
      "6. Store records securely and avoid sharing sensitive data through unsecured channels.",
      "---",
      "RECORDS / EVIDENCE",
      "- Telemedicine consent note.",
      "- Clinical record entry.",
      "- Messages sent (where stored securely).",
      "---",
      "MONITORING, AUDIT & REVIEW",
      "- Quarterly audit of telemedicine records for consent and documentation.",
    ] });
    }






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
