/* SibelPlanner Renderer (GitHub/Windows-freundlich ohne Bundler)
   - pdf.js und pdf-lib werden als UMD Scripts aus node_modules geladen
*/

(function () {
  const pdfjsLib = window.pdfjsLib;
  const { PDFDocument } = window.PDFLib;

  const el = (id) => document.getElementById(id);
  const statusEl = el("status");
  const pageChip = el("pageChip");
  const zoomChip = el("zoomChip");
  const invEl = el("inv");

  const pdfCanvas = el("pdfCanvas");
  const overlay = el("overlay");
  const wrap = el("canvasWrap");
  const pdfCtx = pdfCanvas.getContext("2d");
  const ctx = overlay.getContext("2d");

  const selLabelEl = el("selLabel");
  const selPhaseEl = el("selPhase");
  const selGroupEl = el("selGroup");

  const circuitNameEl = el("circuitName");
  const circuitSelectEl = el("circuitSelect");

  const tools = {
    select: el("toolSelect"),
    pan: el("toolPan"),
    route: el("toolRoute"),
    symbol: el("toolSymbol"),
    text: el("toolText"),
  };
  let tool = "select";

  // PDF state
  let pdfBytes = null;
  let pdfDoc = null; // pdf.js document
  let pageIndex = 0;
  let renderScale = 1.25;

  // View transform
  let view = { zoom: 1, panX: 0, panY: 0 };

  // Project state
  let project = {
    version: 1,
    circuits: ["SB-1"],
    activeCircuit: "SB-1",
    ann: {} // per page objects
  };

  // Interaction
  let pointerDown = false;
  let dragging = false;
  let dragStart = { x: 0, y: 0, panX: 0, panY: 0 };
  let dragObjOffset = { x: 0, y: 0 };
  let selectedId = null;
  let drawingRouteId = null;

  // Symbols
  const symbolDefs = [
    { id:"RZ_NONE", name:"Rettungszeichen (ohne Pfeil)", base:"assets/symbols/rz_iso_base.svg", overlay:"assets/symbols/arrow_none.svg", kind:"RZL" },
    { id:"RZ_LEFT", name:"Rettungszeichen ←", base:"assets/symbols/rz_iso_base.svg", overlay:"assets/symbols/arrow_left.svg", kind:"RZL" },
    { id:"RZ_RIGHT", name:"Rettungszeichen →", base:"assets/symbols/rz_iso_base.svg", overlay:"assets/symbols/arrow_right.svg", kind:"RZL" },
    { id:"RZ_UP", name:"Rettungszeichen ↑", base:"assets/symbols/rz_iso_base.svg", overlay:"assets/symbols/arrow_up.svg", kind:"RZL" },
    { id:"RZ_DOWN", name:"Rettungszeichen ↓", base:"assets/symbols/rz_iso_base.svg", overlay:"assets/symbols/arrow_down.svg", kind:"RZL" },
    { id:"RZ_UL", name:"Rettungszeichen ↖", base:"assets/symbols/rz_iso_base.svg", overlay:"assets/symbols/arrow_upleft.svg", kind:"RZL" },
    { id:"RZ_UR", name:"Rettungszeichen ↗", base:"assets/symbols/rz_iso_base.svg", overlay:"assets/symbols/arrow_upright.svg", kind:"RZL" },
    { id:"RZ_DL", name:"Rettungszeichen ↙", base:"assets/symbols/rz_iso_base.svg", overlay:"assets/symbols/arrow_downleft.svg", kind:"RZL" },
    { id:"RZ_DR", name:"Rettungszeichen ↘", base:"assets/symbols/rz_iso_base.svg", overlay:"assets/symbols/arrow_downright.svg", kind:"RZL" },

    { id:"CUBE_RIGHT", name:"Würfel-Pfeil →", base:"assets/symbols/cube_arrow_right.svg", kind:"RZL" },
    { id:"CUBE_LEFT", name:"Würfel-Pfeil ←", base:"assets/symbols/cube_arrow_left.svg", kind:"RZL" },

    { id:"NL", name:"Notleuchte (Decke)", base:"assets/symbols/lamp_emergency_ceiling.svg", kind:"NL" },
    { id:"NL_WALL", name:"Notleuchte (Wand)", base:"assets/symbols/lamp_emergency_wall.svg", kind:"NL" },
    { id:"EL", name:"Einzelleuchte (EL)", base:"assets/symbols/el_generic.svg", kind:"EL" },
    { id:"RZL_BOX", name:"Rettungszeichenleuchte (Box)", base:"assets/symbols/lamp_exit_box.svg", kind:"RZL" },
  ];

  let activeSymbolId = "RZ_RIGHT";
  const symGrid = el("symGrid");
  const imgCache = new Map(); // symbolId -> Image

  function setStatus(msg){ statusEl.textContent = msg; }
  function uuid(){ return Math.random().toString(16).slice(2) + Date.now().toString(16); }

  function setTool(t){
    tool = t;
    Object.keys(tools).forEach(k => tools[k].classList.toggle("on", k===t));
    if (t !== "route") drawingRouteId = null;
    setStatus(`Tool: ${t}`);
    renderOverlay();
  }

  function curPage(){
    if (!project.ann[pageIndex]) project.ann[pageIndex] = { objects: [] };
    return project.ann[pageIndex];
  }

  function updateZoomChip(){ zoomChip.textContent = `${Math.round(view.zoom*100)}%`; }

  function screenToWorld(clientX, clientY){
    const r = overlay.getBoundingClientRect();
    const x = (clientX - r.left) * (overlay.width / r.width);
    const y = (clientY - r.top) * (overlay.height / r.height);
    return { x: (x - view.panX) / view.zoom, y: (y - view.panY) / view.zoom };
  }

  function distToSeg(p, a, b){
    const vx = b.x - a.x, vy = b.y - a.y;
    const wx = p.x - a.x, wy = p.y - a.y;
    const c1 = vx*wx + vy*wy;
    if (c1 <= 0) return Math.hypot(p.x-a.x, p.y-a.y);
    const c2 = vx*vx + vy*vy;
    if (c2 <= c1) return Math.hypot(p.x-b.x, p.y-b.y);
    const t = c1 / c2;
    const px = a.x + t*vx, py = a.y + t*vy;
    return Math.hypot(p.x-px, p.y-py);
  }

  function hitTest(world){
    const objs = curPage().objects;
    for (let i = objs.length - 1; i >= 0; i--){
      const o = objs[i];
      if (o.type === "symbol"){
        if (world.x >= o.x - o.w/2 && world.x <= o.x + o.w/2 &&
            world.y >= o.y - o.h/2 && world.y <= o.y + o.h/2) return o.id;
      }
      if (o.type === "text"){
        const w = (o.text.length * o.size) * 0.6;
        const h = o.size * 1.2;
        if (world.x >= o.x && world.x <= o.x + w &&
            world.y >= o.y - h && world.y <= o.y) return o.id;
      }
      if (o.type === "route"){
        for (let j=0; j<o.points.length-1; j++){
          if (distToSeg(world, o.points[j], o.points[j+1]) < 10) return o.id;
        }
      }
    }
    return null;
  }

  function bringToFront(id){
    const objs = curPage().objects;
    const idx = objs.findIndex(o => o.id === id);
    if (idx >= 0){
      const [o] = objs.splice(idx, 1);
      objs.push(o);
    }
  }

  function select(id){
    selectedId = id;
    const o = curPage().objects.find(x => x.id === selectedId);
    selLabelEl.value = o?.label || "";
    selPhaseEl.value = o?.phase || "";
    selGroupEl.value = o?.group || "";
    renderOverlay();
  }

  async function svgToImage(svgText){
    const blob = new Blob([svgText], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.decoding = "async";
    await new Promise((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("SVG load error"));
      img.src = url;
    });
    // keep URL for reuse (do not revoke)
    return img;
  }

  function extractInner(svg){ return svg.replace(/^.*?<svg[^>]*>/s,"").replace(/<\/svg>\s*$/s,""); }

  async function buildSymbolImage(def){
    const baseText = await fetch(def.base).then(r=>r.text());
    if (!def.overlay) return await svgToImage(baseText);
    const overlayText = await fetch(def.overlay).then(r=>r.text());
    const merged = baseText.replace(/<\/svg>\s*$/s, `  <g>${extractInner(overlayText)}</g>\n</svg>`);
    return await svgToImage(merged);
  }

  async function ensureCache(){
    for (const def of symbolDefs){
      if (!imgCache.has(def.id)){
        const img = await buildSymbolImage(def);
        imgCache.set(def.id, img);
      }
    }
  }

  function rebuildSymbolGrid(){
    symGrid.innerHTML = "";
    for (const def of symbolDefs){
      const card = document.createElement("div");
      card.className = "thumb" + (def.id === activeSymbolId ? " on" : "");
      const img = document.createElement("img");
      const cached = imgCache.get(def.id);
      if (cached) img.src = cached.src;
      img.alt = def.name;
      card.appendChild(img);
      const lab = document.createElement("div");
      lab.textContent = def.name;
      card.appendChild(lab);
      card.addEventListener("click", () => {
        activeSymbolId = def.id;
        rebuildSymbolGrid();
        setStatus(`Symbol: ${def.name}`);
      });
      symGrid.appendChild(card);
    }
  }

  function clearOverlay(){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,overlay.width,overlay.height);
  }

  function formatCircuitLabel(baseLabel, circuit){
    if (!circuit) return baseLabel || "";
    if (!baseLabel) return `(${circuit})`;
    if (baseLabel.includes(`(${circuit})`)) return baseLabel;
    return `${baseLabel} (${circuit})`;
  }

  function renderOverlay(){
    clearOverlay();
    ctx.setTransform(view.zoom, 0, 0, view.zoom, view.panX, view.panY);

    const objs = curPage().objects;
    for (const o of objs){
      const isSel = o.id === selectedId;

      if (o.type === "route"){
        ctx.save();
        ctx.lineWidth = 5;
        ctx.strokeStyle = isSel ? "#22c55e" : "#38bdf8";
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        o.points.forEach((p, idx) => idx ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
        ctx.stroke();
        ctx.fillStyle = isSel ? "#22c55e" : "#38bdf8";
        o.points.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI*2); ctx.fill(); });
        ctx.restore();
        continue;
      }

      if (o.type === "text"){
        ctx.save();
        ctx.fillStyle = isSel ? "#22c55e" : "#e5e7eb";
        ctx.font = `bold ${o.size}px system-ui`;
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(o.text, o.x, o.y);
        ctx.restore();
        continue;
      }

      if (o.type === "symbol"){
        const img = imgCache.get(o.symbolId);
        if (!img) continue;
        ctx.save();
        ctx.translate(o.x, o.y);
        ctx.rotate((o.rot||0) * Math.PI/180);
        ctx.drawImage(img, -o.w/2, -o.h/2, o.w, o.h);
        if (isSel){
          ctx.strokeStyle = "#22c55e";
          ctx.lineWidth = 3;
          ctx.strokeRect(-o.w/2, -o.h/2, o.w, o.h);
        }
        ctx.restore();

        const label = formatCircuitLabel(o.label, o.circuit);
        if (label){
          ctx.save();
          ctx.fillStyle = "#cbd5e1";
          ctx.font = "12px system-ui";
          ctx.textAlign = "center";
          ctx.fillText(label, o.x, o.y + o.h/2 + 16);
          ctx.restore();
        }
        if (o.phase || o.group){
          const t = [o.phase, o.group].filter(Boolean).join(" · ");
          ctx.save();
          ctx.fillStyle = "#94a3b8";
          ctx.font = "10px system-ui";
          ctx.textAlign = "center";
          ctx.fillText(t, o.x, o.y + o.h/2 + 30);
          ctx.restore();
        }
      }
    }

    updateInventory();
  }

  function updateInventory(){
    const objs = curPage().objects;
    const bySymbol = {};
    const byCircuit = {};
    for (const o of objs){
      if (o.type === "symbol"){
        bySymbol[o.symbolId] = (bySymbol[o.symbolId]||0)+1;
        const c = o.circuit || "—";
        byCircuit[c] = (byCircuit[c]||0)+1;
      }
    }
    const symLines = Object.entries(bySymbol).map(([sid, n]) => {
      const def = symbolDefs.find(d=>d.id===sid);
      const name = def ? def.name : sid;
      return `<div class="item"><div><b>${name}</b><small>${sid}</small></div><div><span class="chip">${n}</span></div></div>`;
    }).join("");
    const cirLines = Object.entries(byCircuit).map(([c, n]) =>
      `<div class="item"><div><b>Stromkreis</b><small>${c}</small></div><div><span class="chip">${n}</span></div></div>`
    ).join("");

    invEl.innerHTML = symLines + cirLines + `
      <div class="item"><div><b>Fluchtwege</b><small>Route</small></div><div><span class="chip">${objs.filter(o=>o.type==='route').length}</span></div></div>
      <div class="item"><div><b>Texte</b><small>Label</small></div><div><span class="chip">${objs.filter(o=>o.type==='text').length}</span></div></div>
    `;
  }

  async function renderPdfPage(){
    if (!pdfDoc) return;
    const page = await pdfDoc.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: renderScale });

    pdfCanvas.width = Math.floor(viewport.width);
    pdfCanvas.height = Math.floor(viewport.height);
    overlay.width = pdfCanvas.width;
    overlay.height = pdfCanvas.height;

    view.zoom = 1; view.panX = 0; view.panY = 0; updateZoomChip();

    await page.render({ canvasContext: pdfCtx, viewport }).promise;
    renderOverlay();
    pageChip.textContent = `Seite ${pageIndex+1} / ${pdfDoc.numPages}`;
  }

  function deleteSelected(){
    if (!selectedId) return;
    const objs = curPage().objects;
    const idx = objs.findIndex(o => o.id === selectedId);
    if (idx >= 0) objs.splice(idx, 1);
    selectedId = null;
    selLabelEl.value = ""; selPhaseEl.value=""; selGroupEl.value="";
    setStatus("Gelöscht");
    renderOverlay();
  }

  // ===== Stromkreise =====
  function rebuildCircuitSelect(){
    circuitSelectEl.innerHTML = "";
    for (const c of project.circuits){
      const opt = document.createElement("option");
      opt.value = c; opt.textContent = c;
      circuitSelectEl.appendChild(opt);
    }
    circuitSelectEl.value = project.activeCircuit || project.circuits[0] || "";
  }

  function addCircuit(name){
    const n = (name||"").trim();
    if (!n) return;
    if (!project.circuits.includes(n)) project.circuits.push(n);
    project.activeCircuit = n;
    rebuildCircuitSelect();
  }

  function assignSelectedToCircuit(circuit){
    if (!selectedId) { alert("Bitte erst ein Symbol auswählen."); return; }
    const o = curPage().objects.find(x => x.id === selectedId);
    if (!o || o.type !== "symbol") { alert("Nur Symbole können Stromkreise bekommen."); return; }
    o.circuit = circuit;
    project.activeCircuit = circuit;
    rebuildCircuitSelect();
    renderOverlay();
  }

  function autoLabelPage(){
    const objs = curPage().objects.filter(o=>o.type==="symbol");
    const counters = {};
    for (const o of objs){
      const def = symbolDefs.find(d=>d.id===o.symbolId);
      const kind = def?.kind || "SYM";
      const c = o.circuit || project.activeCircuit || "—";
      const key = `${kind}::${c}`;
      counters[key] = (counters[key]||0) + 1;
      const idx = counters[key];
      o.label = `${kind}-${String(idx).padStart(2,'0')}`;
    }
    setStatus("Auto-Label fertig");
    renderOverlay();
  }

  function addLegend(){
    const objs = curPage().objects.filter(o=>o.type==="symbol");
    const byC = {};
    for (const o of objs){
      const c = o.circuit || "—";
      byC[c] = (byC[c]||0)+1;
    }
    const lines = Object.entries(byC).map(([c,n]) => `${c}: ${n} Leuchten`).join("\n");
    const text = `Legende Sicherheitsbeleuchtung\n${lines || "—"}`;
    curPage().objects.push({ id: uuid(), type:"text", x: 40, y: 60, text, size: 14 });
    setStatus("Legende gesetzt");
    renderOverlay();
  }

  function exportCsv(){
    const objs = curPage().objects.filter(o=>o.type==="symbol");
    const rows = [["page","symbolId","label","circuit","phase","group","x","y","w","h","rot"]];
    for (const o of objs){
      rows.push([
        String(pageIndex+1),
        o.symbolId,
        (o.label||""),
        (o.circuit||""),
        (o.phase||""),
        (o.group||""),
        String(Math.round(o.x)), String(Math.round(o.y)),
        String(o.w), String(o.h),
        String(o.rot||0),
      ]);
    }
    const csv = rows.map(r => r.map(v => `"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type:"text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.download = `sibel_page_${pageIndex+1}.csv`;
    a.href = URL.createObjectURL(blob);
    a.click();
    setStatus("CSV exportiert");
  }

  // ===== Export PDF (gerastert) =====
  async function exportPdf(){
    if (!pdfBytes || !pdfDoc){ alert("Bitte zuerst PDF laden."); return; }
    setStatus("Export…");

    const out = await PDFDocument.create();
    const pageCount = pdfDoc.numPages;

    for (let i=0; i<pageCount; i++){
      const page = await pdfDoc.getPage(i + 1);
      const viewport = page.getViewport({ scale: renderScale });

      const tPdf = document.createElement("canvas");
      tPdf.width = Math.floor(viewport.width);
      tPdf.height = Math.floor(viewport.height);
      const tPdfCtx = tPdf.getContext("2d");
      await page.render({ canvasContext: tPdfCtx, viewport }).promise;

      const tOv = document.createElement("canvas");
      tOv.width = tPdf.width;
      tOv.height = tPdf.height;
      const tOvCtx = tOv.getContext("2d");

      const objs = (project.ann[i]?.objects) || [];
      for (const o of objs){
        if (o.type === "route"){
          tOvCtx.save();
          tOvCtx.lineWidth = 5;
          tOvCtx.strokeStyle = "#38bdf8";
          tOvCtx.lineCap = "round";
          tOvCtx.lineJoin = "round";
          tOvCtx.beginPath();
          o.points.forEach((p, idx) => idx ? tOvCtx.lineTo(p.x, p.y) : tOvCtx.moveTo(p.x, p.y));
          tOvCtx.stroke();
          tOvCtx.restore();
        } else if (o.type === "text"){
          tOvCtx.save();
          tOvCtx.fillStyle = "#e5e7eb";
          tOvCtx.font = `bold ${o.size}px system-ui`;
          tOvCtx.fillText(o.text, o.x, o.y);
          tOvCtx.restore();
        } else if (o.type === "symbol"){
          const img = imgCache.get(o.symbolId);
          if (img){
            tOvCtx.save();
            tOvCtx.translate(o.x, o.y);
            tOvCtx.rotate((o.rot||0) * Math.PI/180);
            tOvCtx.drawImage(img, -o.w/2, -o.h/2, o.w, o.h);
            tOvCtx.restore();
            const label = formatCircuitLabel(o.label, o.circuit);
            if (label){
              tOvCtx.save();
              tOvCtx.fillStyle = "#cbd5e1";
              tOvCtx.font = "12px system-ui";
              tOvCtx.textAlign = "center";
              tOvCtx.fillText(label, o.x, o.y + o.h/2 + 16);
              tOvCtx.restore();
            }
          }
        }
      }

      const tFinal = document.createElement("canvas");
      tFinal.width = tPdf.width;
      tFinal.height = tPdf.height;
      const tFinalCtx = tFinal.getContext("2d");
      tFinalCtx.drawImage(tPdf, 0, 0);
      tFinalCtx.drawImage(tOv, 0, 0);

      const pngUrl = tFinal.toDataURL("image/png");
      const pngBytes = await fetch(pngUrl).then(r => r.arrayBuffer());
      const png = await out.embedPng(pngBytes);
      const outPage = out.addPage([tFinal.width, tFinal.height]);
      outPage.drawImage(png, { x:0, y:0, width:tFinal.width, height:tFinal.height });
    }

    const outBytes = await out.save();
    const blob = new Blob([outBytes], { type:"application/pdf" });
    const a = document.createElement("a");
    a.download = "sicherheitsbeleuchtung_annotiert.pdf";
    a.href = URL.createObjectURL(blob);
    a.click();
    setStatus("Export fertig");
  }

  // ===== UI wiring =====
  Object.keys(tools).forEach(k => tools[k].addEventListener("click", () => setTool(k)));
  el("btnDelete").addEventListener("click", deleteSelected);

  el("btnZoomIn").addEventListener("click", () => { view.zoom = Math.min(4, view.zoom + 0.1); updateZoomChip(); renderOverlay(); });
  el("btnZoomOut").addEventListener("click", () => { view.zoom = Math.max(0.2, view.zoom - 0.1); updateZoomChip(); renderOverlay(); });

  el("btnPrev").addEventListener("click", async () => {
    if (!pdfDoc) return;
    pageIndex = Math.max(0, pageIndex - 1);
    selectedId = null; drawingRouteId = null;
    await renderPdfPage();
  });
  el("btnNext").addEventListener("click", async () => {
    if (!pdfDoc) return;
    pageIndex = Math.min(pdfDoc.numPages - 1, pageIndex + 1);
    selectedId = null; drawingRouteId = null;
    await renderPdfPage();
  });

  selLabelEl.addEventListener("input", () => {
    if (!selectedId) return;
    const o = curPage().objects.find(x => x.id === selectedId);
    if (!o) return;
    o.label = selLabelEl.value;
    renderOverlay();
  });
  selPhaseEl.addEventListener("input", () => {
    if (!selectedId) return;
    const o = curPage().objects.find(x => x.id === selectedId);
    if (!o) return;
    o.phase = selPhaseEl.value;
    renderOverlay();
  });
  selGroupEl.addEventListener("input", () => {
    if (!selectedId) return;
    const o = curPage().objects.find(x => x.id === selectedId);
    if (!o) return;
    o.group = selGroupEl.value;
    renderOverlay();
  });

  el("btnRotateObj").addEventListener("click", () => {
    if (!selectedId) return;
    const o = curPage().objects.find(x => x.id === selectedId);
    if (!o || o.type !== "symbol") return;
    o.rot = ((o.rot||0) + 90) % 360;
    renderOverlay();
  });

  el("btnAddCircuit").addEventListener("click", () => {
    addCircuit(circuitNameEl.value);
    circuitNameEl.value = "";
    setStatus("Stromkreis hinzugefügt");
  });
  circuitSelectEl.addEventListener("change", () => { project.activeCircuit = circuitSelectEl.value; });
  el("btnAssignCircuit").addEventListener("click", () => assignSelectedToCircuit(circuitSelectEl.value));
  el("btnAutoLabel").addEventListener("click", autoLabelPage);
  el("btnLegend").addEventListener("click", addLegend);

  el("btnExportCsv").addEventListener("click", exportCsv);
  el("btnExport").addEventListener("click", exportPdf);

  // PDF load
  el("filePdf").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try{
      pdfBytes = new Uint8Array(await f.arrayBuffer());
      pdfDoc = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
      pageIndex = 0;
      project.ann = {};
      selectedId = null;
      drawingRouteId = null;
      await ensureCache();
      rebuildSymbolGrid();
      rebuildCircuitSelect();
      setStatus("PDF geladen");
      await renderPdfPage();
    } catch (err){
      console.error(err);
      alert("PDF konnte nicht geladen werden. (Ist es evtl. passwortgeschützt?)");
      setStatus("PDF Fehler");
    } finally {
      // allow selecting the same file again
      e.target.value = "";
    }
  });

  // Project save/load
  el("btnSave").addEventListener("click", () => {
    const data = {
      version: 1,
      savedAt: new Date().toISOString(),
      circuits: project.circuits,
      activeCircuit: project.activeCircuit,
      ann: project.ann,
      pageIndex,
      renderScale,
      activeSymbolId
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type:"application/json" });
    const a = document.createElement("a");
    a.download = "sibel_projekt.json";
    a.href = URL.createObjectURL(blob);
    a.click();
    setStatus("Projekt gespeichert (PDF separat)");
  });

  el("fileProject").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try{
      const data = JSON.parse(await f.text());
      project.circuits = data.circuits || project.circuits;
      project.activeCircuit = data.activeCircuit || project.activeCircuit;
      project.ann = data.ann || {};
      pageIndex = data.pageIndex || 0;
      renderScale = data.renderScale || renderScale;
      activeSymbolId = data.activeSymbolId || activeSymbolId;
      selectedId = null;
      drawingRouteId = null;
      await ensureCache();
      rebuildSymbolGrid();
      rebuildCircuitSelect();
      setStatus("Projekt geladen (PDF auch laden)");
      renderOverlay();
    } catch (err){
      console.error(err);
      alert("Projekt-JSON ungültig.");
    } finally {
      e.target.value = "";
    }
  });

  // Canvas interaction
  overlay.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    pointerDown = true;
    overlay.setPointerCapture(e.pointerId);
    const world = screenToWorld(e.clientX, e.clientY);

    // double-tap ends route
    if (tool === "route"){
      const now = Date.now();
      overlay._lastTap = overlay._lastTap || 0;
      const dt = now - overlay._lastTap;
      overlay._lastTap = now;
      if (dt < 320 && drawingRouteId){
        drawingRouteId = null;
        setStatus("Fluchtweg beendet");
        renderOverlay();
        return;
      }
    }

    if (tool === "select"){
      const hit = hitTest(world);
      if (hit){
        bringToFront(hit);
        select(hit);
        const o = curPage().objects.find(x => x.id === hit);
        if (o && o.type !== "route"){
          dragObjOffset.x = world.x - o.x;
          dragObjOffset.y = world.y - o.y;
        }
        dragging = true;
      } else {
        select(null);
      }
      return;
    }

    if (tool === "pan"){
      dragging = true;
      dragStart = { x: e.clientX, y: e.clientY, panX: view.panX, panY: view.panY };
      return;
    }

    if (tool === "text"){
      const t = prompt("Text:", "Hinweis / Beschriftung");
      if (!t) return;
      const id = uuid();
      curPage().objects.push({ id, type:"text", x:world.x, y:world.y, text:t, size:18 });
      select(id);
      renderOverlay();
      return;
    }

    if (tool === "route"){
      if (!drawingRouteId){
        const id = uuid();
        curPage().objects.push({ id, type:"route", points:[{x:world.x, y:world.y}] });
        drawingRouteId = id;
        select(id);
        setStatus("Fluchtweg gestartet");
      } else {
        const o = curPage().objects.find(x => x.id === drawingRouteId);
        if (o) o.points.push({x:world.x, y:world.y});
      }
      renderOverlay();
      return;
    }

    if (tool === "symbol"){
      const def = symbolDefs.find(d => d.id === activeSymbolId);
      if (!def) return;
      const id = uuid();
      const isCube = def.id.startsWith("CUBE");
      const w = isCube ? 70 : 90;
      const h = isCube ? 70 : 60;
      curPage().objects.push({
        id, type:"symbol", symbolId:def.id,
        x: world.x, y: world.y,
        w, h, rot: 0,
        label: "",
        circuit: project.activeCircuit,
        phase: "",
        group: "",
        kind: def.kind
      });
      select(id);
      renderOverlay();
      return;
    }
  });

  overlay.addEventListener("pointermove", (e) => {
    if (!pointerDown || !dragging) return;

    if (tool === "pan"){
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      const r = overlay.getBoundingClientRect();
      view.panX = dragStart.panX + dx * (overlay.width / r.width);
      view.panY = dragStart.panY + dy * (overlay.height / r.height);
      renderOverlay();
      return;
    }

    if (tool === "select" && selectedId){
      const world = screenToWorld(e.clientX, e.clientY);
      const o = curPage().objects.find(x => x.id === selectedId);
      if (!o) return;
      if (o.type === "route"){
        const prev = screenToWorld(e.clientX - e.movementX, e.clientY - e.movementY);
        const dx = world.x - prev.x;
        const dy = world.y - prev.y;
        o.points = o.points.map(p => ({ x:p.x+dx, y:p.y+dy }));
      } else {
        o.x = world.x - dragObjOffset.x;
        o.y = world.y - dragObjOffset.y;
      }
      renderOverlay();
    }
  });

  overlay.addEventListener("pointerup", (e) => {
    pointerDown = false;
    dragging = false;
    try { overlay.releasePointerCapture(e.pointerId); } catch {}
  });

  // ctrl+wheel zoom
  wrap.addEventListener("wheel", (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const delta = -Math.sign(e.deltaY) * 0.1;
    view.zoom = Math.max(0.2, Math.min(4, view.zoom + delta));
    updateZoomChip();
    renderOverlay();
  }, { passive:false });

  // Init
  setTool("select");
  setStatus("Bereit – PDF laden");
  updateZoomChip();

  (async () => {
    try{
      rebuildCircuitSelect();
      await ensureCache();
      rebuildSymbolGrid();
    } catch (err){
      console.error(err);
      alert("Fehler beim Laden der Symbolbibliothek. Bitte 'npm install' ausführen.");
    }
  })();

})();
