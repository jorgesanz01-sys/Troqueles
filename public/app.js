// =============================================================
// ERP PACKAGING - LÓGICA V44 (NUEVOS ESTADOS: REPARAR Y EXTERNO)
// =============================================================

const App = {
    datos: [], seleccionados: new Set(), filtroTipo: 'TODOS',
    mapaCat: {}, mapaFam: {}, columnaOrden: 'id_troquel', ordenAsc: true,
    scanner: null, modoMovil: false, modoScanner: 'LOTE', 
    archivosActuales: [], escaneadosLote: new Map(), enPapelera: false,
    intervaloRefresco: null,
    datosDescatalogados: [],
    datosPapelera: [],
    descatalogarTargetId: null,
    descatalogarModo: null,

    mostrarToast: (msj, tipo = 'exito') => {
        const container = document.getElementById('toast-container');
        if(!container) return;
        const toast = document.createElement('div');
        const color = tipo === 'exito' ? '#16a34a' : '#e11d48';
        toast.style.cssText = `background: ${color}; color: white; padding: 15px 25px; border-radius: 8px; margin-top: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); font-weight: bold; opacity: 0; transition: opacity 0.3s, transform 0.3s; transform: translateX(50px); border-left: 5px solid rgba(255,255,255,0.5);`;
        toast.innerHTML = tipo === 'exito' ? `✅ ${msj}` : `⚠️ ${msj}`;
        container.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '1'; toast.style.transform = 'translateX(0)'; }, 10);
        setTimeout(() => {
            toast.style.opacity = '0'; toast.style.transform = 'translateX(50px)';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    },

    reproducirBeep: (exito = true) => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator(); const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            if(exito) { osc.type='sine'; osc.frequency.setValueAtTime(800,ctx.currentTime); gain.gain.setValueAtTime(0.1,ctx.currentTime); osc.start(); osc.stop(ctx.currentTime+0.1); }
            else { osc.type='sawtooth'; osc.frequency.setValueAtTime(300,ctx.currentTime); gain.gain.setValueAtTime(0.1,ctx.currentTime); osc.start(); osc.stop(ctx.currentTime+0.3); }
        } catch(e) { console.log("Audio no soportado"); }
    },

    comprimirImagen: (file) => {
        return new Promise((resolve) => {
            if(!file.type.startsWith('image/')) return resolve(file);
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = event => {
                const img = new Image(); img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 1200; let width = img.width; let height = img.height;
                    if (width > MAX_WIDTH) { height = Math.round((height * MAX_WIDTH) / width); width = MAX_WIDTH; }
                    canvas.width = width; canvas.height = height;
                    const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height);
                    canvas.toBlob(blob => { resolve(new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", { type: 'image/jpeg' })); }, 'image/jpeg', 0.7);
                };
            };
        });
    },

    toggleDarkMode: () => { document.body.classList.toggle('dark-mode'); localStorage.setItem('erp_dark_mode', document.body.classList.contains('dark-mode')); },
    toggleSidebar: () => { document.getElementById('sidebar').classList.toggle('colapsado'); },
    toggleFullScreen: () => { if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(err => {}); else if (document.exitFullscreen) document.exitFullscreen(); },

    parseArchivos: (raw) => {
        if (!raw) return [];
        if (Array.isArray(raw)) return raw;
        if (typeof raw === 'string') {
            if (raw.trim() === "") return [];
            if (raw.trim().startsWith('[')) { try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch(e) { return []; } }
        }
        return [];
    },

    init: async () => {
        console.log("Iniciando ERP...");
        if(localStorage.getItem('erp_dark_mode') === 'true') document.body.classList.add('dark-mode');
        try {
            await App.cargarSelects();
            await App.cargarTodo();
            App.iniciarTiempoReal();
            const params = new URLSearchParams(window.location.search);
            const esMovil = window.innerWidth <= 850 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            if (params.get('modo') === 'operario' || esMovil) { document.body.classList.add('kiosk-mode'); App.activarModoMovil(); }
        } catch(e) { console.error("Error iniciando app:", e); }
    },

    iniciarTiempoReal: () => {
        if(App.intervaloRefresco) clearInterval(App.intervaloRefresco);
        App.intervaloRefresco = setInterval(async () => {
            const vistaLista = document.getElementById('vista-lista');
            if(!vistaLista.classList.contains('oculto') && !App.modoMovil) {
                try {
                    const res = await fetch('/api/troqueles?ver_papelera=false');
                    if (res.ok) { App.datos = await res.json() || []; App.filtrar(); }
                } catch(e) {}
            }
        }, 8000);
    },

    cargarTodo: async () => {
        try {
            const res = await fetch('/api/troqueles?ver_papelera=false');
            if (res.ok) {
                App.datos = await res.json() || [];
                App.datosDescatalogados = []; // invalidar cache búsqueda global
                App.limpiarSeleccion();
                App.renderTabla();
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
                const el = document.getElementById(id); if(el) {
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
            llenar('filtro-familia', fams, ''); llenar('select-import-tipo', cats, 'Tipo al importar...');
        } catch (e) { console.error(e); }
    },

    renderBannerPendientes: () => {
        const pendientes = App.datos.filter(t => t.referencias_ot === 'NUEVO - PENDIENTE');
        const n = pendientes.length;

        // Banner en inventario (siempre visible si hay pendientes)
        const banner = document.getElementById('banner-pendientes');
        if(banner) banner.style.display = n > 0 ? 'flex' : 'none';
        const countBanner = document.getElementById('banner-pendientes-count');
        if(countBanner) countBanner.innerText = n;

        // Contador en el sidebar
        const countSidebar = document.getElementById('sidebar-pendientes-count');
        if(countSidebar) {
            countSidebar.style.display = n > 0 ? 'inline-block' : 'none';
            countSidebar.innerText = n;
        }
    },

    verPendientes: async () => {
        document.querySelectorAll('.vista').forEach(v => v.classList.add('oculto'));
        document.getElementById('vista-pendientes').classList.remove('oculto');
        document.querySelectorAll('.menu-item').forEach(b => b.classList.remove('activo'));
        App.seleccionados.clear();
        App.renderPendientes();
    },

    renderPendientes: () => {
        const tbody = document.getElementById('tabla-pendientes-body');
        const counter = document.getElementById('pendientes-contador');
        if(!tbody) return;
        const res = App.datos.filter(t => t.referencias_ot === 'NUEVO - PENDIENTE' && t.estado !== 'DESCATALOGADO');
        if(counter) counter.innerText = res.length;
        if(res.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding:40px; color:#64748b;">No hay troqueles pendientes de validar. ✅</td></tr>';
            return;
        }
        tbody.innerHTML = res.map(t => {
            const archs = App.parseArchivos(t.archivos);
            const nDocs = archs.length;
            const bdg = nDocs > 0 ? `<span class="obs-pildora">📎 ${nDocs}</span>` : '-';
            const nomEsc = (t.nombre||'').replace(/'/g,'');
            // Miniatura foto si tiene
            const foto = archs.find(a => a.tipo !== 'pdf');
            const imgThumb = foto ? `<img src="${foto.url}" style="height:36px; width:36px; object-fit:cover; border-radius:4px; border:1px solid #e2e8f0; margin-right:6px; vertical-align:middle;">` : '';
            return `<tr style="background:#fffbeb; cursor:pointer;" onclick="App.verFicha(${t.id})">
                <td style="font-weight:900; color:#92400e;">${t.id_troquel}</td>
                <td>${t.ubicacion || '-'}</td>
                <td>${imgThumb}<span style="font-weight:600;">${t.nombre}</span></td>
                <td style="color:#0369a1;">${t.codigos_articulo || '<span style="color:#94a3b8">—</span>'}</td>
                <td style="color:#64748b; font-size:12px;">${App.mapaCat[t.categoria_id]||'-'} / ${App.mapaFam[t.familia_id]||'-'}</td>
                <td onclick="event.stopPropagation()" style="white-space:nowrap;">
                    <button class="btn-accion" style="background:#16a34a; padding:4px 10px; font-size:12px; margin-right:4px;" onclick="App.confirmarPendiente(${t.id})">✅ Confirmar</button>
                    <button class="btn-accion" style="background:#3b82f6; padding:4px 10px; font-size:12px; margin-right:4px;" onclick="App.editarPendiente(${t.id})">✏️ Editar</button>
                    <button class="btn-accion" style="background:#b91c1c; padding:4px 10px; font-size:12px;" onclick="App.borrar(${t.id}); setTimeout(()=>App.renderPendientes(),600)">🗑️</button>
                </td>
            </tr>`;
        }).join('');
    },

    editarPendiente: (id) => {
        // Va al formulario completo con todos los campos
        document.getElementById('vista-pendientes').classList.add('oculto');
        App.editar(id);
    },

    confirmarPendiente: async (id) => {
        const t = App.datos.find(x => x.id === id); if(!t) return;
        if(!confirm(`¿Confirmar y validar el troquel ${t.id_troquel} — ${t.nombre}?\nSe incorporará al inventario activo.`)) return;
        const payload = {
            id_troquel: String(t.id_troquel), ubicacion: String(t.ubicacion), nombre: String(t.nombre),
            categoria_id: t.categoria_id || null, familia_id: t.familia_id || null,
            tamano_troquel: String(t.tamano_troquel||""), tamano_final: String(t.tamano_final||""),
            codigos_articulo: String(t.codigos_articulo||""),
            referencias_ot: "",  // quita la marca NUEVO - PENDIENTE
            observaciones: String(t.observaciones||"").replace("Alta exprés desde móvil. Pendiente de validación por responsable.", "").trim(),
            estado: String(t.estado||"EN ALMACEN"),
            archivos: App.parseArchivos(t.archivos)
        };
        const res = await fetch(`/api/troqueles/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        if(res.ok) {
            App.mostrarToast(`✅ Troquel ${t.id_troquel} validado e incorporado al inventario.`);
            await App.cargarTodo();
            App.renderPendientes(); // refresca la vista pendientes sin salir
        } else { App.mostrarToast("Error al confirmar.", "error"); }
    },

    renderTabla: () => {
        const tbody = document.getElementById('tabla-body'); if (!tbody) return;
        const txt = document.getElementById('buscador').value.toLowerCase();
        const fam = document.getElementById('filtro-familia').value;
        const est = document.getElementById('filtro-estado').value;
        
        let res = App.datos.filter(t => {
            if(t.estado === 'DESCATALOGADO') return false;
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
        
        App.renderBannerPendientes();
        if(res.length===0) { tbody.innerHTML='<tr><td colspan="9" class="text-center">Sin datos</td></tr>'; return; }
        
        tbody.innerHTML = res.map(t => {
            const chk = App.seleccionados.has(t.id) ? 'checked' : '';
            const archs = App.parseArchivos(t.archivos); const nDocs = archs.length;
            const bdg = nDocs > 0 ? `<span class="obs-pildora">📎 ${nDocs}</span>` : '-';
            
            // LÓGICA DE COLORES DE ESTADO ACTUALIZADA
            let col = '#166534', bg = '#dcfce7', textoEstado = 'ALMACÉN';
            if(t.estado === 'EN PRODUCCION') { col = '#991b1b'; bg = '#fee2e2'; textoEstado = 'PRODUCCIÓN'; }
            else if(t.estado === 'REPARAR') { col = '#ea580c'; bg = '#ffedd5'; textoEstado = 'REPARACIÓN'; }
            else if(t.estado === 'EXTERNO') { col = '#7c3aed'; bg = '#f3e8ff'; textoEstado = 'EXTERNO'; }

            const st = `<span style="background:${bg}; color:${col}; padding:3px 8px; border-radius:10px; font-size:10px; font-weight:800; letter-spacing:0.5px;">${textoEstado}</span>`;
            
            let fam = App.mapaFam[t.familia_id];
            if(!fam && t.familia_id) fam = `<span style="color:red">ID:${t.familia_id}</span>`;
            const btns = `
                <button class="btn-icono" onclick="App.verHistorialTroquel(${t.id}, '${t.id_troquel}', '${t.nombre.replace(/'/g,"")}')" title="Historial">🕒</button>
                <button class="btn-icono" onclick="App.generarQR(${t.id})" title="Imprimir Etiqueta">🖨️</button>
                <button class="btn-icono" onclick="App.descatalogar(${t.id})" style="color:#f59e0b" title="Descatalogar">⛔</button>
                <button class="btn-icono" onclick="App.borrar(${t.id})" style="color:red" title="A la papelera">🗑️</button>`;
            return `<tr onclick="App.verFicha(${t.id})" style="cursor:pointer;">
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

    generarDashboardEstadisticas: () => {
        const container = document.getElementById('dashboard-resumen'); if(!container) return;
        let total = App.datos.length, estAlmacen = 0, estProduccion = 0, estReparar = 0, estExterno = 0, estObsoleto = 0, conteoFamilias = {}, conteoTipos = {};
        
        App.datos.forEach(t => {
            if(t.estado === 'EN PRODUCCION') estProduccion++; 
            else if(t.estado === 'REPARAR') estReparar++;
            else if(t.estado === 'EXTERNO') estExterno++;
            else if(t.estado === 'DESCATALOGADO') estObsoleto++;
            else estAlmacen++;
            
            let fam = App.mapaFam[t.familia_id] || 'Sin Familia'; conteoFamilias[fam] = (conteoFamilias[fam] || 0) + 1;
            let cat = App.mapaCat[t.categoria_id] || 'Sin Tipo'; conteoTipos[cat] = (conteoTipos[cat] || 0) + 1;
        });
        
        const renderLista = (obj) => Object.entries(obj).sort((a,b) => b[1]-a[1]).slice(0,5)
            .map(x => `<div style="display:flex; justify-content:space-between; border-bottom:1px dashed #e2e8f0; padding:5px 0; font-size:12px;"><span>${x[0]}</span> <strong style="color:#0f766e; background:#f0fdf4; padding:1px 6px; border-radius:10px;">${x[1]}</strong></div>`).join('');
        
        container.innerHTML = `
            <div style="background:white; padding:12px 16px; border-radius:8px; border:3px solid #0f766e; box-shadow:0 4px 6px rgba(0,0,0,0.1); display:flex; flex-direction:column; justify-content:center; align-items:center;">
                <h3 style="margin:0 0 6px 0; color:#64748b; font-size:12px; font-weight:bold; letter-spacing:1px;">TOTAL INVENTARIO</h3>
                <div style="font-size:48px; font-weight:900; color:#0f172a; line-height:1;">${total}</div>
            </div>
            <div style="background:white; padding:12px 16px; border-radius:8px; border:1px solid #cbd5e1; box-shadow:0 2px 4px rgba(0,0,0,0.05);">
                <h3 style="margin:0 0 10px 0; color:#64748b; font-size:12px; font-weight:bold; letter-spacing:1px;">RESUMEN DE ESTADO</h3>
                <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:14px;"><span style="color:#166534; font-weight:bold;">✅ En Almacén</span> <strong>${estAlmacen}</strong></div>
                <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:14px;"><span style="color:#991b1b; font-weight:bold;">🏭 En Producción</span> <strong>${estProduccion}</strong></div>
                <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:14px;"><span style="color:#ea580c; font-weight:bold;">🔧 Reparación</span> <strong>${estReparar}</strong></div>
                <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:14px;"><span style="color:#7c3aed; font-weight:bold;">🚚 Externo</span> <strong>${estExterno}</strong></div>
                <div style="display:flex; justify-content:space-between; font-size:14px;"><span style="color:#6b7280; font-weight:bold; cursor:pointer;" onclick="App.verDescatalogados()">⛔ Ver Descatalogados →</span></div>
            </div>
            <div style="background:white; padding:12px 16px; border-radius:8px; border:1px solid #cbd5e1; box-shadow:0 2px 4px rgba(0,0,0,0.05);">
                <h3 style="margin:0 0 8px 0; color:#64748b; font-size:12px; font-weight:bold; letter-spacing:1px;">TOP 5 TIPOS</h3>${renderLista(conteoTipos)}
            </div>
            <div style="background:white; padding:12px 16px; border-radius:8px; border:1px solid #cbd5e1; box-shadow:0 2px 4px rgba(0,0,0,0.05);">
                <h3 style="margin:0 0 8px 0; color:#64748b; font-size:12px; font-weight:bold; letter-spacing:1px;">TOP 5 FAMILIAS</h3>${renderLista(conteoFamilias)}
            </div>`;
    },

    cargarEstadisticas: async (meses) => {
        App.generarDashboardEstadisticas();
        const inputInicio = document.getElementById('fecha-inicio-uso'), inputFin = document.getElementById('fecha-fin-uso');
        if(inputInicio && !inputInicio.value) {
            const hoy = new Date(), mesPasado = new Date();
            mesPasado.setMonth(hoy.getMonth() - 1);
            inputFin.value = hoy.toISOString().split('T')[0];
            inputInicio.value = mesPasado.toISOString().split('T')[0];
            App.cargarUsadosFechas();
        }
        const tbody = document.getElementById('tabla-estadisticas');
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">Cargando cálculos... ⏳</td></tr>';
        try {
            const res = await fetch(`/api/estadisticas/inactivos?meses=${meses}`);
            const data = await res.json();
            if (data.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="text-center">¡Genial! No tienes troqueles obsoletos en este periodo.</td></tr>'; return; }
            tbody.innerHTML = data.map(t => {
                const fecha = t.ultima_fecha ? new Date(t.ultima_fecha).toLocaleDateString() : 'Nunca usado';
                return `<tr><td style="font-weight:900; color:#0f766e;">${t.id_troquel}</td><td style="color:#0369a1; font-weight:bold;">${t.codigos_articulo || '-'}</td><td>${t.nombre}</td><td>${t.estado || 'EN ALMACÉN'}</td><td style="color:#b91c1c; font-weight:bold;">${fecha}</td><td><button class="btn-accion" style="background:#64748b;" onclick="App.descatalogar(${t.id})">⛔ Descatalogar</button></td></tr>`;
            }).join('');
        } catch (e) { tbody.innerHTML = '<tr><td colspan="6" class="text-center text-red">Error al cargar las estadísticas</td></tr>'; }
    },

    cargarUsadosFechas: async () => {
        const fInicio = document.getElementById('fecha-inicio-uso').value, fFin = document.getElementById('fecha-fin-uso').value;
        const tbody = document.getElementById('tabla-estadisticas-usados');
        if(!fInicio || !fFin) { App.mostrarToast("Selecciona fecha de inicio y fin.", "error"); return; }
        if(fInicio > fFin) { App.mostrarToast("La fecha de inicio no puede ser posterior a la de fin.", "error"); return; }
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">Buscando movimientos... ⏳</td></tr>';
        try {
            const res = await fetch(`/api/estadisticas/usados?fecha_inicio=${fInicio}&fecha_fin=${fFin}`);
            if(!res.ok) throw new Error("Fallo en servidor");
            const data = await res.json();
            if(data.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="text-center">No se registraron movimientos en estas fechas.</td></tr>'; return; }
            tbody.innerHTML = data.map(t => {
                const fecha = new Date(t.ultima_fecha).toLocaleString();
                return `<tr><td style="font-weight:900; color:#16a34a;">${t.id_troquel}</td><td style="color:#0369a1; font-weight:bold;">${t.codigos_articulo || '-'}</td><td>${t.nombre}</td><td>${t.estado || '-'}</td><td><strong style="background:#dcfce7; color:#166534; padding:4px 8px; border-radius:12px; font-size:14px;">${t.movimientos} movs.</strong></td><td style="color:#64748b; font-size:13px;">${fecha}</td></tr>`;
            }).join('');
        } catch(e) { console.error(e); tbody.innerHTML = '<tr><td colspan="6" class="text-center text-red">Error al cargar los datos de uso.</td></tr>'; }
    },

    cargarHistorial: async () => {
        const r = await fetch('/api/historial'); const d = await r.json();
        document.getElementById('tabla-historial').innerHTML = d.map(h => {
            const t = h.troqueles || {};
            return `<tr><td><small style="color:#64748b;">${new Date(h.fecha_hora).toLocaleString()}</small></td><td style="font-weight:bold; color:#0f766e;">${t.id_troquel || '?'}</td><td>${t.nombre || 'Desconocido'}</td><td style="color:#0369a1; font-weight:bold;">${t.codigos_articulo || '-'}</td><td><span style="background:#f1f5f9; padding:2px 6px; border-radius:4px;">${h.ubicacion_anterior || '-'}</span> ➔ <span style="background:#dcfce7; padding:2px 6px; border-radius:4px;">${h.ubicacion_nueva || '-'}</span></td></tr>`;
        }).join('');
        const thead = document.querySelector('#vista-historial thead tr');
        if(thead) thead.innerHTML = `<th>Fecha/Hora</th><th>Matrícula</th><th>Descripción</th><th>Código</th><th>Origen ➔ Destino</th>`;
    },

    verHistorialTroquel: async (id, mat, nom) => {
        const modal = document.getElementById('modal-historial-unico'), tbody = document.getElementById('tabla-historial-unico');
        document.getElementById('hist-titulo-mat').innerText = mat;
        document.getElementById('hist-titulo-nom').innerText = nom;
        const theadUnico = document.querySelector('#modal-historial-unico thead tr');
        if(theadUnico) {
            theadUnico.innerHTML = `<th style="padding:15px;">Fecha/Hora</th><th style="padding:15px;">Matrícula</th><th style="padding:15px;">Código</th><th style="padding:15px;">Origen ➔ Destino</th><th style="padding:15px;">Acción</th>`;
        }
        tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding:40px; font-size:18px;">Cargando movimientos... ⏳</td></tr>';
        modal.classList.remove('oculto');
        try {
            const res = await fetch(`/api/historial?troquel_id=${id}`);
            if (res.ok) {
                const data = await res.json();
                if (data.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding:40px; font-size:18px;">No hay movimientos registrados.</td></tr>'; }
                else { 
                    tbody.innerHTML = data.map(h => { 
                        const t = h.troqueles || {}; 
                        return `<tr>
                            <td><small style="color:#64748b;">${new Date(h.fecha_hora).toLocaleString()}</small></td>
                            <td style="font-weight:bold; color:#0f766e;">${t.id_troquel || mat}</td>
                            <td style="color:#0369a1; font-weight:bold;">${t.codigos_articulo || '-'}</td>
                            <td><span style="background:#f1f5f9; padding:4px 8px; border-radius:4px;">${h.ubicacion_anterior || '-'}</span> ➔ <span style="background:#dcfce7; padding:4px 8px; border-radius:4px; font-weight:bold;">${h.ubicacion_nueva || '-'}</span></td>
                            <td><strong style="color:#475569;">${h.accion}</strong></td>
                        </tr>`; 
                    }).join(''); 
                }
            }
        } catch (e) { tbody.innerHTML = '<tr><td colspan="5" class="text-center text-red">Error al cargar la información.</td></tr>'; }
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
        const archs = App.parseArchivos(t.archivos);
        if (archs.length > 0) { archs.forEach(arch => { const icon = arch.tipo === 'pdf' ? '📄' : `<img src="${arch.url}" style="height:50px;">`; gal.innerHTML += `<a href="${arch.url}" target="_blank" style="margin-right:10px; text-decoration:none; display:inline-block; text-align:center;">${icon}<br><small>${arch.nombre.substring(0,10)}</small></a>`; }); }
        else { gal.innerHTML = "<span style='color:#999'>Sin archivos adjuntos</span>"; }
        let btnPrint = document.getElementById('btn-print-ficha');
        if(!btnPrint) {
            const header = document.querySelector('#modal-ficha h2').parentNode;
            btnPrint = document.createElement('button'); btnPrint.id = 'btn-print-ficha'; btnPrint.className = 'btn-secundario'; btnPrint.style.marginRight = '10px'; btnPrint.innerHTML = '🖨️ Etiqueta';
            header.insertBefore(btnPrint, header.firstChild);
        }
        btnPrint.onclick = () => App.generarQR(t.id);
        document.getElementById('modal-ficha').classList.remove('oculto');
    },
    editarDesdeFicha: () => { const id = parseInt(document.getElementById('ver-id-oculto').value); document.getElementById('modal-ficha').classList.add('oculto'); App.editar(id); },

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
        const galMovil = document.getElementById('movil-galeria'); galMovil.innerHTML = "";
        const archs = App.parseArchivos(t.archivos);
        if (archs.length > 0) { archs.forEach(arch => { const icon = arch.tipo === 'pdf' ? '📄' : `<img src="${arch.url}" style="height:40px; border-radius:4px; border:1px solid #cbd5e1;">`; galMovil.innerHTML += `<a href="${arch.url}" target="_blank" style="margin-right:5px; text-decoration:none; display:inline-block; text-align:center; color:#334155;">${icon}</a>`; }); }
        else { galMovil.innerHTML = "<span style='color:#94a3b8; font-size:12px;'>No hay archivos adjuntos</span>"; }
        
        // Píldora de estado en vista móvil
        let stHtml = `<span style="background:#dcfce7; color:#166534; padding:5px 10px; border-radius:15px; font-weight:bold;">ALMACÉN</span>`;
        if(t.estado === 'EN PRODUCCION') stHtml = `<span style="background:#fee2e2; color:#991b1b; padding:5px 10px; border-radius:15px; font-weight:bold;">PRODUCCIÓN</span>`;
        else if(t.estado === 'REPARAR') stHtml = `<span style="background:#ffedd5; color:#ea580c; padding:5px 10px; border-radius:15px; font-weight:bold;">EN REPARACIÓN</span>`;
        else if(t.estado === 'EXTERNO') stHtml = `<span style="background:#f3e8ff; color:#7c3aed; padding:5px 10px; border-radius:15px; font-weight:bold;">EXTERNO</span>`;
        else if(t.estado === 'DESCATALOGADO') stHtml = `<span style="background:#f3f4f6; color:#6b7280; padding:5px 10px; border-radius:15px; font-weight:bold;">OBSOLETO</span>`;
        
        document.getElementById('movil-estado').innerHTML = stHtml;
    },

    volverMenuMovil: () => {
        document.getElementById('vista-movil-detalle').classList.add('oculto');
        const altavista = document.getElementById('vista-movil-alta');
        if (altavista) altavista.classList.add('oculto');
        document.getElementById('vista-movil').classList.remove('oculto');
        App.cargarTodo();
    },

    abrirAltaRapidaMovil: () => {
        document.getElementById('vista-movil').classList.add('oculto');
        document.getElementById('vista-movil-alta').classList.remove('oculto');
        document.getElementById('am-nombre').value = '';
        document.getElementById('am-arts').value = '';
        document.getElementById('am-ubicacion').value = '';
        document.getElementById('am-foto').value = '';
        document.getElementById('am-foto-txt').innerHTML = '📷 Tomar Foto del Troquel';
        const selCat = document.getElementById('am-cat'), selFam = document.getElementById('am-fam');
        selCat.innerHTML = document.getElementById('f-cat').innerHTML;
        selFam.innerHTML = document.getElementById('f-fam').innerHTML;
    },

    uiFotoTomada: (input) => { if(input.files && input.files[0]) document.getElementById('am-foto-txt').innerHTML = '✅ Foto: ' + input.files[0].name.substring(0,25); },

    guardarAltaRapida: async (e) => {
        e.preventDefault();
        const cat = parseInt(document.getElementById('am-cat').value);
        const fam = parseInt(document.getElementById('am-fam').value) || null; // opcional
        const nom = document.getElementById('am-nombre').value;
        const arts = document.getElementById('am-arts').value.trim();
        const ubiInput = document.getElementById('am-ubicacion').value.trim();
        const inputFoto = document.getElementById('am-foto');
        if (!cat || !nom) { App.mostrarToast("El tipo y la descripción son obligatorios.", "error"); return; }
        const btn = document.getElementById('btn-am-guardar'); btn.innerText = "⏳ GUARDANDO..."; btn.disabled = true;
        try {
            const rId = await fetch(`/api/siguiente_numero?categoria_id=${cat}`); const dId = await rId.json(); const matricula = dId.siguiente;
            const ubicacion = ubiInput || String(matricula);
            let archivosArr = [];
            // Foto: solo si se adjuntó
            if(inputFoto.files.length) {
                const archivoOptimo = await App.comprimirImagen(inputFoto.files[0]);
                const fd = new FormData(); fd.append('file', archivoOptimo);
                const resFoto = await fetch('/api/subir_foto', { method:'POST', body:fd });
                if(resFoto.ok) { const df = await resFoto.json(); archivosArr.push({ url: df.url, nombre: archivoOptimo.name, tipo: df.tipo }); }
                else { App.mostrarToast("Aviso: Error guardando foto", "error"); }
            }
            const payload = {
                id_troquel: String(matricula),
                ubicacion: ubicacion.toUpperCase(),
                nombre: String(nom),
                categoria_id: cat,
                familia_id: fam,
                tamano_troquel: "", tamano_final: "",
                codigos_articulo: arts,
                referencias_ot: "NUEVO - PENDIENTE",
                observaciones: "Alta exprés desde móvil. Pendiente de validación por responsable.",
                estado: "EN ALMACEN",
                archivos: archivosArr
            };
            const resGuardar = await fetch('/api/troqueles', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
            if(resGuardar.ok) { App.mostrarToast("✅ Troquel creado — pendiente de validar"); await App.cargarTodo(); App.volverMenuMovil(); }
            else { const errG = await resGuardar.text(); App.mostrarToast(`Error BD: ${errG}`, "error"); }
        } catch(err) { App.mostrarToast("Error intermitente de red.", "error"); }
        finally { btn.innerText = "💾 GUARDAR TROQUEL"; btn.disabled = false; }
    },

    movilCambiarUbi: async () => {
        const id = document.getElementById('movil-id-db').value, actual = document.getElementById('movil-ubi').innerText;
        const nueva = prompt("Nueva Ubicación:", actual);
        if(nueva && nueva !== actual) {
            const t = App.datos.find(x => x.id == id);
            const payload = { id_troquel: String(t.id_troquel||""), ubicacion: String(nueva), nombre: String(t.nombre||""), categoria_id: parseInt(t.categoria_id)||null, familia_id: parseInt(t.familia_id)||null, tamano_troquel: String(t.tamano_troquel||""), tamano_final: String(t.tamano_final||""), codigos_articulo: String(t.codigos_articulo||""), referencias_ot: String(t.referencias_ot||""), observaciones: String(t.observaciones||""), estado: String(t.estado||"EN ALMACEN"), archivos: App.parseArchivos(t.archivos) };
            const res = await fetch(`/api/troqueles/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
            if(res.ok) { await App.cargarTodo(); document.getElementById('movil-ubi').innerText = nueva; App.mostrarToast("Ubicación actualizada correctamente."); }
            else { const err = await res.text(); App.mostrarToast(`Error al guardar la ubicación: ${err}`, "error"); }
        }
    },

    movilCambiarEstado: async (accion) => {
        const id = parseInt(document.getElementById('movil-id-db').value);
        if(!confirm(`¿Marcar como ${accion}?`)) return;
        await fetch('/api/movimientos/lote', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: [id], accion: accion }) });
        App.mostrarToast(`Troquel movido a ${accion}.`);
        await App.cargarTodo(); App.abrirDetalleMovil(id);
    },

    movilSubirFoto: async (input) => {
        if(!input.files.length) return;
        const id = document.getElementById('movil-id-db').value, t = App.datos.find(x => x.id == id);
        App.mostrarToast("Comprimiendo y subiendo foto... ⏳", "exito");
        try {
            const archivoOptimo = await App.comprimirImagen(input.files[0]);
            const fd = new FormData(); fd.append('file', archivoOptimo);
            const resFoto = await fetch('/api/subir_foto', { method: 'POST', body: fd });
            if(resFoto.ok) {
                const data = await resFoto.json();
                const nuevosArchivos = App.parseArchivos(t.archivos); nuevosArchivos.push({ url: data.url, nombre: archivoOptimo.name, tipo: data.tipo });
                const payload = { id_troquel: String(t.id_troquel||""), ubicacion: String(t.ubicacion||""), nombre: String(t.nombre||""), categoria_id: parseInt(t.categoria_id)||null, familia_id: parseInt(t.familia_id)||null, tamano_troquel: String(t.tamano_troquel||""), tamano_final: String(t.tamano_final||""), codigos_articulo: String(t.codigos_articulo||""), referencias_ot: String(t.referencias_ot||""), observaciones: String(t.observaciones||""), estado: String(t.estado||"EN ALMACEN"), archivos: nuevosArchivos };
                const resDb = await fetch(`/api/troqueles/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
                if(resDb.ok) { App.mostrarToast("Foto guardada correctamente."); await App.cargarTodo(); App.abrirDetalleMovil(id); }
                else { const errorBackend = await resDb.text(); App.mostrarToast(`La foto subió, pero BD falló: ${errorBackend}`, "error"); }
            } else { const errUpload = await resFoto.json(); App.mostrarToast(`Error subiendo imagen: ${errUpload.detail}`, "error"); }
        } catch(e) { App.mostrarToast("Error general de red al procesar la foto.", "error"); console.error(e); }
        input.value = "";
    },

    toggleScanner: (show=true, modo='LOTE') => {
        const el = document.getElementById('modal-scanner'); App.modoScanner = modo;
        const pLote = document.getElementById('panel-lote'), bLote = document.getElementById('btns-lote'), tit = document.getElementById('titulo-scanner');
        if (modo === 'UNICO') { if(pLote) pLote.style.display='none'; if(bLote) bLote.style.display='none'; if(tit) tit.innerText="🔎 Escanear Un Troquel"; }
        
        if(show) {else { if(pLote) pLote.style.display='block'; if(bLote) bLote.style.display='grid'; if(tit) tit.innerText="📦 Escanear Lote"; }
            el.classList.remove('oculto'); App.escaneadosLote.clear(); App.renderListaEscaneados();
            App.scanner = new Html5Qrcode("reader");
            let last = null, t0 = 0;
            App.scanner.start({facingMode:"environment"}, {fps:10, qrbox:250}, (txt) => {
                if(txt === last && (Date.now() - t0 < 3000)) return;
                const t = App.datos.find(x => x.id.toString() === txt);
                if(t) {
                    if (App.modoScanner === 'UNICO') { App.reproducirBeep(true); App.toggleScanner(false); if(navigator.vibrate) navigator.vibrate(200); App.abrirDetalleMovil(t.id); }
                    else { if(!App.escaneadosLote.has(t.id)) { App.reproducirBeep(true); App.escaneadosLote.set(t.id, t); App.renderListaEscaneados(); if(navigator.vibrate) navigator.vibrate(100); } }
                    last = txt; t0 = Date.now();
                } else { App.reproducirBeep(false); }
            });
        } else { el.classList.add('oculto'); if(App.scanner) App.scanner.stop(); }
    },
    renderListaEscaneados: () => { const div = document.getElementById('lista-escaneados'); div.innerHTML=""; document.getElementById('count-scans').innerText=App.escaneadosLote.size; App.escaneadosLote.forEach((t,id)=>{ div.innerHTML+=`<div class="chip activo" style="background:white; color:black;"><b>${t.id_troquel}</b><span onclick="App.borrarDeLote(${id})" style="color:red; cursor:pointer; margin-left:5px">✕</span></div>`; }); },
    borrarDeLote: (id) => { App.escaneadosLote.delete(id); App.renderListaEscaneados(); },
    procesarEscaneo: async (acc) => { if(App.escaneadosLote.size===0) return; App.seleccionados = new Set(App.escaneadosLote.keys()); await App.moverLote(acc); App.toggleScanner(false); },

    select: (c,id) => { c.checked ? App.seleccionados.add(id) : App.seleccionados.delete(id); App.updatePanel(); },
    toggleAll: (c) => { document.querySelectorAll('#tabla-body input[type="checkbox"]').forEach(k=>{ k.checked=c.checked; c.checked ? App.seleccionados.add(parseInt(k.value)) : App.seleccionados.delete(parseInt(k.value)); }); App.updatePanel(); },
    updatePanel: () => {
        const p = document.getElementById('panel-acciones');
        if(App.seleccionados.size > 0) { p.classList.remove('oculto'); document.getElementById('contador-sel').innerText = App.seleccionados.size; const an = document.getElementById('acciones-normales'); if(an) an.style.display = 'inline-flex'; }
        else { p.classList.add('oculto'); }
    },
    limpiarSeleccion: () => { App.seleccionados.clear(); const chk = document.getElementById('check-all'); if(chk) chk.checked=false; App.updatePanel(); App.renderTabla(); },

    borrar: async (id) => { if(confirm("¿Mover a la papelera?")) { await fetch(`/api/troqueles/${id}`, { method:'DELETE' }); App.mostrarToast("Enviado a papelera."); App.cargarTodo(); } },
    borrarLote: async () => {
        if(!confirm(`¿Mover ${App.seleccionados.size} troqueles a la papelera?`)) return;
        await fetch('/api/troqueles/bulk/papelera', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: Array.from(App.seleccionados) }) });
        App.limpiarSeleccion(); App.mostrarToast("Lote enviado a papelera."); App.cargarTodo();
    },
    restaurarLote: async () => {
        await fetch('/api/troqueles/bulk/restaurar', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: Array.from(App.seleccionados) }) });
        App.limpiarSeleccion(); App.mostrarToast("Lote restaurado al inventario."); App.cargarTodo();
    },
    destruirLote: async () => {
        if(!confirm(`¡PELIGRO! ¿Eliminar permanentemente ${App.seleccionados.size} troqueles?\nEsta acción NO se puede deshacer.`)) return;
        await fetch('/api/troqueles/bulk/destruir', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: Array.from(App.seleccionados) }) });
        App.limpiarSeleccion(); App.mostrarToast("Lote eliminado definitivamente."); App.cargarPapelera();
    },

    verPapelera: async () => {
        document.querySelectorAll('.vista').forEach(v => v.classList.add('oculto'));
        document.getElementById('vista-papelera').classList.remove('oculto');
        document.querySelectorAll('.menu-item').forEach(b => b.classList.remove('activo'));
        App.seleccionados.clear(); await App.cargarPapelera();
    },

    cargarPapelera: async () => {
        const tbody = document.getElementById('tabla-papelera-body'), counter = document.getElementById('papelera-contador');
        if(!tbody) return;
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Cargando... ⏳</td></tr>';
        try {
            const res = await fetch('/api/troqueles?ver_papelera=true');
            App.datosPapelera = await res.json();
            if(counter) counter.innerText = App.datosPapelera.length;
            if(App.datosPapelera.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding:40px; color:#64748b;">La papelera está vacía.</td></tr>'; return; }
            tbody.innerHTML = App.datosPapelera.map(t => `<tr>
                <td style="font-weight:900; color:#64748b;">${t.id_troquel}</td>
                <td>${t.nombre}</td><td style="color:#0369a1;">${t.codigos_articulo || '-'}</td>
                <td>${t.ubicacion || '-'}</td>
                <td style="white-space:nowrap;">
                    <button class="btn-accion" style="background:#22c55e; padding:4px 10px; font-size:12px; margin-right:4px;" onclick="App.restaurar(${t.id})">♻️ Restaurar</button>
                    <button class="btn-accion" style="background:#f59e0b; padding:4px 10px; font-size:12px; margin-right:4px;" onclick="App.descatalogarDesdePapelera(${t.id})">⛔ Descatalogar</button>
                    <button class="btn-accion" style="background:#b91c1c; padding:4px 10px; font-size:12px;" onclick="App.destruirUnico(${t.id})">🔥 Eliminar</button>
                </td></tr>`).join('');
        } catch(e) { tbody.innerHTML = '<tr><td colspan="5" class="text-center text-red">Error al cargar la papelera.</td></tr>'; }
    },

    restaurar: async (id) => { await fetch(`/api/troqueles/${id}/restaurar`, {method:'POST'}); App.mostrarToast("Troquel restaurado al inventario."); await App.cargarPapelera(); },
    destruirUnico: async (id) => {
        if(confirm("¡PELIGRO! ¿Eliminar este troquel para siempre? No podrás recuperarlo.")) {
            await fetch('/api/troqueles/bulk/destruir', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: [id] }) });
            App.mostrarToast("Troquel eliminado definitivamente."); await App.cargarPapelera();
        }
    },
    vaciarPapelera: async () => {
        if(App.datosPapelera.length === 0) { App.mostrarToast("La papelera ya está vacía.", "error"); return; }
        if(!confirm(`⚠️ ¿Eliminar DEFINITIVAMENTE los ${App.datosPapelera.length} troqueles de la papelera? No hay marcha atrás.`)) return;
        const ids = App.datosPapelera.map(t => t.id);
        await fetch('/api/troqueles/bulk/destruir', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids }) });
        App.mostrarToast("Papelera vaciada."); App.datosPapelera = []; await App.cargarPapelera();
    },
    restaurarTodoPapelera: async () => {
        if(App.datosPapelera.length === 0) { App.mostrarToast("La papelera está vacía.", "error"); return; }
        if(!confirm(`¿Restaurar los ${App.datosPapelera.length} troqueles al inventario?`)) return;
        const ids = App.datosPapelera.map(t => t.id);
        await fetch('/api/troqueles/bulk/restaurar', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids }) });
        App.mostrarToast(`${ids.length} troqueles restaurados al inventario.`); App.datosPapelera = []; await App.cargarPapelera();
    },
    descatalogarDesdePapelera: async (id) => {
        const palet = prompt("Ubicación del palet donde se guarda el troquel:");
        if(palet === null) return;
        if(!palet.trim()) { App.mostrarToast("Debes indicar la ubicación.", "error"); return; }
        await fetch('/api/troqueles/bulk/descatalogar', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: [id], ubicacion: palet.trim() }) });
        App.mostrarToast("Troquel movido a Descatalogados."); await App.cargarPapelera();
    },
    descatalogarTodoPapelera: async () => {
        if(App.datosPapelera.length === 0) { App.mostrarToast("La papelera está vacía.", "error"); return; }
        const palet = prompt(`Ubicación del palet para los ${App.datosPapelera.length} troqueles:`);
        if(palet === null) return;
        if(!palet.trim()) { App.mostrarToast("Debes indicar la ubicación.", "error"); return; }
        const ids = App.datosPapelera.map(t => t.id);
        await fetch('/api/troqueles/bulk/descatalogar', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids, ubicacion: palet.trim() }) });
        App.mostrarToast(`${ids.length} troqueles movidos a Descatalogados.`); App.datosPapelera = []; await App.cargarPapelera();
    },

    crearFamilia: async () => {
        const n = prompt("Nombre de la nueva Familia:");
        if(n) { try { const res = await fetch('/api/familias', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({nombre:n}) }); if(res.ok) { const data = await res.json(); await App.cargarSelects(); if(data && data.length > 0) { const el = document.getElementById('f-fam'); if(el) el.value = data[0].id; } App.mostrarToast(`Familia "${n.toUpperCase()}" creada con éxito.`); } else { const err = await res.json(); App.mostrarToast(`Error al crear familia: ${err.detail}`, "error"); } } catch(e) { App.mostrarToast("Error de red al intentar crear la familia.", "error"); } }
    },
    crearTipo: async () => {
        const n = prompt("Nombre del nuevo Tipo:");
        if(n) { try { const res = await fetch('/api/categorias', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({nombre:n}) }); if(res.ok) { const data = await res.json(); await App.cargarSelects(); if(data && data.length > 0) { const el = document.getElementById('f-cat'); if(el) el.value = data[0].id; App.calcularSiguienteId(); } App.mostrarToast(`Tipo "${n.toUpperCase()}" creado.`); } else { const err = await res.json(); App.mostrarToast(`Error al crear tipo: ${err.detail}`, "error"); } } catch(e) { App.mostrarToast("Error de red al intentar crear el tipo.", "error"); } }
    },

    subirArchivos: async (input) => {
        if(!input.files.length) return; const btn = input.parentElement; btn.innerText="⏳";
        for(let i=0; i<input.files.length; i++) {
            const archivoOptimo = await App.comprimirImagen(input.files[i]);
            const fd = new FormData(); fd.append('file', archivoOptimo);
            const res = await fetch('/api/subir_foto', { method:'POST', body:fd });
            if(res.ok) { const d = await res.json(); App.archivosActuales.push({ url: d.url, nombre: archivoOptimo.name, tipo: d.tipo }); }
        }
        App.renderListaArchivos(); btn.innerText="➕ Subir Archivo"; input.value="";
    },
    renderListaArchivos: () => { const div = document.getElementById('lista-archivos'); div.innerHTML=""; App.archivosActuales.forEach((a,i) => div.innerHTML += `<div>${a.nombre} <span onclick="App.quitarArchivo(${i})" style="color:red;cursor:pointer; font-weight:bold;"> ✕</span></div>`); },
    quitarArchivo: (i) => { App.archivosActuales.splice(i,1); App.renderListaArchivos(); },

    nav: (v, btnElement) => {
        document.querySelectorAll('.vista').forEach(x=>x.classList.add('oculto'));
        document.getElementById(v).classList.remove('oculto');
        if(btnElement) { document.querySelectorAll('.menu-item').forEach(b => b.classList.remove('activo')); btnElement.classList.add('activo'); }
        if(v==='vista-lista') { document.getElementById('sidebar').classList.remove('oculto'); if(App.datos.length === 0) App.cargarTodo(); }
    },

    buscarMovil: (txt) => {
        const d = document.getElementById('resultados-movil'); d.innerHTML = "";
        if(txt.length<2) return;
        const q = txt.toLowerCase();
        const h = App.datos.filter(t => [t.id_troquel, t.nombre, t.ubicacion, t.codigos_articulo, t.referencias_ot, t.observaciones, t.tamano_troquel, t.tamano_final, App.mapaFam[t.familia_id], App.mapaCat[t.categoria_id]].some(v => v && String(v).toLowerCase().includes(q)));
        if(h.length === 0) { d.innerHTML = '<div style="padding:20px; text-align:center; color:#64748b;">Sin resultados</div>'; return; }
        d.innerHTML = h.slice(0,50).map(t => `<div class="card-movil" onclick="App.abrirDetalleMovil(${t.id})"><div style="font-weight:900; color:var(--primary);">${t.id_troquel}</div><div style="font-size:13px; margin:2px 0;">${t.nombre}</div><div style="font-size:11px; color:#64748b;">${t.ubicacion || ''} ${t.codigos_articulo ? '· '+t.codigos_articulo : ''}</div><button class="btn-secundario" style="margin-top:6px;">Ver ficha</button></div>`).join('');
    },

    nuevoTroquel: () => {
        document.getElementById('titulo-form').innerText="Nuevo"; document.querySelector('form').reset(); document.getElementById('f-id-db').value=""; App.archivosActuales=[]; App.renderListaArchivos();
        const btnEtq = document.getElementById('btn-etiqueta-form'); if(btnEtq) btnEtq.style.display = 'none';
        if(App.modoMovil) document.getElementById('sidebar').classList.add('oculto');
        App.nav('vista-formulario');
    },
    editar: (id) => {
        const t = App.datos.find(x=>x.id===id); if(!t)return;
        document.getElementById('titulo-form').innerText="Editar";
        const setVal = (elId, val) => { const el = document.getElementById(elId); if(el) el.value = val; };
        setVal('f-id-db', t.id); setVal('f-matricula', t.id_troquel); setVal('f-ubicacion', t.ubicacion);
        setVal('f-nombre', t.nombre); setVal('f-cat', t.categoria_id||""); setVal('f-fam', t.familia_id||"");
        setVal('f-medidas-madera', t.tamano_troquel||""); setVal('f-medidas-corte', t.tamano_final||"");
        setVal('f-arts', t.codigos_articulo||""); setVal('f-ot', t.referencias_ot||""); setVal('f-obs', t.observaciones||"");
        App.archivosActuales = App.parseArchivos(t.archivos); App.renderListaArchivos();
        if(App.modoMovil) document.getElementById('sidebar').classList.add('oculto');
        const btnEtq = document.getElementById('btn-etiqueta-form'); if(btnEtq) { btnEtq.style.display = 'block'; btnEtq.dataset.id = t.id; }
        App.nav('vista-formulario');
    },
    volverDesdeForm: () => { if(App.modoMovil) App.activarModoMovil(); else App.nav('vista-lista'); },
    imprimirEtiquetaForm: () => {
        const btnEtq = document.getElementById('btn-etiqueta-form'), id = btnEtq ? parseInt(btnEtq.dataset.id) : null;
        if(!id) { App.mostrarToast("Guarda el troquel primero para imprimir la etiqueta.", "error"); return; }
        App.generarQR(id);
    },
    guardarFicha: async (e) => {
        e.preventDefault(); const id = document.getElementById('f-id-db').value;
        const getVal = (elId) => { const el = document.getElementById(elId); return el ? el.value : ""; };
        const d = { id_troquel: String(getVal('f-matricula')), ubicacion: String(getVal('f-ubicacion')), nombre: String(getVal('f-nombre')), categoria_id: parseInt(getVal('f-cat'))||null, familia_id: parseInt(getVal('f-fam'))||null, tamano_troquel: String(getVal('f-medidas-madera')), tamano_final: String(getVal('f-medidas-corte')), codigos_articulo: String(getVal('f-arts')), referencias_ot: String(getVal('f-ot')), observaciones: String(getVal('f-obs')), archivos: App.archivosActuales };
        const res = await fetch(id ? `/api/troqueles/${id}` : '/api/troqueles', { method: id?'PUT':'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(d) });
        if(!res.ok) { const err = await res.text(); App.mostrarToast(`Error guardando ficha en BD: ${err}`, "error"); }
        else { App.mostrarToast("Ficha guardada con éxito."); await App.cargarTodo(); App.volverDesdeForm(); }
    },

    calcularSiguienteId: async () => {
        const c = document.getElementById('f-cat').value;
        if(c) { try { const r = await fetch(`/api/siguiente_numero?categoria_id=${c}`); const d = await r.json(); document.getElementById('f-matricula').value = d.siguiente; const inputUbi = document.getElementById('f-ubicacion'); if(inputUbi && inputUbi.value.trim() === "") inputUbi.value = d.siguiente; } catch(e){} }
    },

    // ─── BÚSQUEDA Y FILTROS ────────────────────────────────────
    setFiltroTipo: (t,b) => { App.filtroTipo=t; document.querySelectorAll('.chip').forEach(c=>c.classList.remove('activo')); b.classList.add('activo'); App.renderTabla(); },
    filtrar: () => {
        const val = document.getElementById('buscador').value;
        const b = document.getElementById('btn-limpiar');
        b.classList.toggle('oculto', val === '');
        const chkGlobal = document.getElementById('chk-buscar-global');
        if(chkGlobal && chkGlobal.checked && val.trim().length >= 2) { App.buscarGlobal(val.trim()); }
        else { App.renderTabla(); }
    },
    limpiarBuscador: () => { document.getElementById('buscador').value=''; App.filtrar(); },

    buscarGlobal: async (txt) => {
        const q = txt.toLowerCase();
        const tbody = document.getElementById('tabla-body'); if(!tbody) return;
        try {
            if(App.datosDescatalogados.length === 0) {
                const resDesc = await fetch('/api/troqueles/descatalogados');
                App.datosDescatalogados = await resDesc.json();
            }

            const activosLimpios = App.datos.filter(t => t.estado !== 'DESCATALOGADO');
            const idsDesc = new Set(App.datosDescatalogados.map(t => t.id));

            const todos = [
                ...activosLimpios.filter(t => !idsDesc.has(t.id)).map(t => ({...t, _origen: 'activo'})),
                ...App.datosDescatalogados.map(t => ({...t, _origen: 'descatalogado'}))
            ];

            const res = todos.filter(t => [t.id_troquel, t.nombre, t.ubicacion, t.codigos_articulo, t.referencias_ot, t.observaciones].some(v => v && String(v).toLowerCase().includes(q)));
            if(res.length === 0) { tbody.innerHTML = '<tr><td colspan="9" class="text-center">Sin resultados en todo el inventario</td></tr>'; return; }
            tbody.innerHTML = res.map(t => {
                const esDesc = t._origen === 'descatalogado';
                const bgRow = esDesc ? 'background:#fffbeb;' : '';
                
                let badge = '';
                if(esDesc) {
                    badge = `<span style="background:#fef3c7; color:#92400e; padding:2px 7px; border-radius:8px; font-size:10px; font-weight:800;">DESC.</span>`;
                } else {
                    let c = '#166534', b = '#dcfce7', tx = 'ALMACÉN';
                    if(t.estado === 'EN PRODUCCION') { c = '#991b1b'; b = '#fee2e2'; tx = 'PROD.'; }
                    else if(t.estado === 'REPARAR') { c = '#ea580c'; b = '#ffedd5'; tx = 'REPAR.'; }
                    else if(t.estado === 'EXTERNO') { c = '#7c3aed'; b = '#f3e8ff'; tx = 'EXTERNO'; }
                    badge = `<span style="background:${b}; color:${c}; padding:2px 7px; border-radius:8px; font-size:10px; font-weight:800;">${tx}</span>`;
                }
                
                const archs = App.parseArchivos(t.archivos);
                const bdg = archs.length > 0 ? `<span class="obs-pildora">📎 ${archs.length}</span>` : '-';
                const fam = App.mapaFam[t.familia_id] || '-';
                const nomEsc = (t.nombre||'').replace(/'/g, '');
                
                const accion = esDesc
                    ? `<button class="btn-accion" style="background:#16a34a; padding:3px 8px; font-size:11px;" onclick="App.reactivar(${t.id})">♻️ Reactivar</button>
                       <button class="btn-icono" onclick="App.generarQR(${t.id})" title="Imprimir etiqueta">🖨️</button>`
                    : `<button class="btn-icono" onclick="App.verHistorialTroquel(${t.id},'${t.id_troquel}','${nomEsc}')" title="Historial">🕒</button>
                       <button class="btn-icono" onclick="App.generarQR(${t.id})" title="Imprimir Etiqueta">🖨️</button>
                       <button class="btn-icono" onclick="App.descatalogar(${t.id})" style="color:#f59e0b" title="Descatalogar">⛔</button>
                       <button class="btn-icono" onclick="App.borrar(${t.id})" style="color:red" title="Papelera">🗑️</button>`;
                return `<tr style="${bgRow}cursor:pointer;" onclick="App.verFicha(${t.id})">
                    <td class="text-center">-</td><td class="text-center">${bdg}</td><td class="text-center">${badge}</td>
                    <td style="font-weight:900;">${t.id_troquel}</td><td>${t.ubicacion || '-'}</td>
                    <td style="color:var(--primary); font-weight:bold;">${t.codigos_articulo || '-'}</td>
                    <td>${t.nombre}</td><td><small>${fam}</small></td>
                    <td onclick="event.stopPropagation()" style="white-space:nowrap;">${accion}</td>
                </tr>`;
            }).join('');
        } catch(e) { console.error(e); App.renderTabla(); }
    },

    ordenar: (c) => { if(App.columnaOrden===c) App.ordenAsc=!App.ordenAsc; else { App.columnaOrden=c; App.ordenAsc=true; } App.renderTabla(); },

    // ─── DESCATALOGAR CON MODAL ────────────────────────────────
    descatalogar: async (id) => {
        const t = App.datos.find(x => x.id === id); if(!t) return;
        App.descatalogarTargetId = id; App.descatalogarModo = 'SINGLE';
        const modal = document.getElementById('modal-descatalogar'), input = document.getElementById('input-descatalogar-ubi');
        input.value = t.ubicacion || 'PALET-1';
        modal.classList.remove('oculto');
    },
    descatalogarLote: async () => {
        if(App.seleccionados.size === 0) return;
        App.descatalogarModo = 'LOTE';
        const modal = document.getElementById('modal-descatalogar'), input = document.getElementById('input-descatalogar-ubi');
        input.value = 'PALET-1'; modal.classList.remove('oculto');
    },
    cerrarModalDescatalogar: () => { document.getElementById('modal-descatalogar').classList.add('oculto'); },
    confirmarDescatalogar: async () => {
        const palet = document.getElementById('input-descatalogar-ubi').value;
        if(!palet.trim()) { App.mostrarToast("Debes indicar la ubicación del palet.", "error"); return; }
        App.cerrarModalDescatalogar();
        if (App.descatalogarModo === 'SINGLE') {
            const id = App.descatalogarTargetId, t = App.datos.find(x => x.id === id); if(!t) return;
            const res = await fetch('/api/troqueles/bulk/descatalogar', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: [id], ubicacion: palet.trim() }) });
            if(res.ok) { App.mostrarToast(`${t.id_troquel} → Descatalogado en ${palet.trim().toUpperCase()}`); await App.cargarTodo(); }
            else { App.mostrarToast("Error al descatalogar.", "error"); }
        } else if (App.descatalogarModo === 'LOTE') {
            const res = await fetch('/api/troqueles/bulk/descatalogar', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: Array.from(App.seleccionados), ubicacion: palet.trim() }) });
            if(res.ok) { App.mostrarToast(`${App.seleccionados.size} troqueles descatalogados → ${palet.trim().toUpperCase()}`); App.limpiarSeleccion(); await App.cargarTodo(); }
            else { App.mostrarToast("Error al descatalogar.", "error"); }
        }
    },

    moverLote: async (acc) => { await fetch('/api/movimientos/lote', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: Array.from(App.seleccionados), accion: acc }) }); App.mostrarToast("Lote movido."); App.limpiarSeleccion(); App.cargarTodo(); },
    asignarMasivo: async (c) => { let id=c==='familia'?'bulk-familia':'bulk-tipo'; let v=document.getElementById(id).value; if(v && confirm("¿Aplicar?")) { await fetch(`/api/troqueles/bulk/${c}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: Array.from(App.seleccionados), valor_id: parseInt(v) }) }); App.mostrarToast("Asignación masiva completada."); App.limpiarSeleccion(); App.cargarTodo(); } },
    abrirGestionAux: () => document.getElementById('modal-aux').classList.remove('oculto'),

    // ─── IMPRESIÓN GODEX (iframe, sin popup) ─────────────────
    imprimirEtiquetasGodex: (items, tamano = '50x23') => {
        const PX_MM = 203 / 25.4;
        const W_MM = tamano === '100x70' ? 100 : 50, H_MM = tamano === '100x70' ? 70 : 23;
        const W = Math.round(W_MM * PX_MM), H = Math.round(H_MM * PX_MM), pad = Math.round(1.5 * PX_MM);
        const dibujarEtiqueta = (t) => {
            const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
            const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
            const qrSize = Math.round(W * 0.38), qrY = Math.round((H - qrSize) / 2);
            const qrCanvas = document.createElement('canvas');
            new QRious({ element: qrCanvas, value: t.id.toString(), size: qrSize, level: 'M', background: 'white', foreground: 'black' });
            ctx.drawImage(qrCanvas, pad, qrY, qrSize, qrSize);
            const txtX = pad + qrSize + pad, txtMaxW = W - txtX - pad; let curY = pad;
            const escribir = (texto, fMM, bold, color) => {
                const fs = Math.round(fMM * PX_MM); if (curY + fs > H - pad) return;
                ctx.fillStyle = color || '#000000'; ctx.font = `${bold ? '900' : '400'} ${fs}px Arial`;
                let txt = String(texto || '');
                while (ctx.measureText(txt).width > txtMaxW && txt.length > 1) txt = txt.slice(0, -1);
                if (txt.length < String(texto || '').length) txt = txt.slice(0, -1) + '…';
                ctx.fillText(txt, txtX, curY + fs); curY += fs + Math.round(0.8 * PX_MM);
            };
            if (tamano === '100x70') { escribir('TROQUEL '+t.id_troquel,6.0,true,'#000000'); escribir('UBI: '+(t.ubicacion||'-'),5.5,true,'#000000'); escribir(t.nombre,4.0,false,'#333333'); if(t.codigos_articulo) escribir('Art: '+t.codigos_articulo,3.5,true,'#555555'); }
            else { escribir('TROQUEL '+t.id_troquel,2.8,true,'#000000'); escribir('UBI: '+(t.ubicacion||'-'),2.6,true,'#000000'); escribir(t.nombre,2.2,false,'#333333'); if(t.codigos_articulo) escribir('Art: '+t.codigos_articulo,2.0,true,'#555555'); }
            return canvas.toDataURL('image/png');
        };
        const dataUrls = items.map(t => dibujarEtiqueta(t));
        const imgsHtml = dataUrls.map(src => `<div class="et"><img src="${src}"></div>`).join('');
        const css = `* { margin:0; padding:0; box-sizing:border-box; } @page { size:${W_MM}mm ${H_MM}mm; margin:0; } body { background:#334155; font-family:Arial,sans-serif; } .wrap { display:flex; flex-direction:column; align-items:center; padding:16px; gap:12px; } .et img { display:block; width:${W_MM}mm; height:${H_MM}mm; } .btn { background:#14b8a6; color:#fff; padding:12px 26px; border:none; border-radius:8px; font-size:16px; font-weight:bold; cursor:pointer; } .nota { color:#e2e8f0; font-size:12px; text-align:center; background:#1e3a5f; padding:8px 16px; border-radius:6px; max-width:460px; line-height:1.6; } @media print { body { background:#fff; } .no-print { display:none !important; } .wrap { padding:0; gap:0; } .et { page-break-after:always; } .et img { display:block; width:${W_MM}mm; height:${H_MM}mm; } }`;
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Godex ${tamano}</title><style>${css}</style></head><body><div class="wrap"><button class="btn no-print" onclick="window.print()">🖨️ Imprimir Godex (${W_MM}×${H_MM}mm)</button><p class="nota no-print">En Chrome: <b>Márgenes → Ninguno</b> · <b>Escala → 100%</b> · <b>Tamaño → ${W_MM}×${H_MM}mm</b></p>${imgsHtml}</div></body></html>`;
        let iframe = document.getElementById('impresion-oculta');
        if (!iframe) { iframe = document.createElement('iframe'); iframe.id = 'impresion-oculta'; iframe.style.display = 'none'; document.body.appendChild(iframe); }
        iframe.contentWindow.document.open(); iframe.contentWindow.document.write(html); iframe.contentWindow.document.close();
        const modalQr = document.getElementById('modal-qr'); if (modalQr) modalQr.classList.add('oculto');
        setTimeout(() => { iframe.contentWindow.focus(); iframe.contentWindow.print(); }, 800);
    },

    // ─── IMPRESIÓN A4 APLI 1291 (iframe) ─────────────────────
    imprimirEtiquetasA4: (items) => {
        const etiquetasHtml = items.map(t => {
            const qrCanvas = document.createElement('canvas');
            new QRious({ element: qrCanvas, value: t.id.toString(), size: 160, level: 'M', background: 'white', foreground: 'black' });
            const qrSrc = qrCanvas.toDataURL('image/png'), desc = t.nombre || '', arts = t.codigos_articulo || '';
            return `<div class="et"><div class="qr-col"><img class="qr" src="${qrSrc}" alt="QR"></div><div class="txt-col"><div class="f-matricula">Nº ${t.id_troquel}</div><div class="f-ubi">UBI. ${t.ubicacion || '-'}</div>${arts ? `<div class="f-arts">${arts}</div>` : ''}<div class="f-desc">${desc}</div></div></div>`;
        }).join('');
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>APLI 1291</title>
        <style>* { margin:0; padding:0; box-sizing:border-box; } @page { size:210mm 297mm; margin-top:13.1mm; margin-bottom:13.1mm; margin-left:8mm; margin-right:8mm; } body { font-family:Arial,Helvetica,sans-serif; background:#dde3ea; -webkit-print-color-adjust:exact; } .toolbar { display:flex; gap:12px; align-items:center; padding:12px 18px; background:#1e293b; } .toolbar button { background:#7c3aed; color:#fff; border:none; padding:10px 22px; border-radius:6px; font-size:14px; font-weight:bold; cursor:pointer; } .toolbar span { color:#94a3b8; font-size:12px; } .pagina { display:grid; grid-template-columns:97mm 97mm; grid-template-rows:repeat(4,67.7mm); gap:0; width:194mm; margin:14px auto; background:white; } .et { width:97mm; height:67.7mm; display:flex; flex-direction:row; align-items:stretch; border:0.4pt solid #b0b8c4; overflow:hidden; background:white; } .qr-col { width:38mm; flex-shrink:0; display:flex; align-items:center; justify-content:center; padding:3mm; border-right:0.4pt solid #dde3ea; } .qr { width:32mm; height:32mm; } .txt-col { flex:1; min-width:0; padding:3.5mm 3mm 3mm 3.5mm; display:flex; flex-direction:column; justify-content:center; gap:1.8mm; overflow:hidden; } .f-matricula { font-size:15pt; font-weight:900; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.1; } .f-ubi { font-size:10.5pt; font-weight:800; color:#1d4ed8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.1; } .f-arts { font-size:9.5pt; font-weight:700; color:#374151; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.1; } .f-desc { font-size:8.5pt; font-weight:600; color:#4b5563; line-height:1.35; overflow:hidden; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; } @media print { body { background:white; } .toolbar { display:none !important; } .pagina { margin:0; width:194mm; background:white; box-shadow:none; } .et { border:0.3pt solid #c0c8d0; } }
        </style></head><body>
        <div class="toolbar"><button onclick="window.print()">🖨️ Imprimir — APLI 1291 (8 etiq/folio)</button><span>${items.length} etiqueta${items.length!==1?'s':''} · ${Math.ceil(items.length/8)} folio${Math.ceil(items.length/8)!==1?'s':''} · A4 · Sin escalar</span></div>
        <div class="pagina">${etiquetasHtml}</div></body></html>`;
        let iframe = document.getElementById('impresion-oculta');
        if (!iframe) { iframe = document.createElement('iframe'); iframe.id = 'impresion-oculta'; iframe.style.display = 'none'; document.body.appendChild(iframe); }
        iframe.contentWindow.document.open(); iframe.contentWindow.document.write(html); iframe.contentWindow.document.close();
        const modalQr = document.getElementById('modal-qr'); if (modalQr) modalQr.classList.add('oculto');
        setTimeout(() => { iframe.contentWindow.focus(); iframe.contentWindow.print(); }, 900);
    },

    imprimirLoteQRs: (tamano = '50x23') => {
        if(App.seleccionados.size === 0) return;
        const itemsToPrint = Array.from(App.seleccionados).map(id => App.datos.find(t => t.id === id)).filter(t => t);
        if(tamano === 'a4') App.imprimirEtiquetasA4(itemsToPrint); else App.imprimirEtiquetasGodex(itemsToPrint, tamano);
        App.limpiarSeleccion();
    },

    generarQR: (id_db) => {
        const t = App.datos.find(x => x.id === id_db); if(!t) return;
        document.getElementById('modal-qr').classList.remove('oculto');
        document.getElementById('qr-texto-id').innerText = "TROQUEL " + t.id_troquel;
        document.getElementById('qr-texto-ubi').innerText = "UBI: " + (t.ubicacion || '-');
        document.getElementById('qr-texto-desc').innerText = t.nombre;
        const elArts = document.getElementById('qr-texto-arts');
        if(elArts) { if(t.codigos_articulo) { elArts.innerText = "Art: " + t.codigos_articulo; elArts.style.display = "block"; } else { elArts.style.display = "none"; } }
        new QRious({ element: document.getElementById('qr-canvas'), value: t.id.toString(), size: 200, padding: 0, level: 'M' });
        document.getElementById('btn-imprimir-qr-unico-50').onclick = () => App.imprimirEtiquetasGodex([t], '50x23');
        document.getElementById('btn-imprimir-qr-unico-100').onclick = () => App.imprimirEtiquetasGodex([t], '100x70');
        const btnA4 = document.getElementById('btn-imprimir-qr-unico-a4'); if(btnA4) btnA4.onclick = () => App.imprimirEtiquetasA4([t]);
    },

    // ─── DESCATALOGADOS ────────────────────────────────────────
    verDescatalogados: async () => {
        document.querySelectorAll('.vista').forEach(v => v.classList.add('oculto'));
        document.getElementById('vista-descatalogados').classList.remove('oculto');
        document.querySelectorAll('.menu-item').forEach(b => b.classList.remove('activo'));
        const tbody = document.getElementById('tabla-desc-body');
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">Cargando... ⏳</td></tr>';
        try {
            const res = await fetch('/api/troqueles/descatalogados');
            App.datosDescatalogados = await res.json();
            App.renderDescatalogados();
        } catch(e) { tbody.innerHTML = '<tr><td colspan="6" class="text-center text-red">Error al cargar.</td></tr>'; }
    },

    renderDescatalogados: (filtro = '') => {
        const tbody = document.getElementById('tabla-desc-body'), counter = document.getElementById('desc-contador');
        const q = filtro.toLowerCase();
        const data = q ? App.datosDescatalogados.filter(t => [t.id_troquel, t.nombre, t.ubicacion, t.codigos_articulo].some(v => v && String(v).toLowerCase().includes(q))) : App.datosDescatalogados;
        if(counter) counter.innerText = data.length;
        if(data.length === 0) { tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding:40px; color:#64748b;">${q ? 'Sin resultados para "'+filtro+'"' : 'No hay troqueles descatalogados.'}</td></tr>`; return; }
        tbody.innerHTML = data.map(t => {
            const fecha = t.fecha_descatalogado ? new Date(t.fecha_descatalogado).toLocaleDateString('es-ES') : '-';
            return `<tr><td style="font-weight:900; color:#92400e;">${t.id_troquel}</td><td>${t.ubicacion || '-'}</td><td>${t.nombre}</td><td style="color:#0369a1;">${t.codigos_articulo || '-'}</td><td style="color:#64748b;">${fecha}</td>
            <td style="white-space:nowrap;">
                <button class="btn-accion" style="background:#16a34a; padding:4px 12px; font-size:12px;" onclick="App.reactivar(${t.id})">♻️ Reactivar</button>
                <button class="btn-icono" onclick="App.generarQR(${t.id})" title="Imprimir etiqueta">🖨️</button>
            </td></tr>`;
        }).join('');
    },

    reactivar: async (id) => {
        const ubi = prompt("¿A qué estantería vuelve el troquel?");
        if(ubi === null) return;
        if(!ubi.trim()) { App.mostrarToast("Debes indicar la ubicación.", "error"); return; }
        const res = await fetch(`/api/troqueles/${id}/reactivar`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ubicacion: ubi.trim() }) });
        if(res.ok) { App.mostrarToast("Troquel reactivado al inventario."); App.datosDescatalogados = []; App.verDescatalogados(); }
        else { App.mostrarToast("Error al reactivar.", "error"); }
    },

    // ─── BACKUP ────────────────────────────────────────────────
    exportarCopiaSeguridad: async () => {
        App.mostrarToast("Generando copia de seguridad...");
        try {
            const [resActivos, resPapelera, resDesc] = await Promise.all([fetch('/api/troqueles?ver_papelera=false'), fetch('/api/troqueles?ver_papelera=true'), fetch('/api/troqueles/descatalogados')]);
            const activos = await resActivos.json(), papelera = await resPapelera.json(), descatalogados = await resDesc.json();
            const mapaIds = {}; [...activos, ...papelera, ...descatalogados].forEach(t => mapaIds[t.id] = t); const todos = Object.values(mapaIds);
            const ahora = new Date(), fecha = ahora.toISOString().split('T')[0], hora = ahora.toTimeString().slice(0,5).replace(':','-');
            const payload = { version: 2, fecha_backup: ahora.toISOString(), total: todos.length, resumen: { activos: activos.length, papelera: papelera.length, descatalogados: descatalogados.length }, troqueles: todos };
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `BACKUP_TROQUELES_${fecha}_${hora}.json`; a.click(); URL.revokeObjectURL(url);
            App.mostrarToast(`Copia descargada: ${todos.length} troqueles (${activos.length} activos, ${descatalogados.length} desc., ${papelera.length} papelera).`);
        } catch(e) { App.mostrarToast("Error al generar la copia de seguridad.", "error"); console.error(e); }
    },

    restaurarCopiaSeguridad: async (input) => {
        const file = input.files[0]; if(!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const parsed = JSON.parse(e.target.result);
                const backupData = Array.isArray(parsed) ? parsed : (parsed.troqueles || []);
                const esFecha = parsed.fecha_backup ? new Date(parsed.fecha_backup).toLocaleString('es-ES') : 'desconocida';
                const resumen = parsed.resumen || {};
                const msg = parsed.version === 2
                    ? `Backup del ${esFecha}\n\nContenido:\n• ${resumen.activos||'?'} activos\n• ${resumen.descatalogados||'?'} descatalogados\n• ${resumen.papelera||'?'} en papelera\n• Total: ${backupData.length} troqueles\n\n⚠️ Esto REEMPLAZARÁ la base de datos actual.\n¿Continuar?`
                    : `Backup con ${backupData.length} troqueles (formato antiguo).\n\n⚠️ Esto REEMPLAZARÁ la base de datos actual.\n¿Continuar?`;
                if(!confirm(msg)) return;
                App.mostrarToast("Restaurando copia de seguridad...");
                const res = await fetch('/api/troqueles/backup/restaurar', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(backupData) });
                if(res.ok) { App.mostrarToast("Base de datos restaurada correctamente."); await App.cargarTodo(); }
                else { App.mostrarToast("Error en el servidor al restaurar.", "error"); }
            } catch (err) { App.mostrarToast("Formato JSON inválido.", "error"); console.error(err); }
        };
        reader.readAsText(file);
    },

    importarCSV: async (input) => {
        if(!input.files.length) return;
        const tipo = document.getElementById('select-import-tipo').value;
        if(!tipo) { App.mostrarToast("Selecciona un tipo antes de importar.", "error"); return; }
        const fd = new FormData(); fd.append('file', input.files[0]); fd.append('categoria_id', tipo);
        App.mostrarToast("Importando CSV...");
        const res = await fetch('/api/importar_csv', { method: 'POST', body: fd });
        if(res.ok) { const d = await res.json(); App.mostrarToast(`Importados: ${d.insertados} troqueles.`); App.cargarTodo(); }
        else { const err = await res.json(); App.mostrarToast(`Error: ${err.detail}`, "error"); }
        input.value = "";
    },

    limpiarDuplicadosExactos: async () => {
        if(!confirm("¿Escanear la BD y eliminar duplicados exactos? Esta acción no se puede deshacer.")) return;
        App.mostrarToast("Escaneando duplicados...");
        const res = await fetch('/api/mantenimiento/limpiar_duplicados', { method: 'DELETE' });
        if(res.ok) { const d = await res.json(); App.mostrarToast(`${d.borrados} duplicados eliminados.`); App.cargarTodo(); }
        else { App.mostrarToast("Error al limpiar duplicados.", "error"); }
    }
};

window.onload = App.init;