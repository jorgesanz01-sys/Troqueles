const App = {
    datos: [],
    seleccionados: new Set(),
    filtroTipo: 'TODOS',
    mapaCat: {},
    mapaFam: {},
    columnaOrden: 'id_troquel',
    ordenAsc: true,
    scanner: null,
    modoMovil: false,
    archivosActuales: [], // Lista para manejar múltiples archivos

    init: async () => {
        console.log("Iniciando ERP V9...");
        await App.cargarTodo();
        App.cargarSelects();
    },

    // --- CARGA DE DATOS ---
    cargarTodo: async () => {
        try {
            const res = await fetch('/api/troqueles');
            if(res.ok) {
                App.datos = await res.json();
                App.renderTabla();
            }
        } catch (e) { console.error(e); }
    },

    cargarSelects: async () => {
        try {
            const [cats, fams] = await Promise.all([
                fetch('/api/categorias').then(r=>r.json()), 
                fetch('/api/familias').then(r=>r.json())
            ]);
            
            // Mapas
            cats.forEach(c => App.mapaCat[c.id] = c.nombre);
            fams.forEach(f => App.mapaFam[f.id] = f.nombre);

            // Chips Filtro
            const divChips = document.getElementById('chips-tipos');
            divChips.innerHTML = `<button class="chip activo" onclick="App.setFiltroTipo('TODOS', this)">TODOS</button>`;
            cats.forEach(c => divChips.innerHTML += `<button class="chip" onclick="App.setFiltroTipo('${c.nombre}', this)">${c.nombre}</button>`);

            // Rellenar todos los Selects
            const updateSelect = (id, data) => {
                const el = document.getElementById(id);
                if(el) {
                    el.innerHTML = id.includes('fam') ? '<option value="">Sin Familia/Todas</option>' : '<option value="">Seleccionar...</option>';
                    data.forEach(d => el.innerHTML += `<option value="${d.id}">${d.nombre}</option>`);
                }
            };

            updateSelect('f-cat', cats);
            updateSelect('bulk-tipo', cats);
            updateSelect('f-fam', fams);
            updateSelect('bulk-familia', fams);
            updateSelect('filtro-familia', fams);

        } catch(e) { console.error(e); }
    },

    // --- MULTI-ARCHIVOS (FOTOS Y PDF) ---
    subirArchivos: async (input) => {
        if(!input.files.length) return;
        
        const btn = input.parentElement;
        const txt = btn.innerText;
        btn.innerText = "⏳ Subiendo...";

        for (let i = 0; i < input.files.length; i++) {
            const file = input.files[i];
            const fd = new FormData(); 
            fd.append('file', file);
            
            try {
                const res = await fetch('/api/subir_foto', { method: 'POST', body: fd });
                if(res.ok) {
                    const data = await res.json();
                    // Añadimos a la lista local
                    App.archivosActuales.push({
                        url: data.url,
                        nombre: file.name,
                        tipo: data.tipo
                    });
                }
            } catch(e) { alert("Error al subir " + file.name); }
        }
        
        App.renderListaArchivos();
        btn.innerText = txt;
        input.value = ""; // Limpiar input para permitir subir el mismo archivo de nuevo
    },

    renderListaArchivos: () => {
        const div = document.getElementById('lista-archivos');
        div.innerHTML = "";
        
        if (App.archivosActuales.length === 0) {
            div.innerHTML = "<span style='color:#999; font-size:12px;'>Sin archivos adjuntos.</span>";
            return;
        }

        App.archivosActuales.forEach((arch, idx) => {
            const icon = arch.tipo === 'pdf' ? '📄' : `<img src="${arch.url}" style="height:30px; border-radius:2px;">`;
            div.innerHTML += `
                <div style="display:flex; align-items:center; gap:5px; background:white; padding:5px; border:1px solid #ddd; border-radius:4px; font-size:11px;">
                    <a href="${arch.url}" target="_blank" style="text-decoration:none;">${icon}</a>
                    <span style="max-width:100px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${arch.nombre}</span>
                    <span onclick="App.quitarArchivo(${idx})" style="cursor:pointer; color:red; font-weight:bold; margin-left:5px;">✕</span>
                </div>
            `;
        });
    },

    quitarArchivo: (idx) => {
        if(confirm("¿Quitar archivo de la lista?")) {
            App.archivosActuales.splice(idx, 1);
            App.renderListaArchivos();
        }
    },

    // --- GESTIÓN DE FAMILIAS Y TIPOS (Corregido) ---
    crearFamilia: async () => {
        const nombre = prompt("Nombre de la nueva Familia:");
        if(!nombre) return;
        await fetch('/api/familias', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ nombre: nombre }) });
        App.cargarSelects(); 
        alert("Familia creada");
    },
    crearTipo: async () => {
        const nombre = prompt("Nombre del nuevo Tipo:");
        if(!nombre) return;
        await fetch('/api/categorias', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ nombre: nombre }) });
        App.cargarSelects(); 
        alert("Tipo creado");
    },
    abrirGestionAux: () => document.getElementById('modal-aux').classList.remove('oculto'),

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
            const okFam = fam === 'TODAS' || nFam === fam;
            const okEst = est === 'TODOS' || (t.estado || 'EN ALMACEN') === est;
            const okTxt = (t.nombre+t.id_troquel+t.ubicacion).toLowerCase().includes(txt);
            
            return okTipo && okFam && okEst && okTxt;
        });

        // Ordenar
        filtrados.sort((a, b) => {
            let vA = (a[App.columnaOrden] || "").toString();
            let vB = (b[App.columnaOrden] || "").toString();
            
            if(App.columnaOrden === 'categoria') { vA = App.mapaCat[a.categoria_id]||""; vB = App.mapaCat[b.categoria_id]||""; }
            if(App.columnaOrden === 'familia') { vA = App.mapaFam[a.familia_id]||""; vB = App.mapaFam[b.familia_id]||""; }

            const nA = parseFloat(vA); const nB = parseFloat(vB);
            if(!isNaN(nA) && !isNaN(nB) && !vA.match(/[a-z]/i)) return App.ordenAsc ? nA - nB : nB - nA;
            return App.ordenAsc ? vA.localeCompare(vB) : vB.localeCompare(vA);
        });

        if(filtrados.length===0) { tbody.innerHTML = '<tr><td colspan="8" style="padding:20px; text-align:center">Sin datos</td></tr>'; return; }

        tbody.innerHTML = filtrados.map(t => {
            const chk = App.seleccionados.has(t.id) ? 'checked' : '';
            
            // Badge Documentos
            const numDocs = (t.archivos && Array.isArray(t.archivos)) ? t.archivos.length : 0;
            const docBadge = numDocs > 0 ? `<span class="obs-pildora" style="background:#e0f2fe; color:#0369a1;">📎 ${numDocs}</span>` : '-';
            
            // Badge Estado
            let estadoHtml = `<span style="background:#dcfce7; color:#166534; padding:3px 8px; border-radius:10px; font-size:11px; font-weight:700;">ALMACÉN</span>`;
            if (t.estado === 'EN PRODUCCION') estadoHtml = `<span style="background:#fee2e2; color:#991b1b; padding:3px 8px; border-radius:10px; font-size:11px; font-weight:700;">PRODUCCIÓN</span>`;
            if (t.estado === 'DESCATALOGADO') estadoHtml = `<span style="background:#f3f4f6; color:#6b7280; padding:3px 8px; border-radius:10px; font-size:11px; font-weight:700;">BAJA</span>`;

            // Nota: Quitamos el onclick del TR para que no se abra por error
            return `
            <tr style="${t.estado==='DESCATALOGADO'?'opacity:0.6':''}">
                <td style="text-align:center;"><input type="checkbox" value="${t.id}" ${chk} onchange="App.select(this, ${t.id})"></td>
                <td style="text-align:center;">${docBadge}</td>
                <td style="text-align:center;">${estadoHtml}</td>
                <td style="font-weight:900; color:#0f766e;">${t.id_troquel}</td>
                <td style="font-weight:800;">${t.ubicacion}</td>
                <td>${t.nombre}</td>
                <td><small>${App.mapaFam[t.familia_id] || '-'}</small></td>
                <td>
                    <button class="btn-icono" onclick="App.editar(${t.id})" title="Editar">✏️</button>
                    <button class="btn-icono" onclick="App.generarQR('${t.id_troquel}', '${t.ubicacion}', '${t.nombre.replace(/'/g, "")}')" title="QR">🖨️</button>
                    <button class="btn-icono" onclick="App.descatalogar(${t.id})" title="Descatalogar" style="color:orange;">🚫</button>
                    <button class="btn-icono" onclick="App.borrar(${t.id})" title="Borrar" style="color:red;">🗑️</button>
                </td>
            </tr>`;
        }).join('');
    },

    // --- CRUD ---
    nav: (v) => { 
        document.querySelectorAll('.vista').forEach(x => x.classList.add('oculto')); 
        document.getElementById(v).classList.remove('oculto');
        if(v === 'vista-lista') document.getElementById('sidebar').classList.remove('oculto');
    },
    
    volverDesdeForm: () => {
        if(App.modoMovil) App.activarModoMovil();
        else App.nav('vista-lista');
    },

    nuevoTroquel: () => { 
        document.getElementById('titulo-form').innerText = "Nuevo"; 
        document.querySelector('form').reset(); 
        document.getElementById('f-id-db').value = ""; 
        App.archivosActuales = []; // Reset archivos
        App.renderListaArchivos();
        
        if(App.modoMovil) document.getElementById('sidebar').classList.add('oculto');
        App.nav('vista-formulario'); 
    },

    editar: (id) => {
        const t = App.datos.find(x => x.id === id);
        if (!t) return;
        document.getElementById('titulo-form').innerText = "Editar";
        document.getElementById('f-id-db').value = t.id;
        document.getElementById('f-matricula').value = t.id_troquel;
        document.getElementById('f-ubicacion').value = t.ubicacion;
        document.getElementById('f-nombre').value = t.nombre;
        document.getElementById('f-cat').value = t.categoria_id || "";
        document.getElementById('f-fam').value = t.familia_id || "";
        document.getElementById('f-medidas-madera').value = t.tamano_troquel || "";
        document.getElementById('f-medidas-corte').value = t.tamano_final || "";
        document.getElementById('f-arts').value = t.codigos_articulo || "";
        document.getElementById('f-ot').value = t.referencias_ot || "";
        document.getElementById('f-obs').value = t.observaciones || "";
        
        // Cargar archivos existentes (Si es null, array vacío)
        App.archivosActuales = (t.archivos && Array.isArray(t.archivos)) ? t.archivos : [];
        App.renderListaArchivos();
        
        if(App.modoMovil) document.getElementById('sidebar').classList.add('oculto');
        App.nav('vista-formulario');
    },

    guardarFicha: async (e) => {
        e.preventDefault();
        const id = document.getElementById('f-id-db').value;
        const data = {
            id_troquel: document.getElementById('f-matricula').value,
            ubicacion: document.getElementById('f-ubicacion').value,
            nombre: document.getElementById('f-nombre').value,
            categoria_id: parseInt(document.getElementById('f-cat').value) || null,
            familia_id: parseInt(document.getElementById('f-fam').value) || null,
            tamano_troquel: document.getElementById('f-medidas-madera').value,
            tamano_final: document.getElementById('f-medidas-corte').value,
            codigos_articulo: document.getElementById('f-arts').value,
            referencias_ot: document.getElementById('f-ot').value,
            observaciones: document.getElementById('f-obs').value,
            archivos: App.archivosActuales // Guardamos la lista completa
        };
        const method = id ? 'PUT' : 'POST';
        const url = id ? `/api/troqueles/${id}` : '/api/troqueles';
        
        await fetch(url, { method: method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
        App.cargarTodo();
        App.volverDesdeForm();
    },

    // --- ACCIONES AUXILIARES ---
    calcularSiguienteId: async () => {
        const idDb = document.getElementById('f-id-db').value;
        if(idDb) return;
        const catId = document.getElementById('f-cat').value;
        if(!catId) return;
        try {
            const res = await fetch(`/api/siguiente_numero?categoria_id=${catId}`);
            const data = await res.json();
            document.getElementById('f-matricula').value = data.siguiente;
            document.getElementById('f-ubicacion').value = data.siguiente;
        } catch(e){}
    },

    // --- MODO MÓVIL ---
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
    buscarMovil: (txt) => {
        const div = document.getElementById('resultados-movil');
        div.innerHTML = "";
        if(txt.length < 2) return;
        const hits = App.datos.filter(t => (t.nombre+t.id_troquel+t.ubicacion).toLowerCase().includes(txt.toLowerCase()));
        div.innerHTML = hits.slice(0, 10).map(t => `<div class="card-movil" onclick="App.editar(${t.id})"><div style="font-weight:900; color:#0f766e; font-size:18px;">${t.id_troquel}</div><div style="font-weight:bold;">${t.ubicacion}</div><div>${t.nombre}</div><button class="btn-secundario" style="width:100%; margin-top:5px;">Ver</button></div>`).join('');
    },

    // --- UTILIDADES ---
    setFiltroTipo: (tipo, btn) => { App.filtroTipo = tipo; document.querySelectorAll('.chip').forEach(c => c.classList.remove('activo')); btn.classList.add('activo'); App.renderTabla(); },
    filtrar: () => { const btn = document.getElementById('btn-limpiar'); const txt = document.getElementById('buscador').value; btn.classList.toggle('oculto', txt === ''); App.renderTabla(); },
    limpiarBuscador: () => { document.getElementById('buscador').value=''; App.filtrar(); },
    ordenar: (col) => { if(App.columnaOrden === col) App.ordenAsc = !App.ordenAsc; else { App.columnaOrden = col; App.ordenAsc = true; } App.renderTabla(); },
    descatalogar: async (id) => { if(!confirm("¿Descatalogar?")) return; const t = App.datos.find(x => x.id === id); t.estado = "DESCATALOGADO"; await fetch(`/api/troqueles/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(t) }); App.cargarTodo(); },
    borrar: async (id) => { if(!confirm("¿ELIMINAR DEFINITIVAMENTE?")) return; await fetch(`/api/troqueles/${id}`, { method: 'DELETE' }); App.cargarTodo(); },
    
    // --- SELECCION MASIVA ---
    select: (chk, id) => { if (chk.checked) App.seleccionados.add(id); else App.seleccionados.delete(id); App.updatePanel(); },
    toggleAll: (chk) => { document.querySelectorAll('#tabla-body input[type="checkbox"]').forEach(c => { c.checked = chk.checked; if(chk.checked) App.seleccionados.add(parseInt(c.value)); else App.seleccionados.delete(parseInt(c.value)); }); App.updatePanel(); },
    updatePanel: () => { const p = document.getElementById('panel-acciones'); if(App.seleccionados.size>0) { p.classList.remove('oculto'); document.getElementById('contador-sel').innerText=App.seleccionados.size; } else p.classList.add('oculto'); },
    limpiarSeleccion: () => { App.seleccionados.clear(); document.getElementById('check-all').checked=false; App.updatePanel(); App.renderTabla(); },
    
    moverLote: async (acc) => { await fetch('/api/movimientos/lote', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: Array.from(App.seleccionados), accion: acc }) }); App.limpiarSeleccion(); App.cargarTodo(); },
    asignarMasivo: async (campo) => { let selectId = campo === 'familia' ? 'bulk-familia' : 'bulk-tipo'; let val = document.getElementById(selectId).value; if(!val || App.seleccionados.size === 0) return alert("Selecciona valor y troqueles"); if(!confirm(`¿Aplicar a ${App.seleccionados.size} troqueles?`)) return; await fetch(`/api/troqueles/bulk/${campo}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: Array.from(App.seleccionados), valor_id: parseInt(val) }) }); App.limpiarSeleccion(); App.cargarTodo(); },

    // --- SCANNER & QR ---
    generarQR: (id, ubi, nom) => { document.getElementById('modal-qr').classList.remove('oculto'); document.getElementById('qr-texto-ubi').innerText = ubi || "SIN UBI"; document.getElementById('qr-texto-id').innerText = id; document.getElementById('qr-texto-desc').innerText = nom; new QRious({ element: document.getElementById('qr-canvas'), value: id, size: 200, padding: 0, level: 'M' }); },
    toggleScanner: (show=true) => { const el = document.getElementById('modal-scanner'); if(show) { el.classList.remove('oculto'); App.scanner = new Html5Qrcode("reader"); App.scanner.start({facingMode:"environment"}, {fps:10}, (t) => { const f = App.datos.find(x => x.id_troquel === t); if(f) { App.seleccionados.add(f.id); document.getElementById('lista-escaneados').innerHTML += `<span class="chip">${t}</span>`; } }); } else { el.classList.add('oculto'); if(App.scanner) App.scanner.stop(); } },
    procesarEscaneo: (acc) => { App.moverLote(acc); App.toggleScanner(false); },
    cargarHistorial: async () => { const res = await fetch('/api/historial'); const data = await res.json(); document.getElementById('tabla-historial').innerHTML = data.map(h => `<tr><td>${new Date(h.fecha_hora).toLocaleString()}</td><td>${h.troqueles?.nombre}</td><td>${h.accion}</td><td>${h.ubicacion_anterior||'-'} -> ${h.ubicacion_nueva||'-'}</td></tr>`).join(''); },
    exportarCSV: () => { let csv = "Matricula,Ubicacion,Nombre,Tipo,Familia,Estado\n"; App.datos.forEach(t => csv += `${t.id_troquel},${t.ubicacion},${t.nombre},${App.mapaCat[t.categoria_id]},${App.mapaFam[t.familia_id]},${t.estado}\n`); const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURI(csv); a.download = 'inventario.csv'; a.click(); }
};

window.onload = App.init;