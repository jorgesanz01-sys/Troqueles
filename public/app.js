// =============================================================
// ERP PACKAGING - LÓGICA V27 (APP LIMPIA Y DETALLE MÓVIL FULL)
// =============================================================

const App = {
    datos: [], seleccionados: new Set(), filtroTipo: 'TODOS',
    mapaCat: {}, mapaFam: {}, columnaOrden: 'id_troquel', ordenAsc: true,
    scanner: null, modoMovil: false, modoScanner: 'LOTE', 
    archivosActuales: [], escaneadosLote: new Map(), enPapelera: false,

    init: async () => {
        console.log("Iniciando ERP V27 (Estilo JSD)...");
        try {
            await App.cargarSelects();
            await App.cargarTodo();
            const params = new URLSearchParams(window.location.search);
            if (params.get('modo') === 'operario') {
                document.body.classList.add('kiosk-mode');
                App.activarModoMovil();
            }
        } catch(e) { console.error("Error iniciando app:", e); }
    },

    cargarTodo: async (papelera = false) => {
        try {
            App.enPapelera = papelera;
            const res = await fetch(`/api/troqueles?ver_papelera=${papelera}`);
            if (res.ok) {
                App.datos = await res.json() || [];
                App.limpiarSeleccion(); 
                App.renderTabla();
                
                document.getElementById('titulo-lista').innerText = papelera ? "🗑️ PAPELERA" : "Inventario Activo";
                
                const divHerramientasPapelera = document.getElementById('herramientas-papelera');
                if (papelera) { 
                    if(divHerramientasPapelera) divHerramientasPapelera.classList.remove('oculto'); 
                } else { 
                    if(divHerramientasPapelera) divHerramientasPapelera.classList.add('oculto'); 
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
            llenar('select-import-tipo', cats, 'Tipo al importar...');
        } catch (e) { console.error(e); }
    },

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
            const okTxt = (t.nombre+t.id_troquel+(t.ubicacion||"")+(t.codigos_articulo||"")).toLowerCase().includes(txt);
            return okTip && okFam && okEst && okTxt;
        });

        res.sort((a,b) => {
            let vA = (a[App.columnaOrden]||"").toString(), vB = (b[App.columnaOrden]||"").toString();
            if(App.columnaOrden==='familia') { vA=App.mapaFam[a.familia_id]||""; vB=App.mapaFam[b.familia_id]||""; }
            const nA=parseFloat(vA), nB=parseFloat(vB);
            if(!isNaN(nA)&&!isNaN(nB)&&!vA.match(/[a-z]/i)) return App.ordenAsc ? nA-nB : nB-nA;
            return App.ordenAsc ? vA.localeCompare(vB) : vB.localeCompare(vA);
        });

        if(res.length===0) { tbody.innerHTML='<tr><td colspan="9" class="text-center">Sin datos</td></tr>'; return; }

        tbody.innerHTML = res.map(t => {
            const chk = App.seleccionados.has(t.id) ? 'checked' : '';
            const nDocs = (t.archivos && t.archivos.length) || 0;
            const bdg = nDocs > 0 ? `<span class="obs-pildora">📎 ${nDocs}</span>` : '-';
            
            let col = 'var(--success)', bg = '#dcfce7';
            let textoEstado = 'ALMACÉN';
            
            if(t.estado === 'EN PRODUCCION') { col = 'var(--danger)'; bg = '#fee2e2'; textoEstado = 'PRODUCCIÓN'; }
            if(t.estado === 'DESCATALOGADO') { col = '#6b7280'; bg = '#f3f4f6'; textoEstado = 'OBSOLETO'; }

            const st = `<span style="background:${bg}; color:${col}; padding:3px 8px; border-radius:10px; font-size:10px; font-weight:800; letter-spacing:0.5px;">${textoEstado}</span>`;

            let fam = App.mapaFam[t.familia_id];
            if(!fam && t.familia_id) fam = `<span style="color:red">ID:${t.familia_id}</span>`;

            let btns = `
                <button class="btn-icono" onclick="App.verHistorialTroquel(${t.id}, '${t.id_troquel}', '${t.nombre.replace(/'/g,"")}')" title="Historial">🕒</button>
                <button class="btn-icono" onclick="App.generarQR(${t.id})" title="Imprimir Etiqueta">🖨️</button>
                <button class="btn-icono" onclick="App.borrar(${t.id})" style="color:red" title="A la papelera">🗑️</button>
            `;
            if(App.enPapelera) {
                btns = `
                    <button class="btn-accion" style="background:#22c55e; padding:2px 5px; margin-right:5px;" onclick="App.restaurar(${t.id})" title="Restaurar">♻️</button>
                    <button class="btn-accion" style="background:#b91c1c; padding:2px 5px;" onclick="App.destruirUnico(${t.id})" title="Destruir Definitivamente">🔥</button>
                `;
            }

            return `<tr style="${t.estado==='DESCATALOGADO'?'opacity:0.6':''}" onclick="App.verFicha(${t.id})" style="cursor:pointer;">
                <td onclick="event.stopPropagation()" class="text-center"><input type="checkbox" value="${t.id}" ${chk} onchange="App.select(this, ${t.id})"></td>
                <td class="text-center">${bdg}</td><td class="text-center">${st}</td>
                <td style="font-weight:900; color:var(--text-main);">${t.id_troquel}</td>
                <td>${t.ubicacion}</td>
                <td style="color:var(--primary); font-weight:bold;">${t.codigos_articulo || '-'}</td>
                <td>${t.nombre}</td>
                <td><small>${fam||'-'}</small></td>
                <td onclick="event.stopPropagation()" style="white-space: nowrap;">${btns}</td>
            </tr>`;
        }).join('');
    },

    cargarEstadisticas: async (meses) => {
        const tbody = document.getElementById('tabla-estadisticas');
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">Cargando cálculos... ⏳</td></tr>';
        try {
            const res = await fetch(`/api/estadisticas/inactivos?meses=${meses}`);
            const data = await res.json();
            if (data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center">¡Genial! No tienes troqueles obsoletos en este periodo.</td></tr>'; return;
            }
            tbody.innerHTML = data.map(t => {
                const fecha = t.ultima_fecha ? new Date(t.ultima_fecha).toLocaleDateString() : 'Nunca usado';
                return `<tr>
                    <td style="font-weight:900; color:#0f766e;">${t.id_troquel}</td>
                    <td style="color:#0369a1; font-weight:bold;">${t.codigos_articulo || '-'}</td>
                    <td>${t.nombre}</td><td>${t.estado || 'EN ALMACÉN'}</td>
                    <td style="color:#b91c1c; font-weight:bold;">${fecha}</td>
                    <td><button class="btn-accion" style="background:#64748b;" onclick="App.descatalogar(${t.id})">⛔ Descatalogar</button></td>
                </tr>`;
            }).join('');
        } catch (e) { tbody.innerHTML = '<tr><td colspan="6" class="text-center text-red">Error al cargar las estadísticas</td></tr>'; }
    },
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
        
        document.getElementById('movil-tipo').innerText = App.mapaCat[t.categoria_id] || '-';
        document.getElementById('movil-familia').innerText = App.mapaFam[t.familia_id] || '-';
        document.getElementById('movil-madera').innerText = t.tamano_troquel || '-';
        document.getElementById('movil-corte').innerText = t.tamano_final || '-';
        document.getElementById('movil-ot').innerText = t.referencias_ot || '-';
        document.getElementById('movil-arts').innerText = t.codigos_articulo || 'Sin artículos';
        document.getElementById('movil-obs').innerText = t.observaciones || 'Sin observaciones.';

        const galMovil = document.getElementById('movil-galeria');
        galMovil.innerHTML = "";
        if (t.archivos && t.archivos.length > 0) {
            t.archivos.forEach(arch => {
                const icon = arch.tipo === 'pdf' ? '📄' : `<img src="${arch.url}" style="height:40px; border-radius:4px; border:1px solid #cbd5e1;">`;
                galMovil.innerHTML += `<a href="${arch.url}" target="_blank" style="margin-right:5px; text-decoration:none; display:inline-block; text-align:center; color:#334155;">${icon}</a>`;
            });
        } else {
            galMovil.innerHTML = "<span style='color:#94a3b8; font-size:12px;'>No hay archivos adjuntos</span>";
        }

        let stHtml = `<span style="background:#dcfce7; color:#166534; padding:5px 10px; border-radius:15px; font-weight:bold;">ALMACÉN</span>`;
        if(t.estado === 'EN PRODUCCION') stHtml = `<span style="background:#fee2e2; color:#991b1b; padding:5px 10px; border-radius:15px; font-weight:bold;">PRODUCCIÓN</span>`;
        if(t.estado === 'DESCATALOGADO') stHtml = `<span style="background:#f3f4f6; color:#6b7280; padding:5px 10px; border-radius:15px; font-weight:bold;">OBSOLETO</span>`;
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
                App.abrirDetalleMovil(id);
            }
        } catch(e) { alert("Error foto"); }
    },
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

    select: (c,id) => { c.checked ? App.seleccionados.add(id) : App.seleccionados.delete(id); App.updatePanel(); },
    toggleAll: (c) => { document.querySelectorAll('#tabla-body input[type="checkbox"]').forEach(k=>{ k.checked=c.checked; c.checked ? App.seleccionados.add(parseInt(k.value)) : App.seleccionados.delete(parseInt(k.value)); }); App.updatePanel(); },
    
    updatePanel: () => { 
        const p = document.getElementById('panel-acciones'); 
        if(App.seleccionados.size > 0) { 
            p.classList.remove('oculto'); 
            document.getElementById('contador-sel').innerText = App.seleccionados.size; 
            
            if(App.enPapelera) {
                document.getElementById('acciones-normales').style.display = 'none';
                document.getElementById('acciones-papelera').style.display = 'inline-flex';
            } else {
                document.getElementById('acciones-normales').style.display = 'inline-flex';
                document.getElementById('acciones-papelera').style.display = 'none';
            }
        } else { 
            p.classList.add('oculto'); 
        } 
    },
    limpiarSeleccion: () => { App.seleccionados.clear(); const chk = document.getElementById('check-all'); if(chk) chk.checked=false; App.updatePanel(); App.renderTabla(); },
    
    borrar: async (id) => { if(confirm("¿Mover a la papelera?")) { await fetch(`/api/troqueles/${id}`, { method:'DELETE' }); App.cargarTodo(); } },
    restaurar: async (id) => { await fetch(`/api/troqueles/${id}/restaurar`, {method:'POST'}); App.cargarTodo(true); },
    
    borrarLote: async () => {
        if(!confirm(`¿Mover ${App.seleccionados.size} troqueles a la papelera?`)) return;
        await fetch('/api/troqueles/bulk/papelera', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: Array.from(App.seleccionados) }) });
        App.limpiarSeleccion(); App.cargarTodo();
    },
    restaurarLote: async () => {
        await fetch('/api/troqueles/bulk/restaurar', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: Array.from(App.seleccionados) }) });
        App.limpiarSeleccion(); App.cargarTodo(true);
    },
    destruirLote: async () => {
        if(!confirm(`¡PELIGRO! ¿Eliminar permanentemente ${App.seleccionados.size} troqueles?\nEsta acción NO se puede deshacer.`)) return;
        await fetch('/api/troqueles/bulk/destruir', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: Array.from(App.seleccionados) }) });
        App.limpiarSeleccion(); App.cargarTodo(true);
    },
    destruirUnico: async (id) => {
        if(confirm("¡PELIGRO! ¿Eliminar este troquel para siempre? No podrás recuperarlo.")) {
            await fetch('/api/troqueles/bulk/destruir', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: [id] }) });
            App.cargarTodo(true);
        }
    },
    vaciarPapelera: async () => {
        if(App.datos.length === 0) { alert("La papelera ya está vacía."); return; }
        if(!confirm("⚠️ ¡PELIGRO EXTREMO! ⚠️\n\n¿Estás seguro de que quieres eliminar TODOS los troqueles de la papelera?\nSe borrarán para siempre y no hay marcha atrás.")) return;
        
        const todosIds = App.datos.map(t => t.id);
        await fetch('/api/troqueles/bulk/destruir', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: todosIds }) });
        App.cargarTodo(true);
    },
    restaurarTodoPapelera: async () => {
        if(App.datos.length === 0) return;
        const todosIds = App.datos.map(t => t.id);
        await fetch('/api/troqueles/bulk/restaurar', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: todosIds }) });
        App.cargarTodo(true);
    },

    verPapelera: () => App.cargarTodo(true), salirPapelera: () => App.cargarTodo(false),
    
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
    moverLote: async (acc) => { await fetch('/api/movimientos/lote', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: Array.from(App.seleccionados), accion: acc }) }); App.limpiarSeleccion(); App.cargarTodo(); },
    asignarMasivo: async (c) => { let id=c==='familia'?'bulk-familia':'bulk-tipo'; let v=document.getElementById(id).value; if(v && confirm("¿Aplicar?")) { await fetch(`/api/troqueles/bulk/${c}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: Array.from(App.seleccionados), valor_id: parseInt(v) }) }); App.limpiarSeleccion(); App.cargarTodo(); } },
    abrirGestionAux: () => document.getElementById('modal-aux').classList.remove('oculto'),
    cargarHistorial: async () => { const r=await fetch('/api/historial'); const d=await r.json(); document.getElementById('tabla-historial').innerHTML=d.map(h=>`<tr><td>${new Date(h.fecha_hora).toLocaleString()}</td><td>${h.troqueles?.nombre}</td><td>${h.accion}</td><td>${h.ubicacion_anterior||'-'} -> ${h.ubicacion_nueva||'-'}</td></tr>`).join(''); },
    
    imprimirEtiquetasGodex: (items) => {
        let printWindow = window.open('', '_blank', 'width=600,height=600');
        
        if (!printWindow) {
            alert("⚠️ El navegador bloqueó la previsualización. Por favor, permite las ventanas emergentes (pop-ups) para esta web e inténtalo de nuevo.");
            return;
        }

        let html = `<!DOCTYPE html><html><head><title>Impresión Godex 50x23</title><style>@page { size: 50mm 23mm; margin: 0; } body { margin: 0; padding: 0; font-family: 'Arial', sans-serif; background: #fff; } .label { width: 50mm; height: 23mm; box-sizing: border-box; padding: 1mm; display: flex; align-items: center; justify-content: space-between; page-break-after: always; overflow: hidden; } .qr { width: 19mm; display: flex; justify-content: center; align-items: center; } .qr img { width: 18mm; height: 18mm; } .text { width: 28mm; padding-left: 1mm; display: flex; flex-direction: column; justify-content: center; } .mat { font-size: 8.5pt; font-weight: 900; line-height: 1; margin-bottom: 2px; color: black; } .ubi { font-size: 8.5pt; font-weight: 900; line-height: 1; margin-bottom: 3px; color: black; text-transform: uppercase; } .nom { font-size: 6pt; line-height: 1.1; color: black; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; margin-bottom: 2px; } .arts { font-size: 6pt; font-weight: bold; color: #333; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; } @media screen { body { background: #334155; padding: 20px; display: flex; flex-direction: column; align-items: center; } .label { background: #fff; margin-bottom: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); border-radius: 2px; } .btn { background: #14b8a6; color: white; padding: 15px 30px; border: none; border-radius: 8px; font-size: 18px; font-weight: bold; cursor: pointer; margin-bottom: 20px; } } @media print { .no-print { display: none !important; } }</style></head><body><button class="no-print btn" onclick="window.print()">🖨️ Iniciar Impresión Godex</button>`;
        
        items.forEach(t => {
            const qr = new QRious({ value: t.id.toString(), size: 150, level: 'M' });
            const htmlArt = t.codigos_articulo ? `<div class="arts">Art: ${t.codigos_articulo}</div>` : '';
            html += `<div class="label"><div class="qr"><img src="${qr.toDataURL()}"></div><div class="text"><div class="mat">TROQUEL ${t.id_troquel}</div><div class="ubi">UBI: ${t.ubicacion || '-'}</div><div class="nom">${t.nombre}</div>${htmlArt}</div></div>`;
        });
        html += `</body></html>`;
        
        printWindow.document.write(html);
        printWindow.document.close();
        
        const modalQr = document.getElementById('modal-qr');
        if (modalQr) {
            modalQr.classList.add('oculto');
        }

        setTimeout(() => { 
            printWindow.print(); 
        }, 800);
    },
    
    imprimirLoteQRs: () => { if(App.seleccionados.size === 0) return; const itemsToPrint = Array.from(App.seleccionados).map(id => App.datos.find(t => t.id === id)).filter(t => t); App.imprimirEtiquetasGodex(itemsToPrint); App.limpiarSeleccion(); },
    
    generarQR: (id_db) => { 
        const t = App.datos.find(x => x.id === id_db); if(!t) return;
        document.getElementById('modal-qr').classList.remove('oculto'); 
        
        document.getElementById('qr-texto-id').innerText = "TROQUEL " + t.id_troquel; 
        document.getElementById('qr-texto-ubi').innerText = "UBI: " + (t.ubicacion || '-'); 
        document.getElementById('qr-texto-desc').innerText = t.nombre; 
        
        const elArts = document.getElementById('qr-texto-arts');
        if(elArts) { if(t.codigos_articulo) { elArts.innerText = "Art: " + t.codigos_articulo; elArts.style.display = "block"; } else { elArts.style.display = "none"; } }
        new QRious({ element: document.getElementById('qr-canvas'), value: t.id.toString(), size: 200, padding: 0, level: 'M' }); 
        
        document.getElementById('btn-imprimir-qr-unico').onclick = () => { App.imprimirEtiquetasGodex([t]); };
    },

    limpiarDuplicadosExactos: async () => {
        if(confirm("⚠️ ¿Estás seguro? Esto escaneará toda tu base de datos y borrará los troqueles que sean COPIAS EXACTAS (misma matrícula, misma descripción, mismo tipo, etc.).")) {
            const btn = document.getElementById('btn-limpiar-dup');
            if(btn) btn.innerText = "⏳ Limpiando Base de Datos...";
            try {
                const res = await fetch('/api/mantenimiento/limpiar_duplicados', { method: 'DELETE' });
                const data = await res.json();
                alert(`✅ Limpieza completada.\n\nSe han pulverizado ${data.borrados} troqueles que estaban repetidos y eran idénticos.`);
                await App.cargarTodo();
            } catch(e) {
                alert("❌ Ocurrió un error al limpiar los duplicados.");
                console.error(e);
            }
            if(btn) btn.innerText = "🧹 Borrar Duplicados Exactos de la BD";
            document.getElementById('modal-aux').classList.add('oculto');
        }
    },

    procesarImportacion: async (input) => { 
        const file = input.files[0]; 
        if(!file) return; 

        const selectElement = document.getElementById('select-import-tipo');
        const idTipoDefecto = (selectElement && selectElement.value) ? parseInt(selectElement.value) : null;
        
        const reader = new FileReader(); 
        reader.onload = async(e) => { 
            try {
                const filas = e.target.result.split(/\r?\n/); 
                if(filas.length < 2) { alert("El archivo está vacío o no tiene datos."); return; }
                
                const cabeceraStr = filas[0];
                const separador = cabeceraStr.includes(';') ? ';' : ',';
                const normalizar = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/['"]/g,'').trim();
                const cabecera = cabeceraStr.split(separador).map(c => normalizar(c));
                
                let colsMap = { mat: -1, ubi: -1, nom: -1, tipo: -1, ot: -1, arts: -1, madera: -1, corte: -1, obs: -1 };

                cabecera.forEach((c, index) => {
                    if (/MATR|ID|CODIGO|NUMERO|REF|TROQUEL/i.test(c) && colsMap.mat === -1) colsMap.mat = index;
                    else if (/UBI|LOC|ESTAN|HUECO|SITIO|LUGAR/i.test(c) && colsMap.ubi === -1) colsMap.ubi = index;
                    else if (/DESC|NOM|CLIENT|MOD|TITULO/i.test(c) && colsMap.nom === -1) colsMap.nom = index;
                    else if (/TIPO|FAM|CAT|CLASE|GRUPO/i.test(c) && colsMap.tipo === -1) colsMap.tipo = index;
                    else if (/OT|ORDEN|TRABAJO/i.test(c) && colsMap.ot === -1) colsMap.ot = index;
                    else if (/ART|EAN|PROD/i.test(c) && colsMap.arts === -1) colsMap.arts = index;
                    else if (/MADERA|BASE|TAM|DIMEN/i.test(c) && colsMap.madera === -1) colsMap.madera = index;
                    else if (/CORTE|FINAL|DESARROLLO/i.test(c) && colsMap.corte === -1) colsMap.corte = index;
                    else if (/OBS|NOTAS|COMENTARIO/i.test(c) && colsMap.obs === -1) colsMap.obs = index;
                });

                if (colsMap.mat === -1) colsMap.mat = 0;
                if (colsMap.ubi === -1) colsMap.ubi = 1;
                if (colsMap.nom === -1) colsMap.nom = 2;

                const catNameToId = {};
                Object.keys(App.mapaCat).forEach(id => { catNameToId[normalizar(App.mapaCat[id])] = parseInt(id); });

                const troqueles = [];
                const hashesExistentes = new Set();
                let duplicadosOmitidos = 0;

                const generarHuella = (t) => {
                    return [
                        t.id_troquel, t.ubicacion, t.nombre, t.categoria_id, t.familia_id,
                        t.codigos_articulo, t.referencias_ot, t.tamano_troquel, t.tamano_final, t.observaciones
                    ].map(x => (x || "").toString().trim().toUpperCase()).join('|');
                };

                App.datos.forEach(t => hashesExistentes.add(generarHuella(t)));

                for(let i=1; i<filas.length; i++) {
                    const f = filas[i];
                    if(!f.trim()) continue;
                    
                    const cols = f.split(separador);
                    const mat = colsMap.mat !== -1 && cols[colsMap.mat] ? cols[colsMap.mat].replace(/['"]/g,'').trim() : null;
                    if(!mat) continue; 

                    const ubi = colsMap.ubi !== -1 && cols[colsMap.ubi] ? cols[colsMap.ubi].replace(/['"]/g,'').trim() : mat;
                    const nom = colsMap.nom !== -1 && cols[colsMap.nom] ? cols[colsMap.nom].replace(/['"]/g,'').trim() : "Sin Descripción";
                    const tipoStr = colsMap.tipo !== -1 && cols[colsMap.tipo] ? normalizar(cols[colsMap.tipo]) : null;
                    const ot = colsMap.ot !== -1 && cols[colsMap.ot] ? cols[colsMap.ot].replace(/['"]/g,'').trim() : "";
                    const arts = colsMap.arts !== -1 && cols[colsMap.arts] ? cols[colsMap.arts].replace(/['"]/g,'').trim() : "";
                    const madera = colsMap.madera !== -1 && cols[colsMap.madera] ? cols[colsMap.madera].replace(/['"]/g,'').trim() : "";
                    const corte = colsMap.corte !== -1 && cols[colsMap.corte] ? cols[colsMap.corte].replace(/['"]/g,'').trim() : "";
                    const obs = colsMap.obs !== -1 && cols[colsMap.obs] ? cols[colsMap.obs].replace(/['"]/g,'').trim() : "";
                    
                    let catId = idTipoDefecto; 
                    if(tipoStr && catNameToId[tipoStr]) catId = catNameToId[tipoStr]; 

                    const nuevoTroquel = { 
                        id_troquel: mat, ubicacion: ubi, nombre: nom, categoria_id: catId,
                        referencias_ot: ot, codigos_articulo: arts,
                        tamano_troquel: madera, tamano_final: corte, observaciones: obs
                    };

                    const huella = generarHuella(nuevoTroquel);

                    if (!hashesExistentes.has(huella)) {
                        troqueles.push(nuevoTroquel);
                        hashesExistentes.add(huella); 
                    } else {
                        duplicadosOmitidos++;
                    }
                }
                
                if(troqueles.length === 0) { 
                    alert(`No hay nada nuevo que importar.\nSe han ignorado ${duplicadosOmitidos} filas porque eran copias EXACTAS de troqueles que ya tenías en el sistema.`); 
                    input.value = ""; return; 
                }
                
                const res = await fetch('/api/troqueles/importar', { 
                    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(troqueles) 
                });
                
                if(res.ok) { 
                    App.cargarTodo(); 
                    let msj = `✅ ÉXITO: Se han importado ${troqueles.length} troqueles nuevos.`;
                    if(duplicadosOmitidos > 0) msj += `\n\n🛡️ SISTEMA ANTI-DUPLICADOS: Se han bloqueado ${duplicadosOmitidos} filas que estaban repetidas.`;
                    alert(msj);
                    if(selectElement) selectElement.value = ""; 
                } else {
                    alert(`❌ ERROR DE BASE DE DATOS:\nProbablemente algún código del Excel rompe alguna regla de la BD.`);
                }
            } catch (err) { console.error("Fallo general:", err); alert("❌ Ocurrió un error procesando el archivo."); }
            input.value = ""; 
        }; 
        reader.readAsText(file, 'ISO-8859-1');
    },
    
    // --- SISTEMA DE BACKUP PRO ---
    exportarCopiaSeguridad: () => {
        if(App.datos.length === 0) {
            alert("No hay datos para exportar.");
            return;
        }
        const dataStr = JSON.stringify(App.datos, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `BACKUP_TOTAL_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
    },

    restaurarCopiaSeguridad: async (input) => {
        const file = input.files[0];
        if(!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const backupData = JSON.parse(e.target.result);
                if(!confirm(`Se van a restaurar/actualizar ${backupData.length} troqueles. ¿Estás seguro?`)) return;

                const res = await fetch('/api/troqueles/backup/restaurar', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(backupData)
                });

                if(res.ok) {
                    alert("✅ Base de datos restaurada con éxito.");
                    location.reload(); 
                } else {
                    alert("❌ Error al subir el backup al servidor.");
                }
            } catch (err) {
                alert("❌ El archivo no tiene un formato JSON válido.");
            }
        };
        reader.readAsText(file);
    }
    
// ¡AQUÍ ESTÁ LA LLAVE QUE FALTABA PARA CERRAR EL OBJETO APP! 👇
};

window.onload = App.init;