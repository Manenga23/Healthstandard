(function(){
  const $=(id)=>document.getElementById(id);
  async function postJSON(url,data){
    const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    if(!res.ok){ throw new Error(await res.text()); }
    return res;
  }
  function formToJSON(form){
    const data={};
    new FormData(form).forEach((v,k)=>{data[k]=v;});
    return data;
  }
  const f=$("instantForm");
  if(f){
    f.addEventListener("submit", async (e)=>{
      e.preventDefault();
      const out=$("out");
      const btn=$("btnGenerate");
      const link=$("downloadLink");
      btn.disabled=true; link.style.display="none"; out.textContent="Generating master ZIP…";
      try{
        const payload=formToJSON(f);
        const res=await postJSON("/.netlify/functions/generate-pack", payload);
        const blob=await res.blob();
        const url=URL.createObjectURL(blob);
        link.href=url;
        link.download=res.headers.get("x-filename")||"OHSC_MasterPack.zip";
        link.style.display="inline-flex";
        out.textContent="Done. Download your ZIP below.";
      }catch(err){
        out.textContent="Error: "+(err?.message||String(err));
      }finally{
        btn.disabled=false;
      }
    });
  }
})();