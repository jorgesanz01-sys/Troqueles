// =============================================================
// ERP PACKAGING - LÓGICA V22 (QR INTELIGENTE E IMPORTACIÓN CON TIPO)
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
        console.log("Iniciando ERP V22...");
        await App.cargarSelects();
        await App.cargarTodo();

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

    // 3. TABLAS Y RENDERIZADO
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
            const okTxt = (t.nombre+t.id_troquel+(t.ubicacion||"")).toLowerCase().includes(txt);
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
                <button class="btn-icono" onclick="App.generarQR(${t.id})" title="Imprimir Etiqueta">🖨️</button>
                <button class="btn-icono" onclick="App.borrar(${t.id})" style="color:red" title="A la papelera">🗑️</button>
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

    // ESTADÍSTICAS
    cargarEstadisticas: async (meses) => {
        const tbody = document.getElementById('tabla-estadisticas');
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Cargando cálculos... ⏳</td></tr>';
        try {
            const res = await fetch(`/api/estadisticas/inactivos?meses=${meses}`);
            const data = await res.json();
            if (data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center">¡Genial! No tienes troqueles obsoletos en este periodo.</td></tr>'; return;
            }
            tbody.innerHTML = data.map(t => {
                const fecha = t.ultima_fecha ? new Date(t.ultima_fecha).toLocaleDateString() : 'Nunca usado';
                return `<tr><td style="font-weight:900; color:#0f766e;">${t.id_troquel}</td><td>${t.nombre}</td><td>${t.estado || 'EN ALMACÉN'}</td><td style="color:#b91c1c; font-weight:bold;">${fecha}</td><td><button class="btn-accion" style="background:#64748b;" onclick="App.descatalogar(${t.id})">⛔ Descatalogar</button></td></tr>`;
            }).join('');
        } catch (e) { tbody.innerHTML = '<tr><td colspan="5" class="text-center text-red">Error al cargar las estadísticas</td></tr>'; }
    },

    // HISTORIAL INDIVIDUAL A PANTALLA COMPLETA
    verHistorialTroquel: async (id, mat, nom) => {
        const modal = document.getElementById('modal-historial-unico');
        const tbody = document.getElementById('tabla-historial-unico');
        document.getElementById('hist-titulo-mat').innerText = mat;
        document.getElementById('hist-titulo-nom').innerText = nom;
        tbody.innerHTML = '<tr><td colspan="4" class="text-center" style="padding: 40px; font-size: 18px;">Cargando historial de movimientos... ⏳</td></tr>';
        modal.classList.remove('oculto');
        try {
            const res = await fetch(`/api/historial?troquel_id=${id}`);
            if (res.ok) {
                const data = await res.json();
                if (data.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="4" class="text-center" style="padding: 40px; font-size: 18px;">No hay movimientos registrados para este troquel.</td></tr>';
                } else {
                    tbody.innerHTML = data.map(h => {
                        const descripcion = h.troqueles && h.troqueles.nombre ? h.troqueles.nombre : nom;
                        return `<tr><td style="font-weight:600;">${new Date(h.fecha_hora).toLocaleString()}</td><td>${descripcion}</td><td style="font-weight:bold; color:${h.accion.includes('SALIDA') ? '#dc2626' : '#16a34a'}">${h.accion}</td><td>${h.ubicacion_anterior||'-'} -> ${h.ubicacion_nueva||'-'}</td></tr>`;
                    }).join('');
                }
            }
        } catch (e) { tbody.innerHTML = '<tr><td colspan="4" class="text-center text-red">Error al cargar la información.</td></tr>'; }
    },

    // VISTA FICHA DETALLADA
    verFicha: (id) => {
        const t = App.datos.find(x => x.id === id); if (!t) return;
        document.getElementById('ver-matricula').innerText = t.id_troquel || "-";
        document.getElementById('ver-ubicacion').innerText = t.ubicacion || "-";
        document.getElementById('ver-nombre').innerText = t.nombre || "-";
        document.getElementById('ver-tipo').innerHTML = App.mapaCat[t.categoria_id] || '-';
        document.getElementById('ver-familia').innerHTML = App.mapaFam[t.familia_id] || '-';
        document.getElementById('ver-medidas-madera').innerText = t.tamano_troquel || "-";
        document.getElementById('ver-medidas-corte').innerText = t.tamano_final || "-";
        document.getElementById('ver-ot').innerText = t.referencias_ot || "-";
        document.getElementById('ver-arts').innerText = t.codigos_articulo || "-";
        document.getElementById('ver-obs').innerText = t.observaciones || "-";
        document.getElementById('ver-id-oculto').value = t.id;

        const gal = document.getElementById('ver-galeria'); gal.innerHTML = "";
        if (t.archivos && t.archivos.length > 0) {
            t.archivos.forEach(arch => {
                const icon = arch.tipo === 'pdf' ? '📄' : `<img src="${arch.url}" style="height:50px;">`;
                gal.innerHTML += `<a href="${arch.url}" target="_blank" style="margin-right:10px; text-decoration:none; display:inline-block; text-align:center;">${icon}<br><small>${arch.nombre.substring(0,10)}</small></a>`;
            });
        } else gal.innerHTML = "<span style='color:#999'>Sin archivos adjuntos</span>";
        
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
        btnPrint.onclick = () => App.generarQR(t.id);
        document.getElementById('modal-ficha').classList.remove('oculto');
    },
    editarDesdeFicha: () => {
        const id = parseInt(document.getElementById('ver-id-oculto').value);
        document.getElementById('modal-ficha').classList.add('oculto');
        App.editar(id);
    },

    // MODO OPERARIO
    activarModoMovil: () => { 
        App.modoMovil = true; 
        document.getElementById('sidebar').classList.add('oculto'); 
        document.querySelectorAll('.vista').forEach(v => v.classList.add('oculto')); 
        document.getElementById('vista-movil').classList.remove('oculto'); 
    },
    desactivarModoMovil: () => { 
        App.modoMovil = false; 
        document.getElementById('sidebar').classList.remove('oculto'); 
        App.nav('vista-lista'); 
    },
    
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

    // ESCÁNER (AHORA BUSCA POR ID INTERNO DE BASE DE DATOS)
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
                
                // V22: AHORA EL ESCÁNER LEE EL ID INTERNO REAL (txt será "45", "102"...)
                // Comparamos convirtiendo t.id a string
                const t = App.datos.find(x => x.id.toString() === txt);
                
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

    // UTILS
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
    
    // NAVEGACIÓN
    nav: (v, btnElement) => { 
        document.querySelectorAll('.vista').forEach(x=>x.classList.add('oculto')); 
        document.getElementById(v).classList.remove('oculto'); 
        if(btnElement) {
            document.querySelectorAll('.menu-item').forEach(b => b.classList.remove('activo'));
            btnElement.classList.add('activo');
        }
        if(v==='vista-lista') document.getElementById('sidebar').classList.remove('oculto'); 
    },
    
    buscarMovil: (txt) => { const d = document.getElementById('resultados-movil'); d.innerHTML = ""; if(txt.length<2)return; const h = App.datos.filter(t => (t.nombre+t.id_troquel+(t.ubicacion||"")).toLowerCase().includes(txt.toLowerCase())); d.innerHTML = h.slice(0,10).map(t => `<div class="card-movil" onclick="App.abrirDetalleMovil(${t.id})"><div style="font-weight:900;">${t.id_troquel}</div><div>${t.nombre}</div><button class="btn-secundario">Ver</button></div>`).join(''); },
    nuevoTroquel: () => { document.getElementById('titulo-form').innerText="Nuevo"; document.querySelector('form').reset(); document.getElementById('f-id-db').value=""; App.archivosActuales=[]; App.renderListaArchivos(); if(App.modoMovil) document.getElementById('sidebar').classList.add('oculto'); App.nav('vista-formulario'); },
    
    editar: (id) => { 
        const t = App.datos.find(x=>x.id===id); if(!t)return;
        document.getElementById('titulo-form').innerText="Editar";
        const setVal = (elId, val) => { const el = document.getElementById(elId); if(el) el.value = val; };
        
        setVal('f-id-db', t.id); setVal('f-matricula', t.id_troquel); setVal('f-ubicacion', t.ubicacion);
        setVal('f-nombre', t.nombre); setVal('f-cat', t.categoria_id||""); setVal('f-fam', t.familia_id||"");
        setVal('f-medidas-madera', t.tamano_troquel||""); setVal('f-medidas-corte', t.tamano_final||"");
        setVal('f-arts', t.codigos_articulo||""); setVal('f-ot', t.referencias_ot||""); setVal('f-obs', t.observaciones||"");

        App.archivosActuales = (t.archivos && Array.isArray(t.archivos)) ? t.archivos : [];
        App.renderListaArchivos();
        if(App.modoMovil) document.getElementById('sidebar').classList.add('oculto'); 
        App.nav('vista-formulario');
    },
    volverDesdeForm: () => { if(App.modoMovil) App.activarModoMovil(); else App.nav('vista-lista'); },
    guardarFicha: async (e) => {
        e.preventDefault(); const id = document.getElementById('f-id-db').value;
        const getVal = (elId) => { const el = document.getElementById(elId); return el ? el.value : ""; };
        const d = { 
            id_troquel: getVal('f-matricula'), ubicacion: getVal('f-ubicacion'), nombre: getVal('f-nombre'),
            categoria_id: parseInt(getVal('f-cat'))||null, familia_id: parseInt(getVal('f-fam'))||null,
            tamano_troquel: getVal('f-medidas-madera'), tamano_final: getVal('f-medidas-corte'),
            codigos_articulo: getVal('f-arts'), referencias_ot: getVal('f-ot'),
            observaciones: getVal('f-obs'), archivos: App.archivosActuales
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
    
    descatalogar: async (id) => { 
        if(confirm("¿Estás seguro de que deseas marcar este troquel como DESCATALOGADO?")) { 
            const t = App.datos.find(x => x.id === id); 
            let dataToSend = t;
            if(!t) { const r = await fetch(`/api/troqueles`); const full = await r.json(); dataToSend = full.find(x => x.id === id); }
            if(dataToSend) {
                dataToSend.estado = "DESCATALOGADO"; 
                await fetch(`/api/troqueles/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(dataToSend) }); 
                await App.cargarTodo(); 
                if(!document.getElementById('vista-estadisticas').classList.contains('oculto')) App.cargarEstadisticas(document.getElementById('select-inactividad').value);
            }
        } 
    },
    
    borrar: async (id) => { if(confirm("¿Mover a la papelera?")) { await fetch(`/api/troqueles/${id}`, { method:'DELETE' }); App.cargarTodo(); } },
    restaurar: async (id) => { await fetch(`/api/troqueles/${id}/restaurar`, {method:'POST'}); App.cargarTodo(true); },
    verPapelera: () => App.cargarTodo(true), salirPapelera: () => App.cargarTodo(false),
    moverLote: async (acc) => { await fetch('/api/movimientos/lote', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: Array.from(App.seleccionados), accion: acc }) }); App.limpiarSeleccion(); App.cargarTodo(); },
    asignarMasivo: async (c) => { let id=c==='familia'?'bulk-familia':'bulk-tipo'; let v=document.getElementById(id).value; if(v && confirm("¿Aplicar?")) { await fetch(`/api/troqueles/bulk/${c}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: Array.from(App.seleccionados), valor_id: parseInt(v) }) }); App.limpiarSeleccion(); App.cargarTodo(); } },
    abrirGestionAux: () => document.getElementById('modal-aux').classList.remove('oculto'),
    cargarHistorial: async () => { const r=await fetch('/api/historial'); const d=await r.json(); document.getElementById('tabla-historial').innerHTML=d.map(h=>`<tr><td>${new Date(h.fecha_hora).toLocaleString()}</td><td>${h.troqueles?.nombre}</td><td>${h.accion}</td><td>${h.ubicacion_anterior||'-'} -> ${h.ubicacion_nueva||'-'}</td></tr>`).join(''); },
    
    // --- MAGIA GODEX: IMPRIME EL ID INTERNO EN EL QR ---
    imprimirEtiquetasGodex: (items) => {
        let printWindow = window.open('', '_blank', 'width=600,height=600');
        let html = `
            <!DOCTYPE html>
            <html><head><title>Impresión Godex 50x23</title>
            <style>
                @page { size: 50mm 23mm; margin: 0; }
                body { margin: 0; padding: 0; font-family: 'Arial', sans-serif; background: #fff; }
                
                .label {
                    width: 50mm; height: 23mm;
                    box-sizing: border-box; padding: 1mm;
                    display: flex; align-items: center; justify-content: space-between;
                    page-break-after: always;
                    overflow: hidden;
                }
                .qr { width: 19mm; display: flex; justify-content: center; align-items: center; }
                .qr img { width: 18mm; height: 18mm; }
                
                .text { width: 28mm; padding-left: 1mm; display: flex; flex-direction: column; justify-content: center; }
                .mat { font-size: 10pt; font-weight: 900; line-height: 1; margin-bottom: 2px; color: black; }
                .ubi { font-size: 7.5pt; font-weight: bold; line-height: 1; margin-bottom: 2px; color: black; }
                .nom { font-size: 6pt; line-height: 1.1; color: black; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
                .arts { font-size: 5.5pt; font-weight: bold; margin-top: 1px; color: #333; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }

                @media screen {
                    body { background: #334155; padding: 20px; display: flex; flex-direction: column; align-items: center; }
                    .label { background: #fff; margin-bottom: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); border-radius: 2px; }
                    .btn { background: #14b8a6; color: white; padding: 15px 30px; border: none; border-radius: 8px; font-size: 18px; font-weight: bold; cursor: pointer; margin-bottom: 20px; }
                }
                @media print { .no-print { display: none !important; } }
            </style></head><body>
            <button class="no-print btn" onclick="window.print()">🖨️ Iniciar Impresión Godex</button>
        `;
        
        items.forEach(t => {
            // V22: EL QR GUARDA t.id (El número interno de base de datos)
            const qr = new QRious({ value: t.id.toString(), size: 150, level: 'M' });
            
            const htmlArt = t.codigos_articulo ? `<div class="arts">Art: ${t.codigos_articulo}</div>` : '';
            html += `
                <div class="label">
                    <div class="qr"><img src="${qr.toDataURL()}"></div>
                    <div class="text">
                        <div class="mat">${t.id_troquel}</div>
                        <div class="ubi">Ubi: ${t.ubicacion || '-'}</div>
                        <div class="nom">${t.nombre}</div>
                        ${htmlArt}
                    </div>
                </div>
            `;
        });
        
        html += `</body></html>`;
        printWindow.document.write(html);
        printWindow.document.close();
        setTimeout(() => { printWindow.print(); }, 800);
    },

    imprimirLoteQRs: () => {
        if(App.seleccionados.size === 0) return;
        const itemsToPrint = Array.from(App.seleccionados).map(id => App.datos.find(t => t.id === id)).filter(t => t);
        App.imprimirEtiquetasGodex(itemsToPrint);
        App.limpiarSeleccion();
    },

    generarQR: (id_db) => { 
        const t = App.datos.find(x => x.id === id_db);
        if(!t) return;

        document.getElementById('modal-qr').classList.remove('oculto'); 
        document.getElementById('qr-texto-ubi').innerText = t.ubicacion || '-'; 
        document.getElementById('qr-texto-id').innerText = t.id_troquel; 
        document.getElementById('qr-texto-desc').innerText = t.nombre; 
        
        const elArts = document.getElementById('qr-texto-arts');
        if(elArts) {
            if(t.codigos_articulo) { elArts.innerText = "Art: " + t.codigos_articulo; elArts.style.display = "block"; } 
            else { elArts.style.display = "none"; }
        }

        // V22: EL QR GUARDA t.id (El número interno)
        new QRious({ element: document.getElementById('qr-canvas'), value: t.id.toString(), size: 200, padding: 0, level: 'M' }); 
        
        document.getElementById('btn-imprimir-qr-unico').onclick = () => {
            App.imprimirEtiquetasGodex([t]);
        };
    },

    // --- CSV V22: IMPORTACIÓN INTELIGENTE (4 COLUMNAS) Y BLINDADA A ERRORES ---
    procesarImportacion: async (input) => { 
        const file = input.files[0]; 
        if(!file) return; 
        
        const reader = new FileReader(); 
        reader.onload = async(e) => { 
            try {
                const filas = e.target.result.split(/\r?\n/); 
                if(filas.length < 2) { alert("El archivo está vacío o no tiene datos."); return; }
                
                const cabecera = filas[0];
                const separador = cabecera.includes(';') ? ';' : ',';
                
                // Mapa inverso para encontrar el ID del "Tipo" a partir de su texto
                const catNameToId = {};
                Object.keys(App.mapaCat).forEach(id => {
                    catNameToId[App.mapaCat[id].toUpperCase()] = parseInt(id);
                });

                const troqueles = [];
                
                // Bucle desde 1 para saltar la fila de títulos
                for(let i=1; i<filas.length; i++) {
                    const f = filas[i];
                    if(!f.trim()) continue;
                    
                    const cols = f.split(separador);
                    const mat = cols[0] ? cols[0].replace(/['"]/g,'').trim() : null;
                    const ubi = cols[1] ? cols[1].replace(/['"]/g,'').trim() : null;
                    const nom = cols[2] ? cols[2].replace(/['"]/g,'').trim() : null;
                    const tipoStr = cols[3] ? cols[3].replace(/['"]/g,'').trim().toUpperCase() : null;
                    
                    let catId = null;
                    if(tipoStr && catNameToId[tipoStr]) {
                        catId = catNameToId[tipoStr];
                    }

                    if(mat) {
                        troqueles.push({ 
                            id_troquel: mat, 
                            ubicacion: ubi || mat, 
                            nombre: nom || "Sin Descripción",
                            categoria_id: catId
                        });
                    }
                }
                
                if(troqueles.length === 0) { alert("No se han encontrado datos válidos para importar."); input.value = ""; return; }
                
                const res = await fetch('/api/troqueles/importar', { 
                    method: 'POST', 
                    headers: {'Content-Type':'application/json'}, 
                    body: JSON.stringify(troqueles) 
                });
                
                if(res.ok) { 
                    App.cargarTodo(); 
                    alert(`✅ ÉXITO: Se han importado ${troqueles.length} troqueles. (Recuerda que si había tipos que no existen en el sistema, se han importado sin tipo).`); 
                } else {
                    const errorBack = await res.text();
                    console.error("Error BD:", errorBack);
                    alert(`❌ ERROR EN BASE DE DATOS:\nEs posible que la columna 'id_troquel' en Supabase esté marcada como 'Unique' (Única) y estés intentando meter duplicados.\n\nVe a Supabase > Table Editor > troqueles y quita el tick de 'Is Unique' de esa columna.`);
                }
            } catch (err) { 
                console.error("Fallo general:", err);
                alert("❌ Ocurrió un error al procesar el archivo CSV."); 
            }
            input.value = ""; 
        }; 
        reader.readAsText(file, 'UTF-8'); 
    },
    
    // EXPORTACIÓN AHORA INCLUYE EL "TIPO"
    exportarCSV: () => { 
        let c = "Matricula;Ubicacion;Descripcion;Tipo;Estado\n"; 
        App.datos.forEach(t => {
            const nomLimpio = (t.nombre || "").replace(/;/g, ',').replace(/\r?\n/g, ' ');
            const tipoNom = App.mapaCat[t.categoria_id] || "";
            c += `${t.id_troquel};${t.ubicacion};${nomLimpio};${tipoNom};${t.estado}\n`;
        }); 
        const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), c], {type: "text/csv;charset=utf-8"});
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); 
        a.download = 'inventario_troqueles_v22.csv'; a.click(); 
    }
};

window.onload = App.init;