// =============================================================
// ERP PACKAGING - LÓGICA V36 (AUTO-DETECTAR MÓVIL Y TOASTS)
// =============================================================

const App = {
    datos: [], seleccionados: new Set(), filtroTipo: 'TODOS',
    mapaCat: {}, mapaFam: {}, columnaOrden: 'id_troquel', ordenAsc: true,
    scanner: null, modoMovil: false, modoScanner: 'LOTE', 
    archivosActuales: [], escaneadosLote: new Map(), enPapelera: false,
    intervaloRefresco: null,

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
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(50px)';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    },

    reproducirBeep: (exito = true) => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            if(exito) {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(800, ctx.currentTime);
                gain.gain.setValueAtTime(0.1, ctx.currentTime);
                osc.start();
                osc.stop(ctx.currentTime + 0.1);
            } else {
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(300, ctx.currentTime);
                gain.gain.setValueAtTime(0.1, ctx.currentTime);
                osc.start();
                osc.stop(ctx.currentTime + 0.3);
            }
        } catch(e) { console.log("Audio no soportado"); }
    },

    comprimirImagen: (file) => {
        return new Promise((resolve) => {
            if(!file.type.startsWith('image/')) return resolve(file); 
            
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = event => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 1200; 
                    let width = img.width;
                    let height = img.height;
                    
                    if (width > MAX_WIDTH) {
                        height = Math.round((height * MAX_WIDTH) / width);
                        width = MAX_WIDTH;
                    }
                    
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    canvas.toBlob(blob => {
                        resolve(new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", { type: 'image/jpeg' }));
                    }, 'image/jpeg', 0.7);
                }
            }
        });
    },

    toggleDarkMode: () => {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        localStorage.setItem('erp_dark_mode', isDark);
    },

    toggleSidebar: () => { document.getElementById('sidebar').classList.toggle('colapsado'); },
    toggleFullScreen: () => {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(err => {});
        else if (document.exitFullscreen) document.exitFullscreen();
    },

    parseArchivos: (raw) => {
        if (!raw) return [];
        if (Array.isArray(raw)) return raw;
        if (typeof raw === 'string') {
            if (raw.trim() === "") return [];
            if (raw.trim().startsWith('[')) {
                try { 
                    const parsed = JSON.parse(raw);
                    return Array.isArray(parsed) ? parsed : [];
                } catch(e) { return []; }
            }
        }
        return [];
    },

    init: async () => {
        console.log("Iniciando ERP...");
        
        if(localStorage.getItem('erp_dark_mode') === 'true') {
            document.body.classList.add('dark-mode');
        }

        try {
            await App.cargarSelects();
            await App.cargarTodo();
            
            App.iniciarTiempoReal();

            // DETECCIÓN INTELIGENTE DE MÓVIL
            const params = new URLSearchParams(window.location.search);
            const esMovil = window.innerWidth <= 850 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            
            if (params.get('modo') === 'operario' || esMovil) {
                document.body.classList.add('kiosk-mode');
                App.activarModoMovil();
            }
        } catch(e) { console.error("Error iniciando app:", e); }
    },

    iniciarTiempoReal: () => {
        if(App.intervaloRefresco) clearInterval(App.intervaloRefresco);
        App.intervaloRefresco = setInterval(async () => {
            if(!document.getElementById('vista-lista').classList.contains('oculto') && !App.enPapelera && !App.modoMovil) {
                try {
                    const res = await fetch(`/api/troqueles?ver_papelera=false`);
                    if (res.ok) {
                        App.datos = await res.json() || [];
                        App.renderTabla(); 
                    }
                } catch(e) {}
            }
        }, 8000);
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
            const archs = App.parseArchivos(t.archivos);
            const nDocs = archs.length;
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

    generarDashboardEstadisticas: () => {
        const container = document.getElementById('dashboard-resumen');
        if(!container) return;

        let total = App.datos.length;
        let estAlmacen = 0, estProduccion = 0, estObsoleto = 0;
        let conteoFamilias = {};
        let conteoTipos = {};

        App.datos.forEach(t => {
            if(t.estado === 'EN PRODUCCION') estProduccion++;
            else if(t.estado === 'DESCATALOGADO') estObsoleto++;
            else estAlmacen++;

            let fam = App.mapaFam[t.familia_id] || 'Sin Familia';
            conteoFamilias[fam] = (conteoFamilias[fam] || 0) + 1;

            let cat = App.mapaCat[t.categoria_id] || 'Sin Tipo';
            conteoTipos[cat] = (conteoTipos[cat] || 0) + 1;
        });

        const renderLista = (obj) => {
            return Object.entries(obj)
                .sort((a,b) => b[1] - a[1])
                .slice(0, 5)
                .map(x => `<div style="display:flex; justify-content:space-between; border-bottom:1px dashed #e2e8f0; padding:6px 0; font-size:13px;"><span>${x[0]}</span> <strong style="color:#0f766e; background:#f0fdf4; padding:2px 6px; border-radius:10px;">${x[1]}</strong></div>`)
                .join('');
        };

        container.innerHTML = `
            <div style="background:white; padding:20px; border-radius:8px; border:3px solid #0f766e; box-shadow: 0 4px 6px rgba(0,0,0,0.1); display:flex; flex-direction:column; justify-content:center; align-items:center;">
                <h3 style="margin:0 0 10px 0; color:#64748b; font-size:13px; font-weight:bold; letter-spacing:1px;">TOTAL INVENTARIO</h3>
                <div style="font-size:52px; font-weight:900; color:#0f172a; line-height:1;">${total}</div>
            </div>
            <div style="background:white; padding:20px; border-radius:8px; border:1px solid #cbd5e1; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                <h3 style="margin:0 0 15px 0; color:#64748b; font-size:13px; font-weight:bold; letter-spacing:1px;">RESUMEN DE ESTADO</h3>
                <div style="display:flex; justify-content:space-between; margin-bottom:10px; font-size:15px;"><span style="color:#166534; font-weight:bold;">✅ En Almacén</span> <strong>${estAlmacen}</strong></div>
                <div style="display:flex; justify-content:space-between; margin-bottom:10px; font-size:15px;"><span style="color:#991b1b; font-weight:bold;">🏭 En Producción</span> <strong>${estProduccion}</strong></div>
                <div style="display:flex; justify-content:space-between; font-size:15px;"><span style="color:#6b7280; font-weight:bold;">⛔ Obsoletos</span> <strong>${estObsoleto}</strong></div>
            </div>
            <div style="background:white; padding:20px; border-radius:8px; border:1px solid #cbd5e1; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                <h3 style="margin:0 0 10px 0; color:#64748b; font-size:13px; font-weight:bold; letter-spacing:1px;">TOP 5 TIPOS</h3>
                ${renderLista(conteoTipos)}
            </div>
            <div style="background:white; padding:20px; border-radius:8px; border:1px solid #cbd5e1; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                <h3 style="margin:0 0 10px 0; color:#64748b; font-size:13px; font-weight:bold; letter-spacing:1px;">TOP 5 FAMILIAS</h3>
                ${renderLista(conteoFamilias)}
            </div>
        `;
    },

    cargarEstadisticas: async (meses) => {
        App.generarDashboardEstadisticas();
        
        const inputInicio = document.getElementById('fecha-inicio-uso');
        const inputFin = document.getElementById('fecha-fin-uso');
        if(inputInicio && !inputInicio.value) {
            const hoy = new Date();
            const mesPasado = new Date();
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

    cargarUsadosFechas: async () => {
        const fInicio = document.getElementById('fecha-inicio-uso').value;
        const fFin = document.getElementById('fecha-fin-uso').value;
        const tbody = document.getElementById('tabla-estadisticas-usados');
        
        if(!fInicio || !fFin) {
            App.mostrarToast("Selecciona fecha de inicio y fin.", "error");
            return;
        }
        if(fInicio > fFin) {
            App.mostrarToast("La fecha de inicio no puede ser posterior a la de fin.", "error");
            return;
        }

        tbody.innerHTML = '<tr><td colspan="6" class="text-center">Buscando movimientos... ⏳</td></tr>';
        
        try {
            const res = await fetch(`/api/estadisticas/usados?fecha_inicio=${fInicio}&fecha_fin=${fFin}`);
            if(!res.ok) throw new Error("Fallo en servidor");
            
            const data = await res.json();
            
            if(data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center text-gray-500">No se registraron movimientos de troqueles en estas fechas.</td></tr>';
                return;
            }
            
            tbody.innerHTML = data.map(t => {
                const fecha = new Date(t.ultima_fecha).toLocaleString();
                return `<tr>
                    <td style="font-weight:900; color:#16a34a;">${t.id_troquel}</td>
                    <td style="color:#0369a1; font-weight:bold;">${t.codigos_articulo || '-'}</td>
                    <td>${t.nombre}</td>
                    <td>${t.estado || '-'}</td>
                    <td><strong style="background:#dcfce7; color:#166534; padding:4px 8px; border-radius:12px; font-size:14px;">${t.movimientos} movs.</strong></td>
                    <td style="color:#64748b; font-size:13px;">${fecha}</td>
                </tr>`;
            }).join('');
        } catch(e) {
            console.error(e);
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-red">Error al cargar los datos de uso.</td></tr>';
        }
    },

    cargarHistorial: async () => { 
        const r = await fetch('/api/historial'); 
        const d = await r.json(); 
        document.getElementById('tabla-historial').innerHTML = d.map(h => {
            const t = h.troqueles || {};
            return `<tr>
                <td><small style="color:#64748b;">${new Date(h.fecha_hora).toLocaleString()}</small></td>
                <td style="font-weight:bold; color:#0f766e;">${t.id_troquel || '?'}</td>
                <td>${t.nombre || 'Desconocido'}</td>
                <td style="color:#0369a1; font-weight:bold;">${t.codigos_articulo || '-'}</td>
                <td><span style="background:#f1f5f9; padding:2px 6px; border-radius:4px;">${h.ubicacion_anterior || '-'}</span> ➔ <span style="background:#dcfce7; padding:2px 6px; border-radius:4px;">${h.ubicacion_nueva || '-'}</span></td>
            </tr>`;
        }).join(''); 
        
        const thead = document.querySelector('#vista-historial thead tr');
        if(thead) {
            thead.innerHTML = `<th>Fecha/Hora</th><th>Matrícula</th><th>Descripción</th><th>Código</th><th>Origen ➔ Destino</th>`;
        }
    },

    verHistorialTroquel: async (id, mat, nom) => {
        const modal = document.getElementById('modal-historial-unico');
        const tbody = document.getElementById('tabla-historial-unico');
        document.getElementById('hist-titulo-mat').innerText = mat;
        document.getElementById('hist-titulo-nom').innerText = nom;
        
        const theadUnico = document.querySelector('#modal-historial-unico thead tr');
        if(theadUnico) {
            theadUnico.innerHTML = `<th style="padding:15px;">Fecha/Hora</th><th style="padding:15px;">Matrícula</th><th style="padding:15px;">Código</th><th style="padding:15px;">Origen ➔ Destino</th>`;
        }

        tbody.innerHTML = '<tr><td colspan="4" class="text-center" style="padding: 40px; font-size: 18px;">Cargando movimientos... ⏳</td></tr>';
        modal.classList.remove('oculto');
        
        try {
            const res = await fetch(`/api/historial?troquel_id=${id}`);
            if (res.ok) {
                const data = await res.json();
                if (data.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="4" class="text-center" style="padding: 40px; font-size: 18px;">No hay movimientos registrados.</td></tr>';
                } else {
                    tbody.innerHTML = data.map(h => {
                        const t = h.troqueles || {};
                        return `<tr>
                            <td><small style="color:#64748b;">${new Date(h.fecha_hora).toLocaleString()}</small></td>
                            <td style="font-weight:bold; color:#0f766e;">${t.id_troquel || mat}</td>
                            <td style="color:#0369a1; font-weight:bold;">${t.codigos_articulo || '-'}</td>
                            <td><span style="background:#f1f5f9; padding:4px 8px; border-radius:4px;">${h.ubicacion_anterior || '-'}</span> ➔ <span style="background:#dcfce7; padding:4px 8px; border-radius:4px; font-weight:bold;">${h.ubicacion_nueva || '-'}</span></td>
                        </tr>`;
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
        
        const archs = App.parseArchivos(t.archivos);
        if (archs.length > 0) {
            archs.forEach(arch => {
                const icon = arch.tipo === 'pdf' ? '📄' : `<img src="${arch.url}" style="height:50px;">`;
                gal.innerHTML += `<a href="${arch.url}" target="_blank" style="margin-right:10px; text-decoration:none; display:inline-block; text-align:center;">${icon}<br><small>${arch.nombre.substring(0,10)}</small></a>`;
            });
        } else {
            gal.innerHTML = "<span style='color:#999'>Sin archivos adjuntos</span>";
        }
        
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
        
        const archs = App.parseArchivos(t.archivos);
        if (archs.length > 0) {
            archs.forEach(arch => {
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
            
            const payload = {
                id_troquel: String(t.id_troquel || ""), ubicacion: String(nueva), nombre: String(t.nombre || ""),
                categoria_id: parseInt(t.categoria_id) || null, familia_id: parseInt(t.familia_id) || null,
                tamano_troquel: String(t.tamano_troquel || ""), tamano_final: String(t.tamano_final || ""),
                codigos_articulo: String(t.codigos_articulo || ""), referencias_ot: String(t.referencias_ot || ""),
                observaciones: String(t.observaciones || ""), estado: String(t.estado || "EN ALMACEN"),
                archivos: App.parseArchivos(t.archivos)
            };
            
            const res = await fetch(`/api/troqueles/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
            if(res.ok) {
                await App.cargarTodo();
                document.getElementById('movil-ubi').innerText = nueva;
                App.mostrarToast("Ubicación actualizada correctamente.");
            } else {
                const err = await res.text();
                App.mostrarToast(`Error al guardar la ubicación: ${err}`, "error"); 
            }
        }
    },
    
    movilCambiarEstado: async (accion) => {
        const id = parseInt(document.getElementById('movil-id-db').value);
        if(!confirm(`¿Marcar como ${accion}?`)) return;
        await fetch('/api/movimientos/lote', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: [id], accion: accion }) });
        App.mostrarToast(`Troquel movido a ${accion}.`);
        await App.cargarTodo();
        App.abrirDetalleMovil(id);
    },
    
    movilSubirFoto: async (input) => {
        if(!input.files.length) return;
        const id = document.getElementById('movil-id-db').value;
        const t = App.datos.find(x => x.id == id);
        
        App.mostrarToast("Comprimiendo y subiendo foto... ⏳", "exito");
        
        try {
            const archivoOptimo = await App.comprimirImagen(input.files[0]);
            const fd = new FormData(); 
            fd.append('file', archivoOptimo);
            
            const resFoto = await fetch('/api/subir_foto', { method: 'POST', body: fd });
            if(resFoto.ok) {
                const data = await resFoto.json();
                
                const nuevosArchivos = App.parseArchivos(t.archivos);
                nuevosArchivos.push({ url: data.url, nombre: archivoOptimo.name, tipo: data.tipo });
                
                const payload = {
                    id_troquel: String(t.id_troquel || ""), ubicacion: String(t.ubicacion || ""), nombre: String(t.nombre || ""),
                    categoria_id: parseInt(t.categoria_id) || null, familia_id: parseInt(t.familia_id) || null,
                    tamano_troquel: String(t.tamano_troquel || ""), tamano_final: String(t.tamano_final || ""),
                    codigos_articulo: String(t.codigos_articulo || ""), referencias_ot: String(t.referencias_ot || ""),
                    observaciones: String(t.observaciones || ""), estado: String(t.estado || "EN ALMACEN"),
                    archivos: nuevosArchivos
                };
                
                const resDb = await fetch(`/api/troqueles/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
                
                if(resDb.ok) {
                    App.mostrarToast("Foto guardada correctamente.");
                    await App.cargarTodo();
                    App.abrirDetalleMovil(id);
                } else {
                    const errorBackend = await resDb.text();
                    App.mostrarToast(`La foto subió, pero BD falló: ${errorBackend}`, "error");
                }
            } else {
                const errUpload = await resFoto.json();
                App.mostrarToast(`Error subiendo imagen: ${errUpload.detail}`, "error");
            }
        } catch(e) { 
            App.mostrarToast("Error general de red al procesar la foto.", "error"); 
            console.error(e); 
        }
        input.value = "";
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
                        App.reproducirBeep(true); 
                        App.toggleScanner(false);
                        if(navigator.vibrate) navigator.vibrate(200);
                        App.abrirDetalleMovil(t.id);
                    } else {
                        if(!App.escaneadosLote.has(t.id)) { 
                            App.reproducirBeep(true); 
                            App.escaneadosLote.set(t.id, t); 
                            App.renderListaEscaneados(); 
                            if(navigator.vibrate) navigator.vibrate(100); 
                        }
                    }
                    last = txt; t0 = Date.now();
                } else {
                    App.reproducirBeep(false); 
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
    
    borrar: async (id) => { if(confirm("¿Mover a la papelera?")) { await fetch(`/api/troqueles/${id}`, { method:'DELETE' }); App.mostrarToast("Enviado a papelera."); App.cargarTodo(); } },
    restaurar: async (id) => { await fetch(`/api/troqueles/${id}/restaurar`, {method:'POST'}); App.mostrarToast("Restaurado."); App.cargarTodo(true); },
    
    borrarLote: async () => {
        if(!confirm(`¿Mover ${App.seleccionados.size} troqueles a la papelera?`)) return;
        await fetch('/api/troqueles/bulk/papelera', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: Array.from(App.seleccionados) }) });
        App.limpiarSeleccion(); App.mostrarToast("Lote enviado a papelera."); App.cargarTodo();
    },
    restaurarLote: async () => {
        await fetch('/api/troqueles/bulk/restaurar', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: Array.from(App.seleccionados) }) });
        App.limpiarSeleccion(); App.mostrarToast("Lote restaurado."); App.cargarTodo(true);
    },
    destruirLote: async () => {
        if(!confirm(`¡PELIGRO! ¿Eliminar permanentemente ${App.seleccionados.size} troqueles?\nEsta acción NO se puede deshacer.`)) return;
        await fetch('/api/troqueles/bulk/destruir', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: Array.from(App.seleccionados) }) });
        App.limpiarSeleccion(); App.mostrarToast("Lote destruido."); App.cargarTodo(true);
    },
    destruirUnico: async (id) => {
        if(confirm("¡PELIGRO! ¿Eliminar este troquel para siempre? No podrás recuperarlo.")) {
            await fetch('/api/troqueles/bulk/destruir', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: [id] }) });
            App.mostrarToast("Troquel destruido."); App.cargarTodo(true);
        }
    },
    vaciarPapelera: async () => {
        if(App.datos.length === 0) { App.mostrarToast("La papelera ya está vacía.", "error"); return; }
        if(!confirm("⚠️ ¡PELIGRO EXTREMO! ⚠️\n\n¿Estás seguro de que quieres eliminar TODOS los troqueles de la papelera?\nSe borrarán para siempre y no hay marcha atrás.")) return;
        
        const todosIds = App.datos.map(t => t.id);
        await fetch('/api/troqueles/bulk/destruir', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: todosIds }) });
        App.mostrarToast("Papelera vaciada por completo."); App.cargarTodo(true);
    },
    restaurarTodoPapelera: async () => {
        if(App.datos.length === 0) return;
        const todosIds = App.datos.map(t => t.id);
        await fetch('/api/troqueles/bulk/restaurar', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: todosIds }) });
        App.mostrarToast("Todo restaurado."); App.cargarTodo(true);
    },

    verPapelera: () => App.cargarTodo(true), salirPapelera: () => App.cargarTodo(false),
    
    crearFamilia: async () => { 
        const n = prompt("Nombre de la nueva Familia:"); 
        if(n) { 
            try {
                const res = await fetch('/api/familias', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({nombre:n}) }); 
                if(res.ok) {
                    const data = await res.json();
                    await App.cargarSelects(); 
                    if(data && data.length > 0) {
                        const el = document.getElementById('f-fam');
                        if(el) el.value = data[0].id;
                    }
                    App.mostrarToast(`Familia "${n.toUpperCase()}" creada con éxito.`);
                } else {
                    const err = await res.json();
                    App.mostrarToast(`Error al crear familia: ${err.detail}`, "error");
                }
            } catch(e) { App.mostrarToast("Error de red al intentar crear la familia.", "error"); }
        } 
    },
    
    crearTipo: async () => { 
        const n = prompt("Nombre del nuevo Tipo:"); 
        if(n) { 
            try {
                const res = await fetch('/api/categorias', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({nombre:n}) }); 
                if(res.ok) {
                    const data = await res.json();
                    await App.cargarSelects(); 
                    if(data && data.length > 0) {
                        const el = document.getElementById('f-cat');
                        if(el) el.value = data[0].id;
                        App.calcularSiguienteId();
                    }
                    App.mostrarToast(`Tipo "${n.toUpperCase()}" creado.`);
                } else {
                    const err = await res.json();
                    App.mostrarToast(`Error al crear tipo: ${err.detail}`, "error");
                }
            } catch(e) { App.mostrarToast("Error de red al intentar crear el tipo.", "error"); }
        } 
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
    renderListaArchivos: () => { 
        const div = document.getElementById('lista-archivos'); div.innerHTML=""; 
        App.archivosActuales.forEach((a,i) => div.innerHTML += `<div>${a.nombre} <span onclick="App.quitarArchivo(${i})" style="color:red;cursor:pointer; font-weight:bold;"> ✕</span></div>`); 
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
    
    buscarMovil: (txt) => { 
        const d = document.getElementById('resultados-movil'); d.innerHTML = ""; 
        if(txt.length<2) return; 
        const h = App.datos.filter(t => (t.nombre+t.id_troquel+(t.ubicacion||"")).toLowerCase().includes(txt.toLowerCase())); 
        d.innerHTML = h.slice(0,50).map(t => `<div class="card-movil" onclick="App.abrirDetalleMovil(${t.id})"><div style="font-weight:900;">${t.id_troquel}</div><div>${t.nombre}</div><button class="btn-secundario">Ver</button></div>`).join(''); 
    },
    
    nuevoTroquel: () => { document.getElementById('titulo-form').innerText="Nuevo"; document.querySelector('form').reset(); document.getElementById('f-id-db').value=""; App.archivosActuales=[]; App.renderListaArchivos(); if(App.modoMovil) document.getElementById('sidebar').classList.add('oculto'); App.nav('vista-formulario'); },
    editar: (id) => { 
        const t = App.datos.find(x=>x.id===id); if(!t)return;
        document.getElementById('titulo-form').innerText="Editar";
        const setVal = (elId, val) => { const el = document.getElementById(elId); if(el) el.value = val; };
        setVal('f-id-db', t.id); setVal('f-matricula', t.id_troquel); setVal('f-ubicacion', t.ubicacion);
        setVal('f-nombre', t.nombre); setVal('f-cat', t.categoria_id||""); setVal('f-fam', t.familia_id||"");
        setVal('f-medidas-madera', t.tamano_troquel||""); setVal('f-medidas-corte', t.tamano_final||"");
        setVal('f-arts', t.codigos_articulo||""); setVal('f-ot', t.referencias_ot||""); setVal('f-obs', t.observaciones||"");
        
        App.archivosActuales = App.parseArchivos(t.archivos);
        
        App.renderListaArchivos();
        if(App.modoMovil) document.getElementById('sidebar').classList.add('oculto'); 
        App.nav('vista-formulario');
    },
    volverDesdeForm: () => { if(App.modoMovil) App.activarModoMovil(); else App.nav('vista-lista'); },
    guardarFicha: async (e) => {
        e.preventDefault(); const id = document.getElementById('f-id-db').value;
        const getVal = (elId) => { const el = document.getElementById(elId); return el ? el.value : ""; };
        
        const d = { 
            id_troquel: String(getVal('f-matricula')), ubicacion: String(getVal('f-ubicacion')), nombre: String(getVal('f-nombre')),
            categoria_id: parseInt(getVal('f-cat'))||null, familia_id: parseInt(getVal('f-fam'))||null,
            tamano_troquel: String(getVal('f-medidas-madera')), tamano_final: String(getVal('f-medidas-corte')),
            codigos_articulo: String(getVal('f-arts')), referencias_ot: String(getVal('f-ot')),
            observaciones: String(getVal('f-obs')), archivos: App.archivosActuales
        };
        
        const res = await fetch(id ? `/api/troqueles/${id}` : '/api/troqueles', { method: id?'PUT':'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(d) });
        if(!res.ok) {
             const err = await res.text();
             App.mostrarToast(`Error guardando ficha en BD: ${err}`, "error");
        } else {
             App.mostrarToast("Ficha guardada con éxito.");
             await App.cargarTodo(); App.volverDesdeForm();
        }
    },
    
    calcularSiguienteId: async () => { 
        const c = document.getElementById('f-cat').value; 
        if(c) { 
            try { 
                const r = await fetch(`/api/siguiente_numero?categoria_id=${c}`); 
                const d = await r.json(); 
                document.getElementById('f-matricula').value = d.siguiente; 
                
                const inputUbi = document.getElementById('f-ubicacion');
                if(inputUbi && inputUbi.value.trim() === "") {
                    inputUbi.value = d.siguiente; 
                }
            } catch(e){} 
        } 
    },
    
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
                dataToSend.archivos = App.parseArchivos(dataToSend.archivos);

                await fetch(`/api/troqueles/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(dataToSend) }); 
                App.mostrarToast("Troquel descatalogado.");
                await App.cargarTodo(); 
                if(!document.getElementById('vista-estadisticas').classList.contains('oculto')) App.cargarEstadisticas(document.getElementById('select-inactividad').value);
            }
        } 
    },
    moverLote: async (acc) => { await fetch('/api/movimientos/lote', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: Array.from(App.seleccionados), accion: acc }) }); App.mostrarToast("Lote movido."); App.limpiarSeleccion(); App.cargarTodo(); },
    asignarMasivo: async (c) => { let id=c==='familia'?'bulk-familia':'bulk-tipo'; let v=document.getElementById(id).value; if(v && confirm("¿Aplicar?")) { await fetch(`/api/troqueles/bulk/${c}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: Array.from(App.seleccionados), valor_id: parseInt(v) }) }); App.mostrarToast("Asignación masiva completada."); App.limpiarSeleccion(); App.cargarTodo(); } },
    abrirGestionAux: () => document.getElementById('modal-aux').classList.remove('oculto'),

    imprimirEtiquetasGodex: (items, tamano = '50x23') => {
        let printWindow = window.open('', '_blank', 'width=600,height=600');
        if (!printWindow) { App.mostrarToast("El navegador bloqueó la ventana emergente.", "error"); return; }
        let css = ''; let qrSize = 150;
        if (tamano === '100x70') {
            qrSize = 300;
            css = `@page{size:100mm 70mm;margin:0} body{margin:0;padding:0;font-family:'Arial',sans-serif;background:#fff} .label{width:100mm;height:70mm;box-sizing:border-box;padding:3mm;display:flex;align-items:center;justify-content:space-between;page-break-after:always;overflow:hidden} .qr{width:40mm;display:flex;justify-content:center;align-items:center} .qr img{width:38mm;height:38mm} .text{width:55mm;padding-left:2mm;display:flex;flex-direction:column;justify-content:center} .mat{font-size:18pt;font-weight:900;line-height:1.1;margin-bottom:6px;color:black} .ubi{font-size:16pt;font-weight:900;line-height:1.1;margin-bottom:6px;color:black;text-transform:uppercase} .nom{font-size:11pt;line-height:1.2;color:black;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;margin-bottom:6px} .arts{font-size:10pt;font-weight:bold;color:#333;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}`;
        } else {
            qrSize = 150;
            css = `@page{size:50mm 23mm;margin:0} body{margin:0;padding:0;font-family:'Arial',sans-serif;background:#fff} .label{width:50mm;height:23mm;box-sizing:border-box;padding:1mm;display:flex;align-items:center;justify-content:space-between;page-break-after:always;overflow:hidden} .qr{width:19mm;display:flex;justify-content:center;align-items:center} .qr img{width:18mm;height:18mm} .text{width:28mm;padding-left:1mm;display:flex;flex-direction:column;justify-content:center} .mat{font-size:8.5pt;font-weight:900;line-height:1;margin-bottom:2px;color:black} .ubi{font-size:8.5pt;font-weight:900;line-height:1;margin-bottom:3px;color:black;text-transform:uppercase} .nom{font-size:6pt;line-height:1.1;color:black;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;margin-bottom:2px} .arts{font-size:6pt;font-weight:bold;color:#333;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}`;
        }
        css += `@media screen{body{background:#334155;padding:20px;display:flex;flex-direction:column;align-items:center}.label{background:#fff;margin-bottom:10px;box-shadow:0 4px 6px rgba(0,0,0,0.3);border-radius:2px}.btn{background:#14b8a6;color:white;padding:15px 30px;border:none;border-radius:8px;font-size:18px;font-weight:bold;cursor:pointer;margin-bottom:20px}} @media print{.no-print{display:none !important}}`;
        let html = `<!DOCTYPE html><html><head><title>Impresión Godex ${tamano}</title><style>${css}</style></head><body><button class="no-print btn" onclick="window.print()">🖨️ Iniciar Impresión Godex (${tamano})</button>`;
        items.forEach(t => {
            const qr = new QRious({ value: t.id.toString(), size: qrSize, level: 'M' });
            const htmlArt = t.codigos_articulo ? `<div class="arts">Art: ${t.codigos_articulo}</div>` : '';
            html += `<div class="label"><div class="qr"><img src="${qr.toDataURL()}"></div><div class="text"><div class="mat">TROQUEL ${t.id_troquel}</div><div class="ubi">UBI: ${t.ubicacion || '-'}</div><div class="nom">${t.nombre}</div>${htmlArt}</div></div>`;
        });
        html += `</body></html>`;
        printWindow.document.write(html); printWindow.document.close();
        const modalQr = document.getElementById('modal-qr'); if (modalQr) modalQr.classList.add('oculto');
        setTimeout(() => { printWindow.print(); }, 800);
    },
    imprimirLoteQRs: (tamano = '50x23') => { if(App.seleccionados.size === 0) return; const itemsToPrint = Array.from(App.seleccionados).map(id => App.datos.find(t => t.id === id)).filter(t => t); App.imprimirEtiquetasGodex(itemsToPrint, tamano); App.limpiarSeleccion(); },
    generarQR: (id_db) => { 
        const t = App.datos.find(x => x.id === id_db); if(!t) return;
        document.getElementById('modal-qr').classList.remove('oculto'); 
        document.getElementById('qr-texto-id').innerText = "TROQUEL " + t.id_troquel; 
        document.getElementById('qr-texto-ubi').innerText = "UBI: " + (t.ubicacion || '-'); 
        document.getElementById('qr-texto-desc').innerText = t.nombre; 
        const elArts = document.getElementById('qr-texto-arts');
        if(elArts) { if(t.codigos_articulo) { elArts.innerText = "Art: " + t.codigos_articulo; elArts.style.display = "block"; } else { elArts.style.display = "none"; } }
        new QRious({ element: document.getElementById('qr-canvas'), value: t.id.toString(), size: 200, padding: 0, level: 'M' }); 
        document.getElementById('btn-imprimir-qr-unico-50').onclick = () => { App.imprimirEtiquetasGodex([t], '50x23'); };
        document.getElementById('btn-imprimir-qr-unico-100').onclick = () => { App.imprimirEtiquetasGodex([t], '100x70'); };
    },

    limpiarDuplicadosExactos: async () => {
        if(confirm("⚠️ ¿Estás seguro? Esto escaneará toda tu base de datos y borrará los troqueles que sean COPIAS EXACTAS.")) {
            const btn = document.getElementById('btn-limpiar-dup');
            if(btn) btn.innerText = "⏳ Limpiando...";
            try {
                const res = await fetch('/api/mantenimiento/limpiar_duplicados', { method: 'DELETE' });
                const data = await res.json();
                App.mostrarToast(`Se han borrado ${data.borrados} duplicados.`);
                await App.cargarTodo();
            } catch(e) { App.mostrarToast("Error al limpiar duplicados.", "error"); }
            if(btn) btn.innerText = "🧹 Borrar Duplicados Exactos de la BD";
            document.getElementById('modal-aux').classList.add('oculto');
        }
    },

    procesarImportacion: async (input) => { 
        const file = input.files[0]; if(!file) return; 
        const selectElement = document.getElementById('select-import-tipo');
        const idTipoDefecto = (selectElement && selectElement.value) ? parseInt(selectElement.value) : null;
        
        App.mostrarToast("Procesando archivo, por favor espera...", "exito");
        
        const reader = new FileReader(); 
        reader.onload = async(e) => { 
            try {
                const filas = e.target.result.split(/\r?\n/); 
                if(filas.length < 2) { App.mostrarToast("Archivo vacío o sin datos.", "error"); return; }
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
                if (colsMap.mat === -1) colsMap.mat = 0; if (colsMap.ubi === -1) colsMap.ubi = 1; if (colsMap.nom === -1) colsMap.nom = 2;
                const catNameToId = {}; Object.keys(App.mapaCat).forEach(id => { catNameToId[normalizar(App.mapaCat[id])] = parseInt(id); });
                const troqueles = []; const hashesExistentes = new Set(); let duplicadosOmitidos = 0;
                const generarHuella = (t) => { return [t.id_troquel, t.ubicacion, t.nombre, t.categoria_id, t.familia_id, t.codigos_articulo, t.referencias_ot, t.tamano_troquel, t.tamano_final, t.observaciones].map(x => (x || "").toString().trim().toUpperCase()).join('|'); };
                App.datos.forEach(t => hashesExistentes.add(generarHuella(t)));
                for(let i=1; i<filas.length; i++) {
                    const f = filas[i]; if(!f.trim()) continue;
                    const cols = f.split(separador);
                    const mat = colsMap.mat !== -1 && cols[colsMap.mat] ? cols[colsMap.mat].replace(/['"]/g,'').trim() : null; if(!mat) continue; 
                    const ubi = colsMap.ubi !== -1 && cols[colsMap.ubi] ? cols[colsMap.ubi].replace(/['"]/g,'').trim() : mat;
                    const nom = colsMap.nom !== -1 && cols[colsMap.nom] ? cols[colsMap.nom].replace(/['"]/g,'').trim() : "Sin Descripción";
                    const tipoStr = colsMap.tipo !== -1 && cols[colsMap.tipo] ? normalizar(cols[colsMap.tipo]) : null;
                    const ot = colsMap.ot !== -1 && cols[colsMap.ot] ? cols[colsMap.ot].replace(/['"]/g,'').trim() : "";
                    const arts = colsMap.arts !== -1 && cols[colsMap.arts] ? cols[colsMap.arts].replace(/['"]/g,'').trim() : "";
                    const madera = colsMap.madera !== -1 && cols[colsMap.madera] ? cols[colsMap.madera].replace(/['"]/g,'').trim() : "";
                    const corte = colsMap.corte !== -1 && cols[colsMap.corte] ? cols[colsMap.corte].replace(/['"]/g,'').trim() : "";
                    const obs = colsMap.obs !== -1 && cols[colsMap.obs] ? cols[colsMap.obs].replace(/['"]/g,'').trim() : "";
                    let catId = idTipoDefecto; if(tipoStr && catNameToId[tipoStr]) catId = catNameToId[tipoStr]; 
                    const nuevoTroquel = { id_troquel: mat, ubicacion: ubi, nombre: nom, categoria_id: catId, referencias_ot: ot, codigos_articulo: arts, tamano_troquel: madera, tamano_final: corte, observaciones: obs };
                    const huella = generarHuella(nuevoTroquel);
                    if (!hashesExistentes.has(huella)) { troqueles.push(nuevoTroquel); hashesExistentes.add(huella); } else { duplicadosOmitidos++; }
                }
                
                if(troqueles.length === 0) { App.mostrarToast(`Nada nuevo. Se ignoraron ${duplicadosOmitidos} duplicados.`); input.value = ""; return; }
                const res = await fetch('/api/troqueles/importar', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(troqueles) });
                if(res.ok) { 
                    App.cargarTodo(); 
                    App.mostrarToast(`Importados ${troqueles.length}. Ignorados ${duplicadosOmitidos} duplicados.`);
                    if(selectElement) selectElement.value = ""; 
                } else { App.mostrarToast(`ERROR DE BASE DE DATOS.`, "error"); }
            } catch (err) { App.mostrarToast("Error procesando el archivo.", "error"); }
            input.value = ""; 
        }; 
        reader.readAsText(file, 'ISO-8859-1');
    },
    
    exportarCopiaSeguridad: () => {
        if(App.datos.length === 0) { App.mostrarToast("No hay datos.", "error"); return; }
        const dataStr = JSON.stringify(App.datos, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url;
        a.download = `BACKUP_TOTAL_${new Date().toISOString().split('T')[0]}.json`;
        a.click(); App.mostrarToast("Copia descargada.");
    },

    restaurarCopiaSeguridad: async (input) => {
        const file = input.files[0]; if(!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const backupData = JSON.parse(e.target.result);
                if(!confirm(`Se van a restaurar ${backupData.length} troqueles. ¿Seguro?`)) return;
                App.mostrarToast("Subiendo copia de seguridad...", "exito");
                const res = await fetch('/api/troqueles/backup/restaurar', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(backupData) });
                if(res.ok) { App.mostrarToast("Base de datos restaurada."); App.cargarTodo(); } 
                else { App.mostrarToast("Error en el servidor.", "error"); }
            } catch (err) { App.mostrarToast("Formato JSON inválido.", "error"); }
        };
        reader.readAsText(file);
    }
};

window.onload = App.init;