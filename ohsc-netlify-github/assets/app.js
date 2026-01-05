(function(){
  const $ = (id)=>document.getElementById(id);

  async function postJSON(url, data){
    const res = await fetch(url, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(data)
    });
    if(!res.ok){
      const t = await res.text();
      throw new Error(t || ('HTTP '+res.status));
    }
    return res;
  }

  function formToJSON(form){
    const data = {};
    new FormData(form).forEach((v,k)=>{
      if(data[k]){
        if(!Array.isArray(data[k])) data[k]=[data[k]];
        data[k].push(v);
      } else data[k]=v;
    });
    return data;
  }

  // Optional: client-side preview + server-generated ZIP
  const previewForm = $("ohscPreviewForm");
  if(previewForm){
    previewForm.addEventListener("submit", async (e)=>{
      e.preventDefault();
      const btn = $("btnGenerate");
      const out = $("out");
      const link = $("downloadLink");
      btn.disabled = true;
      out.textContent = "Generating your pack…";
      link.style.display = "none";
      try{
        const payload = formToJSON(previewForm);
        // Call Netlify Function (works locally on Netlify dev, and on deploy via /.netlify/functions/)
        const res = await postJSON("/.netlify/functions/generate-pack", payload);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.download = res.headers.get("x-filename") || "OHSC_COMPLIANCE.zip";
        link.style.display = "inline-flex";
        out.textContent = "Done. Download your ZIP below.";
      }catch(err){
        out.textContent = "Error: " + (err?.message || String(err));
      }finally{
        btn.disabled = false;
      }
    });
  }
})();
