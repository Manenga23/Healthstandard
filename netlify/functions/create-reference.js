
exports.handler = async (event) => {
  try{
    const data = JSON.parse(event.body || "{}");
    const pack = String(data.selected_pack || "MASTER").toUpperCase();
    const stamp = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).slice(2,6).toUpperCase();
    const ref = `OHSC-${pack}-${stamp}${rand}`;
    return {
      statusCode: 200,
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ reference: ref })
    };
  } catch(e){
    return { statusCode: 400, body: JSON.stringify({error:"Bad request"}) };
  }
};
