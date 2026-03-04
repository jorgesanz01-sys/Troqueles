// =============================================================
// ERP PACKAGING - LÓGICA V17 (OPERARIO + HISTORIAL INDIVIDUAL)
// =============================================================

const App = {
    // --- ESTADO ---
    datos: [], seleccionados: new Set(), filtroTipo: 'TODOS',
    mapaCat: {}, mapaFam: {}, columnaOrden: 'id_troquel', ordenAsc: true,
    scanner: null, modoMovil: false, 
    modoScanner: 'LOTE', 
    archivosActuales: [], escaneadosLote: new Map(), enPapelera: false,

    // 1. INICIO
    init: async () => {
        console.log("Iniciando ERP V17...");
        await App.cargarSelects();
        await App.cargarTodo();

        // Detectar Modo Kiosco
        const params = new URLSearchParams(window.location.search);
        if (params.get('modo') === 'operario') {
            document.body.classList.add('kiosk-mode');
            App.activarModoMovil();
        }
    },

    // 2. CARGA
    cargarTodo: async (papelera = false) => {
        try {
            App.enPapelera = papelera;
            const res = await fetch(`/api/troqueles?ver_papelera=${papelera}`);
            if (res.ok) {
                App.datos = await res.json();
                App.renderTabla();
                document.getElementById('titulo-lista').innerText = papelera ? "🗑️ PAPELERA" : "Inventario Activo";
                const btn = document.getElementById('btn-restaurar-papelera');
                const panel = document.getElementById('panel-acciones');
                if (papelera) { 
                    if(btn) btn.classList.remove('oculto'); 
                    if(panel) panel.classList.add('oculto'); 
                } else { 
                    if(btn) btn.classList.add('oculto'); 
                }
            }
        } catch (e) { console.error(e); }
    },

    cargarSelects: async () => {
        try {
            const [cats, fams] = await Promise.all([fetch('/api/categorias').then(r=>r.json()), fetch('/api/familias').then(r=>r.json())]);
            App.mapaCat = {}; App.mapaFam = {};
            cats.forEach(c => App.mapaCat[c.id] = c.nombre);
            fams.forEach(f => App.mapaFam[f.id] = f.nombre);

            const divChips = document.getElementById('chips-tipos');
            if(divChips) {
                divChips.innerHTML = `<button class="chip activo" onclick="App.setFiltroTipo('TODOS', this)">TODOS</button>`;
                cats.forEach(c => divChips.innerHTML += `<button class="chip" onclick="App.setFiltroTipo('${c.nombre}', this)">${c.nombre}</button>`);
            }

            const llenar = (id, data, def) => {
                const el = document.getElementById(id);
                if(el) {
                    const prev = el.value;
                    let first = `<option value="">${def}</option>`;
                    if(id==='filtro-familia') first = '<option value="TODAS">Todas las Familias</option>';
                    if(id==='f-fam') first = '<option value="">Sin Familia</option>';
                    el.innerHTML = first;
                    data.forEach(d => el.innerHTML += `<option value="${d.id}">${d.nombre}</option>`);
                    if(prev) el.value = prev;
                }
            };
            llenar('f-cat', cats, 'Tipo...'); llenar('bulk-tipo', cats, 'Asignar Tipo...');
            llenar('f-fam', fams, 'Familia...'); llenar('bulk-familia', fams, 'Asignar Familia...');
            llenar('filtro-familia', fams, ''); 

        } catch (e) { console.error(e); }
    },

    // 3. TABLA PC (CON BOTÓN HISTORIAL 🕒)
    renderTabla: () => {
        const tbody = document.getElementById('tabla-body'); if (!tbody) return;
        const txt = document.getElementById('buscador').value.toLowerCase();
        const fam = document.getElementById('filtro-familia').value;
        const est = document.getElementById('filtro-estado').value;

        let res = App.datos.filter(t => {
            const nCat = App.mapaCat[t.categoria_id] || '';
            const okTip = App.filtroTipo === 'TODOS' || nCat === App.filtroTipo;
            const okFam = fam === 'TODAS' || t.familia_id == fam;
            const okEst = est === 'TODOS' || (t.estado || 'EN ALMACEN') === est;
            const okTxt = (t.nombre+t.id_troquel+t.ubicacion).toLowerCase().includes(txt);
            return okTip && okFam && okEst && okTxt;
        });

        res.sort((a,b) => {
            let vA = (a[App.columnaOrden]||"").toString(), vB = (b[App.columnaOrden]||"").toString();
            if(App.columnaOrden==='familia') { vA=App.mapaFam[a.familia_id]||""; vB=App.mapaFam[b.familia_id]||""; }
            const nA=parseFloat(vA), nB=parseFloat(vB);
            if(!isNaN(nA)&&!isNaN(nB)&&!vA.match(/[a-z]/i)) return App.ordenAsc ? nA-nB : nB-nA;
            return App.ordenAsc ? vA.localeCompare(vB) : vB.localeCompare(vA);
        });

        if(res.length===0) { tbody.innerHTML='<tr><td colspan="8" class="text-center">Sin datos</td></tr>'; return; }

        tbody.innerHTML = res.map(t => {
            const chk = App.seleccionados.has(t.id) ? 'checked' : '';
            const nDocs = (t.archivos && t.archivos.length) || 0;
            const bdg = nDocs > 0 ? `<span class="obs-pildora">📎 ${nDocs}</span>` : '-';
            
            let col = '#166534', bg = '#dcfce7';
            if(t.estado==='EN PRODUCCION') { col='#991b1b'; bg='#fee2e2'; }
            if(t.estado==='DESCATALOGADO') { col='#6b7280'; bg='#f3f4f6'; }
            const st = `<span style="background:${bg}; color:${col}; padding:2px 8px; border-radius:10px; font-size:10px; font-weight:800;">${t.estado||'ALMACÉN'}</span>`;

            let fam = App.mapaFam[t.familia_id];
            if(!fam && t.familia_id) fam = `<span style="color:red">ID:${t.familia_id}</span>`;

            let btns = `
                <button class="btn-icono" onclick="App.verFicha(${t.id})" title="Ver Ficha">👁️</button>
                <button class="btn-icono" onclick="App.verHistorialTroquel(${t.id}, '${t.id_troquel}', '${t.nombre.replace(/'/g,"")}')" title="Historial">🕒</button>
                <button class="btn-icono" onclick="App.editar(${t.id})" title="Editar">✏️</button>
                <button class="btn-icono" onclick="App.generarQR('${t.id_troquel}', '${t.ubicacion}', '${t.nombre.replace(/'/g,"")}')">🖨️</button>
                <button class="btn-icono" onclick="App.borrar(${t.id})" style="color:red">🗑️</button>
            `;
            if(App.enPapelera) btns = `<button class="btn-accion" style="background:#22c55e; padding:2px 5px;" onclick="App.restaurar(${t.id})">♻️</button>`;

            return `<tr style="${t.estado==='DESCATALOGADO'?'opacity:0.6':''}" onclick="App.verFicha(${t.id})" style="cursor:pointer;">
                <td onclick="event.stopPropagation()" class="text-center"><input type="checkbox" value="${t.id}" ${chk} onchange="App.select(this, ${t.id})"></td>
                <td class="text-center">${bdg}</td><td class="text-center">${st}</td>
                <td style="font-weight:900; color:#0f766e;">${t.id_troquel}</td><td>${t.ubicacion}</td><td>${t.nombre}</td>
                <td><small>${fam||'-'}</small></td><td onclick="event.stopPropagation()">${btns}</td>
            </tr>`;
        }).join('');
    },

    // 4. NUEVA FUNCIÓN: VER HISTORIAL INDIVIDUAL
    verHistorialTroquel: async (id, mat, nom) => {
        const modal = document.getElementById('modal-historial-unico');
        const tbody = document.getElementById('tabla-historial-unico');
        
        document.getElementById('hist-titulo-mat').innerText = mat;
        document.getElementById('hist-titulo-nom').innerText = nom;
        tbody.innerHTML = '<tr><td colspan="3" class="text-center">Cargando...</td></tr>';
        
        modal.classList.remove('oculto');

        try {
            const res = await fetch(`/api/historial?troquel_id=${id}`);
            if (res.ok) {
                const data = await res.json();
                if (data.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="3" class="text-center">Sin movimientos.</td></tr>';
                } else {
                    tbody.innerHTML = data.map(h => `
                        <tr>
                            <td>${new Date(h.fecha_hora).toLocaleString()}</td>
                            <td style="font-weight:bold; color:${h.accion.includes('SALIDA')?'red':'green'}">${h.accion}</td>
                            <td>${h.ubicacion_anterior||'-'} ➝ ${h.ubicacion_nueva||'-'}</td>
                        </tr>
                    `).join('');
                }
            }
        } catch (e) { tbody.innerHTML = '<tr><td colspan="3">Error carga</td></tr>'; }
    },

    // 5. VISTA FICHA
    verFicha: (id) => {
        const t = App.datos.find(x => x.id === id); if (!t) return;
        document.getElementById('ver-matricula').innerText = t.id_troquel || "-";
        document.getElementById('ver-ubicacion').innerText = t.ubicacion || "-";
        document.getElementById('ver-nombre').innerText = t.nombre || "-";
        document.getElementById('ver-tipo').innerHTML = App.mapaCat[t.categoria_id] || '-';
        document.getElementById('ver-familia').innerHTML = App.mapaFam[t.familia_id] || '-';
        document.getElementById('ver-id-oculto').value = t.id;

        const gal = document.getElementById('ver-galeria'); gal.innerHTML = "";
        if (t.archivos && t.archivos.length > 0) {
            t.archivos.forEach(arch => {
                const icon = arch.tipo === 'pdf' ? '📄' : `<img src="${arch.url}" style="height:50px;">`;
                gal.innerHTML += `<a href="${arch.url}" target="_blank" style="margin-right:10px; text-decoration:none;">${icon}<br><small>${arch.nombre.substring(0,10)}</small></a>`;
            });
        } else gal.innerHTML = "<span style='color:#999'>Sin archivos</span>";
        
        let btnPrint = document.getElementById('btn-print-ficha');
        if(!btnPrint) {
            const header = document.querySelector('#modal-ficha h2').parentNode;
            btnPrint = document.createElement('button');
            btnPrint.id = 'btn-print-ficha';
            btnPrint.className = 'btn-secundario';
            btnPrint.style.marginRight = '10px';
            btnPrint.innerHTML = '🖨️ Etiqueta';
            header.insertBefore(btnPrint, header.firstChild);
        }
        btnPrint.onclick = () => App.generarQR(t.id_troquel, t.ubicacion, t.nombre);

        document.getElementById('modal-ficha').classList.remove('oculto');
    },
    editarDesdeFicha: () => {
        const id = parseInt(document.getElementById('ver-id-oculto').value);
        document.getElementById('modal-ficha').classList.add('oculto');
        App.editar(id);
    },

    // 6. MODO OPERARIO
    activarModoMovil: () => { App.modoMovil = true; document.getElementById('sidebar').classList.add('oculto'); document.querySelectorAll('.vista').forEach(v => v.classList.add('oculto')); document.getElementById('vista-movil').classList.remove('oculto'); },
    desactivarModoMovil: () => { App.modoMovil = false; document.getElementById('sidebar').classList.remove('oculto'); App.nav('vista-lista'); },
    
    abrirDetalleMovil: (id) => {
        const t = App.datos.find(x => x.id === id); if(!t) return;
        document.getElementById('vista-movil').classList.add('oculto');
        document.getElementById('vista-movil-detalle').classList.remove('oculto');
        document.getElementById('movil-id-db').value = t.id;
        document.getElementById('movil-id').innerText = t.id_troquel;
        document.getElementById('movil-ubi').innerText = t.ubicacion;
        document.getElementById('movil-nombre').innerText = t.nombre;
        let stHtml = `<span style="background:#dcfce7; color:#166534; padding:5px 10px; border-radius:15px; font-weight:bold;">ALMACÉN</span>`;
        if(t.estado==='EN PRODUCCION') stHtml = `<span style="background:#fee2e2; color:#991b1b; padding:5px 10px; border-radius:15px; font-weight:bold;">PRODUCCIÓN</span>`;
        document.getElementById('movil-estado').innerHTML = stHtml;
    },
    volverMenuMovil: () => { document.getElementById('vista-movil-detalle').classList.add('oculto'); document.getElementById('vista-movil').classList.remove('oculto'); App.cargarTodo(); },
    
    movilCambiarUbi: async () => {
        const id = document.getElementById('movil-id-db').value;
        const actual = document.getElementById('movil-ubi').innerText;
        const nueva = prompt("Nueva Ubicación:", actual);
        if(nueva && nueva !== actual) {
            const t = App.datos.find(x => x.id == id);
            const payload = { ...t, ubicacion: nueva }; 
            await fetch(`/api/troqueles/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
            await App.cargarTodo();
            document.getElementById('movil-ubi').innerText = nueva;
        }
    },
    movilCambiarEstado: async (accion) => {
        const id = parseInt(document.getElementById('movil-id-db').value);
        if(!confirm(`¿Marcar como ${accion}?`)) return;
        await fetch('/api/movimientos/lote', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: [id], accion: accion }) });
        await App.cargarTodo();
        App.abrirDetalleMovil(id);
    },
    movilSubirFoto: async (input) => {
        if(!input.files.length) return;
        const id = document.getElementById('movil-id-db').value;
        const t = App.datos.find(x => x.id == id);
        const fd = new FormData(); fd.append('file', input.files[0]);
        try {
            const res = await fetch('/api/subir_foto', { method: 'POST', body: fd });
            if(res.ok) {
                const data = await res.json();
                if(!t.archivos) t.archivos = [];
                t.archivos.push({ url: data.url, nombre: input.files[0].name, tipo: data.tipo });
                await fetch(`/api/troqueles/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(t) });
                alert("Foto guardada");
                await App.cargarTodo();
            }
        } catch(e) { alert("Error foto"); }
    },

    // 7. ESCÁNER
    toggleScanner: (show=true, modo='LOTE') => {
        const el = document.getElementById('modal-scanner');
        App.modoScanner = modo;
        const pLote = document.getElementById('panel-lote');
        const bLote = document.getElementById('btns-lote');
        const tit = document.getElementById('titulo-scanner');
        
        if (modo === 'UNICO') {
            if(pLote) pLote.style.display='none';
            if(bLote) bLote.style.display='none';
            if(tit) tit.innerText = "🔎 Escanear Un Troquel";
        } else {
            if(pLote) pLote.style.display='block';
            if(bLote) bLote.style.display='flex';
            if(tit) tit.innerText = "📦 Escanear Lote";
        }

        if(show) {
            el.classList.remove('oculto'); App.escaneadosLote.clear(); App.renderListaEscaneados();
            App.scanner = new Html5Qrcode("reader");
            let last = null; let t0 = 0;
            App.scanner.start({facingMode:"environment"}, {fps:10, qrbox:250}, (txt) => {
                if(txt === last && (Date.now() - t0 < 3000)) return; 
                const t = App.datos.find(x => x.id_troquel === txt);
                if(t) {
                    if (App.modoScanner === 'UNICO') {
                        App.toggleScanner(false);
                        if(navigator.vibrate) navigator.vibrate(200);
                        App.abrirDetalleMovil(t.id);
                    } else {
                        if(!App.escaneadosLote.has(t.id)) { 
                            App.escaneadosLote.set(t.id, t); 
                            App.renderListaEscaneados(); 
                            if(navigator.vibrate) navigator.vibrate(100); 
                        }
                    }
                    last = txt; t0 = Date.now();
                }
            });
        } else { el.classList.add('oculto'); if(App.scanner) App.scanner.stop(); }
    },
    renderListaEscaneados: () => { 
        const div = document.getElementById('lista-escaneados'); div.innerHTML=""; 
        document.getElementById('count-scans').innerText=App.escaneadosLote.size; 
        App.escaneadosLote.forEach((t,id)=>{ div.innerHTML+=`<div class="chip activo" style="background:white; color:black;"><b>${t.id_troquel}</b><span onclick="App.borrarDeLote(${id})" style="color:red; cursor:pointer; margin-left:5px">✕</span></div>`; }); 
    },
    borrarDeLote: (id) => { App.escaneadosLote.delete(id); App.renderListaEscaneados(); },
    procesarEscaneo: async (acc) => { if(App.escaneadosLote.size===0) return; App.seleccionados = new Set(App.escaneadosLote.keys()); await App.moverLote(acc); App.toggleScanner(false); },

    // 8. UTILS
    crearFamilia: async () => { const n = prompt("Familia:"); if(n) { await fetch('/api/familias', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({nombre:n}) }); App.cargarSelects(); } },
    crearTipo: async () => { const n = prompt("Tipo:"); if(n) { await fetch('/api/categorias', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({nombre:n}) }); App.cargarSelects(); } },
    subirArchivos: async (input) => { 
        if(!input.files.length) return; const btn = input.parentElement; btn.innerText="⏳";
        for(let i=0; i<input.files.length; i++) {
            const fd = new FormData(); fd.append('file', input.files[i]);
            const res = await fetch('/api/subir_foto', { method:'POST', body:fd });
            if(res.ok) { const d = await res.json(); App.archivosActuales.push({ url: d.url, nombre: input.files[i].name, tipo: d.tipo }); }
        }
        App.renderListaArchivos(); btn.innerText="➕"; input.value="";
    },
    renderListaArchivos: () => { 
        const div = document.getElementById('lista-archivos'); div.innerHTML=""; 
        App.archivosActuales.forEach((a,i) => div.innerHTML += `<div>${a.nombre} <span onclick="App.quitarArchivo(${i})" style="color:red;cursor:pointer">✕</span></div>`); 
    },
    quitarArchivo: (i) => { App.archivosActuales.splice(i,1); App.renderListaArchivos(); },
    nav: (v) => { document.querySelectorAll('.vista').forEach(x=>x.classList.add('oculto')); document.getElementById(v).classList.remove('oculto'); if(v==='vista-lista') document.getElementById('sidebar').classList.remove('oculto'); },
    buscarMovil: (txt) => { const d = document.getElementById('resultados-movil'); d.innerHTML = ""; if(txt.length<2)return; const h = App.datos.filter(t => (t.nombre+t.id_troquel+t.ubicacion).toLowerCase().includes(txt.toLowerCase())); d.innerHTML = h.slice(0,10).map(t => `<div class="card-movil" onclick="App.abrirDetalleMovil(${t.id})"><div style="font-weight:900;">${t.id_troquel}</div><div>${t.nombre}</div><button class="btn-secundario">Ver</button></div>`).join(''); },
    nuevoTroquel: () => { document.getElementById('titulo-form').innerText="Nuevo"; document.querySelector('form').reset(); document.getElementById('f-id-db').value=""; App.archivosActuales=[]; App.renderListaArchivos(); if(App.modoMovil) document.getElementById('sidebar').classList.add('oculto'); App.nav('vista-formulario'); },
    
    // AQUÍ ESTÁ LA MAGIA: Una función editar segura a prueba de errores
    editar: (id) => { 
        const t = App.datos.find(x=>x.id===id); if(!t)return;
        document.getElementById('titulo-form').innerText="Editar";
        
        // Función ayudante que asigna el valor sólo si el elemento existe en el HTML
        const setVal = (elId, val) => { const el = document.getElementById(elId); if(el) el.value = val; };
        
        setVal('f-id-db', t.id);
        setVal('f-matricula', t.id_troquel);
        setVal('f-ubicacion', t.ubicacion);
        setVal('f-nombre', t.nombre);
        setVal('f-cat', t.categoria_id||"");
        setVal('f-fam', t.familia_id||"");
        setVal('f-medidas-madera', t.tamano_troquel||"");
        setVal('f-medidas-corte', t.tamano_final||"");
        setVal('f-arts', t.codigos_articulo||"");
        setVal('f-ot', t.referencias_ot||"");
        setVal('f-obs', t.observaciones||"");

        App.archivosActuales = (t.archivos && Array.isArray(t.archivos)) ? t.archivos : [];
        App.renderListaArchivos();
        if(App.modoMovil) document.getElementById('sidebar').classList.add('oculto'); 
        App.nav('vista-formulario');
    },
    
    volverDesdeForm: () => { if(App.modoMovil) App.activarModoMovil(); else App.nav('vista-lista'); },
    
    guardarFicha: async (e) => {
        e.preventDefault(); const id = document.getElementById('f-id-db').value;
        
        // Función ayudante para sacar datos de forma segura
        const getVal = (elId) => { const el = document.getElementById(elId); return el ? el.value : ""; };
        
        const d = { 
            id_troquel: getVal('f-matricula'),
            ubicacion: getVal('f-ubicacion'),
            nombre: getVal('f-nombre'),
            categoria_id: parseInt(getVal('f-cat'))||null,
            familia_id: parseInt(getVal('f-fam'))||null,
            tamano_troquel: getVal('f-medidas-madera'),
            tamano_final: getVal('f-medidas-corte'),
            codigos_articulo: getVal('f-arts'),
            referencias_ot: getVal('f-ot'),
            observaciones: getVal('f-obs'),
            archivos: App.archivosActuales
        };
        await fetch(id ? `/api/troqueles/${id}` : '/api/troqueles', { method: id?'PUT':'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(d) });
        await App.cargarTodo(); App.volverDesdeForm();
    },
    
    calcularSiguienteId: async () => { const c = document.getElementById('f-cat').value; if(c) { try { const r=await fetch(`/api/siguiente_numero?categoria_id=${c}`); const d=await r.json(); document.getElementById('f-matricula').value=d.siguiente; document.getElementById('f-ubicacion').value=d.siguiente; } catch(e){} } },
    setFiltroTipo: (t,b) => { App.filtroTipo=t; document.querySelectorAll('.chip').forEach(c=>c.classList.remove('activo')); b.classList.add('activo'); App.renderTabla(); },
    filtrar: () => { const b=document.getElementById('btn-limpiar'); b.classList.toggle('oculto', document.getElementById('buscador').value===''); App.renderTabla(); },
    limpiarBuscador: () => { document.getElementById('buscador').value=''; App.filtrar(); },
    ordenar: (c) => { if(App.columnaOrden===c) App.ordenAsc=!App.ordenAsc; else { App.columnaOrden=c; App.ordenAsc=true; } App.renderTabla(); },
    select: (c,id) => { c.checked ? App.seleccionados.add(id) : App.seleccionados.delete(id); App.updatePanel(); },
    toggleAll: (c) => { document.querySelectorAll('#tabla-body input[type="checkbox"]').forEach(k=>{ k.checked=c.checked; c.checked ? App.seleccionados.add(parseInt(k.value)) : App.seleccionados.delete(parseInt(k.value)); }); App.updatePanel(); },
    updatePanel: () => { const p=document.getElementById('panel-acciones'); if(App.seleccionados.size>0) { p.classList.remove('oculto'); document.getElementById('contador-sel').innerText=App.seleccionados.size; } else p.classList.add('oculto'); },
    limpiarSeleccion: () => { App.seleccionados.clear(); document.getElementById('check-all').checked=false; App.updatePanel(); App.renderTabla(); },
    descatalogar: async (id) => { if(confirm("¿Baja?")) { const t=App.datos.find(x=>x.id===id); t.estado="DESCATALOGADO"; await fetch(`/api/troqueles/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(t) }); App.cargarTodo(); } },
    borrar: async (id) => { if(confirm("¿Papelera?")) { await fetch(`/api/troqueles/${id}`, { method:'DELETE' }); App.cargarTodo(); } },
    restaurar: async (id) => { await fetch(`/api/troqueles/${id}/restaurar`, {method:'POST'}); App.cargarTodo(true); },
    verPapelera: () => App.cargarTodo(true), salirPapelera: () => App.cargarTodo(false),
    moverLote: async (acc) => { await fetch('/api/movimientos/lote', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: Array.from(App.seleccionados), accion: acc }) }); App.limpiarSeleccion(); App.cargarTodo(); },
    asignarMasivo: async (c) => { let id=c==='familia'?'bulk-familia':'bulk-tipo'; let v=document.getElementById(id).value; if(v && confirm("¿Aplicar?")) { await fetch(`/api/troqueles/bulk/${c}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: Array.from(App.seleccionados), valor_id: parseInt(v) }) }); App.limpiarSeleccion(); App.cargarTodo(); } },
    generarQR: (id, ubi, nom) => { document.getElementById('modal-qr').classList.remove('oculto'); document.getElementById('qr-texto-ubi').innerText = ubi; document.getElementById('qr-texto-id').innerText = id; document.getElementById('qr-texto-desc').innerText = nom; new QRious({ element: document.getElementById('qr-canvas'), value: id, size: 200, padding: 0, level: 'M' }); },
    abrirGestionAux: () => document.getElementById('modal-aux').classList.remove('oculto'),
    cargarHistorial: async () => { const r=await fetch('/api/historial'); const d=await r.json(); document.getElementById('tabla-historial').innerHTML=d.map(h=>`<tr><td>${new Date(h.fecha_hora).toLocaleString()}</td><td>${h.troqueles?.nombre}</td><td>${h.accion}</td><td>${h.ubicacion_anterior||'-'} -> ${h.ubicacion_nueva||'-'}</td></tr>`).join(''); },
    exportarCSV: () => { let c="Mat,Ubi,Nom,Est\n"; App.datos.forEach(t=>c+=`${t.id_troquel},${t.ubicacion},${t.nombre},${t.estado}\n`); const a=document.createElement('a'); a.href='data:text/csv;charset=utf-8,'+encodeURI(c); a.download='inv.csv'; a.click(); }
};

window.onload = App.init;