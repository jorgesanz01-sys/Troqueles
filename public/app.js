const App = {
    datos: [], seleccionados: new Set(), filtroTipo: 'TODOS',
    mapaCat: {}, mapaFam: {}, columnaOrden: 'id_troquel', ordenAsc: true,
    scanner: null, modoMovil: false, archivosActuales: [],
    escaneadosLote: new Map(), enPapelera: false,

    init: async () => {
        console.log("Iniciando ERP V12...");
        await App.cargarSelects(); // Importante: Cargar diccionario antes
        await App.cargarTodo();
    },

    // --- CARGA ---
    cargarTodo: async (papelera = false) => {
        try {
            App.enPapelera = papelera;
            const res = await fetch(`/api/troqueles?ver_papelera=${papelera}`);
            if(res.ok) {
                App.datos = await res.json();
                App.renderTabla();
                document.getElementById('titulo-lista').innerText = papelera ? "🗑️ PAPELERA" : "Inventario Activo";
                const btn = document.getElementById('btn-restaurar-papelera');
                const panel = document.getElementById('panel-acciones');
                if(papelera) { btn.classList.remove('oculto'); panel.classList.add('oculto'); }
                else { btn.classList.add('oculto'); }
            }
        } catch (e) { console.error(e); }
    },

    cargarSelects: async () => {
        try {
            const [cats, fams] = await Promise.all([
                fetch('/api/categorias').then(r=>r.json()), 
                fetch('/api/familias').then(r=>r.json())
            ]);
            
            App.mapaCat = {}; App.mapaFam = {};
            cats.forEach(c => App.mapaCat[c.id] = c.nombre);
            fams.forEach(f => App.mapaFam[f.id] = f.nombre);

            // Chips
            const divChips = document.getElementById('chips-tipos');
            divChips.innerHTML = `<button class="chip activo" onclick="App.setFiltroTipo('TODOS', this)">TODOS</button>`;
            cats.forEach(c => divChips.innerHTML += `<button class="chip" onclick="App.setFiltroTipo('${c.nombre}', this)">${c.nombre}</button>`);

            // Selects
            const llenar = (id, data) => {
                const el = document.getElementById(id);
                if(el) {
                    const prev = el.value;
                    el.innerHTML = id.includes('fam') ? '<option value="">Sin Familia/Todas</option>' : '<option value="">Seleccionar...</option>';
                    data.forEach(d => el.innerHTML += `<option value="${d.id}">${d.nombre}</option>`);
                    if(prev) el.value = prev;
                }
            };
            llenar('f-cat', cats); llenar('bulk-tipo', cats);
            llenar('f-fam', fams); llenar('bulk-familia', fams); llenar('filtro-familia', fams);

        } catch(e) { console.error(e); }
    },

    // --- RENDER TABLA ---
    renderTabla: () => {
        const tbody = document.getElementById('tabla-body');
        const txt = document.getElementById('buscador').value.toLowerCase();
        const fam = document.getElementById('filtro-familia').value;
        const est = document.getElementById('filtro-estado').value;

        let filtrados = App.datos.filter(t => {
            const nCat = App.mapaCat[t.categoria_id] || '';
            const nFam = App.mapaFam[t.familia_id] || '';
            
            const okTipo = App.filtroTipo === 'TODOS' || nCat === App.filtroTipo;
            // Comparación laxa (==) para que '5' == 5
            const okFam = fam === 'TODAS' || t.familia_id == fam;
            const okEst = est === 'TODOS' || (t.estado || 'EN ALMACEN') === est;
            const okTxt = (t.nombre+t.id_troquel+t.ubicacion).toLowerCase().includes(txt);
            
            return okTipo && okFam && okEst && okTxt;
        });

        filtrados.sort((a, b) => {
            let vA = (a[App.columnaOrden] || "").toString(); let vB = (b[App.columnaOrden] || "").toString();
            if(App.columnaOrden==='familia') { vA = App.mapaFam[a.familia_id]||""; vB = App.mapaFam[b.familia_id]||""; }
            const nA = parseFloat(vA); const nB = parseFloat(vB);
            if(!isNaN(nA) && !isNaN(nB) && !vA.match(/[a-z]/i)) return App.ordenAsc ? nA - nB : nB - nA;
            return App.ordenAsc ? vA.localeCompare(vB) : vB.localeCompare(vA);
        });

        if(filtrados.length===0) { tbody.innerHTML = '<tr><td colspan="8" style="padding:20px; text-align:center">Sin datos</td></tr>'; return; }

        tbody.innerHTML = filtrados.map(t => {
            const chk = App.seleccionados.has(t.id) ? 'checked' : '';
            const nDocs = (t.archivos && Array.isArray(t.archivos)) ? t.archivos.length : 0;
            const docBadge = nDocs > 0 ? `<span class="obs-pildora" style="background:#e0f2fe; color:#0369a1;">📎 ${nDocs}</span>` : '-';
            
            let stHtml = `<span style="background:#dcfce7; color:#166534; padding:2px 6px; border-radius:10px; font-size:10px; font-weight:700;">ALMACÉN</span>`;
            if(t.estado==='EN PRODUCCION') stHtml = `<span style="background:#fee2e2; color:#991b1b; padding:2px 6px; border-radius:10px; font-size:10px; font-weight:700;">PROD.</span>`;
            if(t.estado==='DESCATALOGADO') stHtml = `<span style="background:#f3f4f6; color:#6b7280; padding:2px 6px; border-radius:10px; font-size:10px; font-weight:700;">BAJA</span>`;

            // Si falla el mapa, mostramos el ID en rojo
            let famStr = App.mapaFam[t.familia_id];
            if(!famStr && t.familia_id) famStr = `<span style="color:red;font-weight:bold;">ID:${t.familia_id}</span>`;
            
            let accs = `
                <button class="btn-icono" onclick="App.editar(${t.id})" title="Editar">✏️</button>
                <button class="btn-icono" onclick="App.generarQR('${t.id_troquel}', '${t.ubicacion}', '${t.nombre.replace(/'/g,"")}')">🖨️</button>
                <button class="btn-icono" onclick="App.borrar(${t.id})" style="color:red;">🗑️</button>
            `;
            if(App.enPapelera) accs = `<button class="btn-accion" style="background:#22c55e; padding:5px 10px;" onclick="App.restaurar(${t.id})">♻️</button>`;

            return `
            <tr style="${t.estado==='DESCATALOGADO'?'opacity:0.6':''}">
                <td style="text-align:center;"><input type="checkbox" value="${t.id}" ${chk} onchange="App.select(this, ${t.id})"></td>
                <td style="text-align:center;">${docBadge}</td>
                <td style="text-align:center;">${stHtml}</td>
                <td style="font-weight:900; color:#0f766e;">${t.id_troquel}</td>
                <td>${t.ubicacion}</td>
                <td>${t.nombre}</td>
                <td><small>${famStr || '-'}</small></td>
                <td>${accs}</td>
            </tr>`;
        }).join('');
    },

    // --- ACCIONES AUXILIARES ---
    crearFamilia: async () => {
        const n = prompt("Nueva Familia:"); if(!n) return;
        const res = await fetch('/api/familias', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ nombre: n }) });
        if(res.ok) { const d = await res.json(); await App.cargarSelects(); if(d.data && d.data[0]) document.getElementById('f-fam').value = d.data[0].id; alert("Creada"); }
    },
    crearTipo: async () => {
        const n = prompt("Nuevo Tipo:"); if(!n) return;
        const res = await fetch('/api/categorias', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ nombre: n }) });
        if(res.ok) { const d = await res.json(); await App.cargarSelects(); if(d.data && d.data[0]) document.getElementById('f-cat').value = d.data[0].id; alert("Creado"); }
    },

    // --- MULTI ARCHIVOS ---
    subirArchivos: async (input) => {
        if(!input.files.length) return;
        const btn = input.parentElement; const txt = btn.innerText; btn.innerText = "⏳ ...";
        for (let i = 0; i < input.files.length; i++) {
            const fd = new FormData(); fd.append('file', input.files[i]);
            try { const res = await fetch('/api/subir_foto', { method: 'POST', body: fd }); if(res.ok) { const d = await res.json(); App.archivosActuales.push({ url: d.url, nombre: input.files[i].name, tipo: d.tipo }); } } catch(e){}
        }
        App.renderListaArchivos(); btn.innerText = txt; input.value = "";
    },
    renderListaArchivos: () => {
        const div = document.getElementById('lista-archivos'); div.innerHTML = "";
        App.archivosActuales.forEach((arch, idx) => {
            const icon = arch.tipo === 'pdf' ? '📄' : `<img src="${arch.url}" style="height:30px;">`;
            div.innerHTML += `<div style="display:flex; align-items:center; gap:5px; background:white; padding:5px; border:1px solid #ddd; font-size:11px;"><a href="${arch.url}" target="_blank">${icon}</a><span>${arch.nombre.substring(0,10)}</span><span onclick="App.quitarArchivo(${idx})" style="color:red; cursor:pointer;">✕</span></div>`;
        });
    },
    quitarArchivo: (idx) => { if(confirm("¿Quitar?")) { App.archivosActuales.splice(idx, 1); App.renderListaArchivos(); } },

    // --- CRUD ---
    guardarFicha: async (e) => {
        e.preventDefault();
        const id = document.getElementById('f-id-db').value;
        const d = {
            id_troquel: document.getElementById('f-matricula').value,
            ubicacion: document.getElementById('f-ubicacion').value,
            nombre: document.getElementById('f-nombre').value,
            categoria_id: parseInt(document.getElementById('f-cat').value)||null,
            familia_id: parseInt(document.getElementById('f-fam').value)||null,
            tamano_troquel: document.getElementById('f-medidas-madera').value,
            tamano_final: document.getElementById('f-medidas-corte').value,
            codigos_articulo: document.getElementById('f-arts').value,
            referencias_ot: document.getElementById('f-ot').value,
            observaciones: document.getElementById('f-obs').value,
            archivos: App.archivosActuales
        };
        await fetch(id ? `/api/troqueles/${id}` : '/api/troqueles', { method: id?'PUT':'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(d) });
        App.cargarTodo(); App.volverDesdeForm();
    },
    
    // --- ESCANER (CONTROL) ---
    toggleScanner: (show=true) => {
        const el = document.getElementById('modal-scanner');
        if(show) {
            el.classList.remove('oculto'); App.escaneadosLote.clear(); App.renderListaEscaneados();
            App.scanner = new Html5Qrcode("reader");
            let last = null; let t0 = 0;
            App.scanner.start({facingMode:"environment"}, {fps:10, qrbox:250}, (txt) => {
                if(txt === last && (Date.now() - t0 < 3000)) return; // BLOQUEO 3 SEGUNDOS
                const t = App.datos.find(x => x.id_troquel === txt);
                if(t) {
                    if(!App.escaneadosLote.has(t.id)) { App.escaneadosLote.set(t.id, t); App.renderListaEscaneados(); if(navigator.vibrate) navigator.vibrate(200); }
                    last = txt; t0 = Date.now();
                }
            });
        } else { el.classList.add('oculto'); if(App.scanner) App.scanner.stop(); }
    },
    renderListaEscaneados: () => {
        const div = document.getElementById('lista-escaneados'); div.innerHTML = "";
        document.getElementById('count-scans').innerText = App.escaneadosLote.size;
        App.escaneadosLote.forEach((t, id) => {
            div.innerHTML += `<div class="chip activo" style="background:white; color:black; display:flex; align-items:center; gap:5px;"><b>${t.id_troquel}</b><span onclick="App.borrarDeLote(${id})" style="color:red; cursor:pointer;">✕</span></div>`;
        });
    },
    borrarDeLote: (id) => { App.escaneadosLote.delete(id); App.renderListaEscaneados(); },
    procesarEscaneo: async (acc) => { if(App.escaneadosLote.size===0) return; App.seleccionados = new Set(App.escaneadosLote.keys()); await App.moverLote(acc); App.toggleScanner(false); },

    // --- RESTO ---
    nav: (v) => { document.querySelectorAll('.vista').forEach(x => x.classList.add('oculto')); document.getElementById(v).classList.remove('oculto'); if(v==='vista-lista') document.getElementById('sidebar').classList.remove('oculto'); },
    volverDesdeForm: () => { if(App.modoMovil) App.activarModoMovil(); else App.nav('vista-lista'); },
    activarModoMovil: () => { App.modoMovil = true; document.getElementById('sidebar').classList.add('oculto'); document.querySelectorAll('.vista').forEach(v => v.classList.add('oculto')); document.getElementById('vista-movil').classList.remove('oculto'); },
    desactivarModoMovil: () => { App.modoMovil = false; document.getElementById('sidebar').classList.remove('oculto'); App.nav('vista-lista'); },
    buscarMovil: (txt) => { const d = document.getElementById('resultados-movil'); d.innerHTML = ""; if(txt.length<2) return; const h = App.datos.filter(t => (t.nombre+t.id_troquel+t.ubicacion).toLowerCase().includes(txt.toLowerCase())); d.innerHTML = h.slice(0,10).map(t => `<div class="card-movil" onclick="App.editar(${t.id})"><div style="font-weight:900;">${t.id_troquel}</div><div>${t.nombre}</div><button class="btn-secundario">Ver</button></div>`).join(''); },
    
    nuevoTroquel: () => { document.getElementById('titulo-form').innerText = "Nuevo"; document.querySelector('form').reset(); document.getElementById('f-id-db').value = ""; App.archivosActuales=[]; App.renderListaArchivos(); if(App.modoMovil) document.getElementById('sidebar').classList.add('oculto'); App.nav('vista-formulario'); },
    editar: (id) => { const t = App.datos.find(x => x.id===id); if(!t) return; document.getElementById('titulo-form').innerText = "Editar"; document.getElementById('f-id-db').value = t.id; document.getElementById('f-matricula').value = t.id_troquel; document.getElementById('f-ubicacion').value = t.ubicacion; document.getElementById('f-nombre').value = t.nombre; document.getElementById('f-cat').value = t.categoria_id||""; document.getElementById('f-fam').value = t.familia_id||""; document.getElementById('f-medidas-madera').value = t.tamano_troquel||""; document.getElementById('f-medidas-corte').value = t.tamano_final||""; document.getElementById('f-arts').value = t.codigos_articulo||""; document.getElementById('f-ot').value = t.referencias_ot||""; document.getElementById('f-obs').value = t.observaciones||""; App.archivosActuales = (t.archivos && Array.isArray(t.archivos)) ? t.archivos : []; App.renderListaArchivos(); if(App.modoMovil) document.getElementById('sidebar').classList.add('oculto'); App.nav('vista-formulario'); },
    calcularSiguienteId: async () => { const idDb = document.getElementById('f-id-db').value; if(idDb) return; const catId = document.getElementById('f-cat').value; if(!catId) return; try { const res = await fetch(`/api/siguiente_numero?categoria_id=${catId}`); const d = await res.json(); document.getElementById('f-matricula').value = d.siguiente; document.getElementById('f-ubicacion').value = d.siguiente; } catch(e){} },
    setFiltroTipo: (tipo, btn) => { App.filtroTipo = tipo; document.querySelectorAll('.chip').forEach(c => c.classList.remove('activo')); btn.classList.add('activo'); App.renderTabla(); },
    filtrar: () => { const btn = document.getElementById('btn-limpiar'); const txt = document.getElementById('buscador').value; btn.classList.toggle('oculto', txt === ''); App.renderTabla(); },
    limpiarBuscador: () => { document.getElementById('buscador').value=''; App.filtrar(); },
    ordenar: (col) => { if(App.columnaOrden === col) App.ordenAsc = !App.ordenAsc; else { App.columnaOrden = col; App.ordenAsc = true; } App.renderTabla(); },
    descatalogar: async (id) => { if(!confirm("¿Descatalogar?")) return; const t = App.datos.find(x => x.id === id); t.estado = "DESCATALOGADO"; await fetch(`/api/troqueles/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(t) }); App.cargarTodo(); },
    borrar: async (id) => { if(!confirm("¿PAPELERA?")) return; await fetch(`/api/troqueles/${id}`, { method: 'DELETE' }); App.cargarTodo(); },
    restaurar: async (id) => { await fetch(`/api/troqueles/${id}/restaurar`, {method:'POST'}); App.cargarTodo(true); },
    verPapelera: () => App.cargarTodo(true), salirPapelera: () => App.cargarTodo(false),
    select: (chk, id) => { if (chk.checked) App.seleccionados.add(id); else App.seleccionados.delete(id); App.updatePanel(); },
    toggleAll: (chk) => { document.querySelectorAll('#tabla-body input[type="checkbox"]').forEach(c => { c.checked = chk.checked; if(chk.checked) App.seleccionados.add(parseInt(c.value)); else App.seleccionados.delete(parseInt(c.value)); }); App.updatePanel(); },
    updatePanel: () => { const p = document.getElementById('panel-acciones'); if(App.seleccionados.size>0) { p.classList.remove('oculto'); document.getElementById('contador-sel').innerText=App.seleccionados.size; } else p.classList.add('oculto'); },
    limpiarSeleccion: () => { App.seleccionados.clear(); document.getElementById('check-all').checked=false; App.updatePanel(); App.renderTabla(); },
    moverLote: async (acc) => { await fetch('/api/movimientos/lote', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: Array.from(App.seleccionados), accion: acc }) }); App.limpiarSeleccion(); App.cargarTodo(); },
    asignarMasivo: async (campo) => { let selectId = campo === 'familia' ? 'bulk-familia' : 'bulk-tipo'; let val = document.getElementById(selectId).value; if(!val || App.seleccionados.size === 0) return alert("Selecciona valor y troqueles"); if(!confirm(`¿Aplicar?`)) return; await fetch(`/api/troqueles/bulk/${campo}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: Array.from(App.seleccionados), valor_id: parseInt(val) }) }); App.limpiarSeleccion(); App.cargarTodo(App.enPapelera); },
    generarQR: (id, ubi, nom) => { document.getElementById('modal-qr').classList.remove('oculto'); document.getElementById('qr-texto-ubi').innerText = ubi || "SIN UBI"; document.getElementById('qr-texto-id').innerText = id; document.getElementById('qr-texto-desc').innerText = nom; new QRious({ element: document.getElementById('qr-canvas'), value: id, size: 200, padding: 0, level: 'M' }); },
    abrirGestionAux: () => document.getElementById('modal-aux').classList.remove('oculto'),
    cargarHistorial: async () => { const res = await fetch('/api/historial'); const data = await res.json(); document.getElementById('tabla-historial').innerHTML = data.map(h => `<tr><td>${new Date(h.fecha_hora).toLocaleString()}</td><td>${h.troqueles?.nombre}</td><td>${h.accion}</td><td>${h.ubicacion_anterior||'-'} -> ${h.ubicacion_nueva||'-'}</td></tr>`).join(''); },
    exportarCSV: () => { let csv = "Matricula,Ubicacion,Nombre,Tipo,Familia,Estado\n"; App.datos.forEach(t => csv += `${t.id_troquel},${t.ubicacion},${t.nombre},${App.mapaCat[t.categoria_id]},${App.mapaFam[t.familia_id]},${t.estado}\n`); const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURI(csv); a.download = 'inventario.csv'; a.click(); }
};

window.onload = App.init;