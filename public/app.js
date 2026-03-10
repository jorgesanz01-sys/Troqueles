// =============================================================
// ERP PACKAGING - LÓGICA V36 (AUTO-DETECTAR MÓVIL Y TOASTS)
// =============================================================

const App = {
    datos: [], seleccionados: new Set(), filtroTipo: 'TODOS',
    mapaCat: {}, mapaFam: {}, columnaOrden: 'id_troquel', ordenAsc: true,
    scanner: null, modoMovil: false, modoScanner: 'LOTE', 
    archivosActuales: [], escaneadosLote: new Map(),
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
            const vistaLista = document.getElementById('vista-lista');
            if(!vistaLista.classList.contains('oculto') && !App.modoMovil) {
                try {
                    const res = await fetch('/api/troqueles?ver_papelera=false');
                    if (res.ok) {
                        App.datos = await res.json() || [];
                        App.renderTabla(); 
                    }
                } catch(e) {}
            }
        }, 8000);
    },

    cargarTodo: async () => {
        try {
            const res = await fetch('/api/troqueles?ver_papelera=false');
            if (res.ok) {
                App.datos = await res.json() || [];
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
            if(t.estado === 'DESCATALOGADO') return false; // tiene su propia vista
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

            const st = `<span style="background:${bg}; color:${col}; padding:3px 8px; border-radius:10px; font-size:10px; font-weight:800; letter-spacing:0.5px;">${textoEstado}</span>`;

            let fam = App.mapaFam[t.familia_id];
            if(!fam && t.familia_id) fam = `<span style="color:red">ID:${t.familia_id}</span>`;

            const btns = `
                <button class="btn-icono" onclick="App.verHistorialTroquel(${t.id}, '${t.id_troquel}', '${t.nombre.replace(/'/g,"")}')" title="Historial">🕒</button>
                <button class="btn-icono" onclick="App.generarQR(${t.id})" title="Imprimir Etiqueta">🖨️</button>
                <button class="btn-icono" onclick="App.descatalogar(${t.id})" style="color:#f59e0b" title="Descatalogar">⛔</button>
                <button class="btn-icono" onclick="App.borrar(${t.id})" style="color:red" title="A la papelera">🗑️</button>
            `;

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
        const container = document.getElementById('dashboard-resumen');
        if(!container) return;

        let total = App.datos.length;
        let estAlmacen = 0, estProduccion = 0;
        let conteoFamilias = {};
        let conteoTipos = {};

        App.datos.forEach(t => {
            if(t.estado === 'EN PRODUCCION') estProduccion++;
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
                .map(x => `<div style="display:flex; justify-content:space-between; border-bottom:1px dashed #e2e8f0; padding:5px 0; font-size:12px;"><span>${x[0]}</span> <strong style="color:#0f766e; background:#f0fdf4; padding:1px 6px; border-radius:10px;">${x[1]}</strong></div>`)
                .join('');
        };

        container.innerHTML = `
            <div style="background:white; padding:12px 16px; border-radius:8px; border:3px solid #0f766e; box-shadow: 0 4px 6px rgba(0,0,0,0.1); display:flex; flex-direction:column; justify-content:center; align-items:center;">
                <h3 style="margin:0 0 6px 0; color:#64748b; font-size:12px; font-weight:bold; letter-spacing:1px;">TOTAL INVENTARIO</h3>
                <div style="font-size:48px; font-weight:900; color:#0f172a; line-height:1;">${total}</div>
            </div>
            <div style="background:white; padding:12px 16px; border-radius:8px; border:1px solid #cbd5e1; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                <h3 style="margin:0 0 10px 0; color:#64748b; font-size:12px; font-weight:bold; letter-spacing:1px;">RESUMEN DE ESTADO</h3>
                <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:14px;"><span style="color:#166534; font-weight:bold;">✅ En Almacén</span> <strong>${estAlmacen}</strong></div>
                <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:14px;"><span style="color:#991b1b; font-weight:bold;">🏭 En Producción</span> <strong>${estProduccion}</strong></div>
                <div style="display:flex; justify-content:space-between; font-size:14px;"><span style="color:#6b7280; font-weight:bold; cursor:pointer;" onclick="App.verDescatalogados()">⛔ Ver Descatalogados →</span></div>
            </div>
            <div style="background:white; padding:12px 16px; border-radius:8px; border:1px solid #cbd5e1; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                <h3 style="margin:0 0 8px 0; color:#64748b; font-size:12px; font-weight:bold; letter-spacing:1px;">TOP 5 TIPOS</h3>
                ${renderLista(conteoTipos)}
            </div>
            <div style="background:white; padding:12px 16px; border-radius:8px; border:1px solid #cbd5e1; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                <h3 style="margin:0 0 8px 0; color:#64748b; font-size:12px; font-weight:bold; letter-spacing:1px;">TOP 5 FAMILIAS</h3>
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
            // panel-acciones solo existe en inventario activo, siempre muestra acciones normales
            const an = document.getElementById('acciones-normales');
            if(an) an.style.display = 'inline-flex';
        } else { 
            p.classList.add('oculto'); 
        } 
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
        // Navega a la vista dedicada de papelera y carga sus datos
        document.querySelectorAll('.vista').forEach(v => v.classList.add('oculto'));
        document.getElementById('vista-papelera').classList.remove('oculto');
        document.querySelectorAll('.menu-item').forEach(b => b.classList.remove('activo'));
        App.seleccionados.clear();
        await App.cargarPapelera();
    },

    datosPapelera: [],

    cargarPapelera: async () => {
        const tbody = document.getElementById('tabla-papelera-body');
        const counter = document.getElementById('papelera-contador');
        if(!tbody) return;
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Cargando... ⏳</td></tr>';
        try {
            const res = await fetch('/api/troqueles?ver_papelera=true');
            App.datosPapelera = await res.json();
            if(counter) counter.innerText = App.datosPapelera.length;
            if(App.datosPapelera.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding:40px; color:#64748b;">La papelera está vacía.</td></tr>';
                return;
            }
            tbody.innerHTML = App.datosPapelera.map(t => `<tr>
                <td style="font-weight:900; color:#64748b;">${t.id_troquel}</td>
                <td>${t.nombre}</td>
                <td style="color:#0369a1;">${t.codigos_articulo || '-'}</td>
                <td>${t.ubicacion || '-'}</td>
                <td style="white-space:nowrap;">
                    <button class="btn-accion" style="background:#22c55e; padding:4px 10px; font-size:12px; margin-right:4px;" onclick="App.restaurar(${t.id})">♻️ Restaurar</button>
                    <button class="btn-accion" style="background:#f59e0b; padding:4px 10px; font-size:12px; margin-right:4px;" onclick="App.descatalogarDesdePapelera(${t.id})">⛔ Descatalogar</button>
                    <button class="btn-accion" style="background:#b91c1c; padding:4px 10px; font-size:12px;" onclick="App.destruirUnico(${t.id})">🔥 Eliminar</button>
                </td>
            </tr>`).join('');
        } catch(e) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-red">Error al cargar la papelera.</td></tr>';
        }
    },

    restaurar: async (id) => {
        await fetch(`/api/troqueles/${id}/restaurar`, {method:'POST'});
        App.mostrarToast("Troquel restaurado al inventario.");
        await App.cargarPapelera();
    },

    destruirUnico: async (id) => {
        if(confirm("¡PELIGRO! ¿Eliminar este troquel para siempre? No podrás recuperarlo.")) {
            await fetch('/api/troqueles/bulk/destruir', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: [id] }) });
            App.mostrarToast("Troquel eliminado definitivamente.");
            await App.cargarPapelera();
        }
    },

    vaciarPapelera: async () => {
        if(App.datosPapelera.length === 0) { App.mostrarToast("La papelera ya está vacía.", "error"); return; }
        if(!confirm(`⚠️ ¿Eliminar DEFINITIVAMENTE los ${App.datosPapelera.length} troqueles de la papelera? No hay marcha atrás.`)) return;
        const ids = App.datosPapelera.map(t => t.id);
        await fetch('/api/troqueles/bulk/destruir', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids }) });
        App.mostrarToast("Papelera vaciada.");
        App.datosPapelera = [];
        await App.cargarPapelera();
    },

    restaurarTodoPapelera: async () => {
        if(App.datosPapelera.length === 0) { App.mostrarToast("La papelera está vacía.", "error"); return; }
        if(!confirm(`¿Restaurar los ${App.datosPapelera.length} troqueles al inventario?`)) return;
        const ids = App.datosPapelera.map(t => t.id);
        await fetch('/api/troqueles/bulk/restaurar', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids }) });
        App.mostrarToast(`${ids.length} troqueles restaurados al inventario.`);
        App.datosPapelera = [];
        await App.cargarPapelera();
    },

    
    descatalogarDesdePapelera: async (id) => {
        const palet = prompt("Ubicación del palet donde se guarda el troquel:");
        if(palet === null) return;
        if(!palet.trim()) { App.mostrarToast("Debes indicar la ubicación.", "error"); return; }
        await fetch('/api/troqueles/bulk/descatalogar', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ ids: [id], ubicacion: palet.trim() })
        });
        App.mostrarToast("Troquel movido a Descatalogados.");
        await App.cargarPapelera();
    },

    descatalogarTodoPapelera: async () => {
        if(App.datosPapelera.length === 0) { App.mostrarToast("La papelera está vacía.", "error"); return; }
        const palet = prompt(`Ubicación del palet para los ${App.datosPapelera.length} troqueles:`);
        if(palet === null) return;
        if(!palet.trim()) { App.mostrarToast("Debes indicar la ubicación.", "error"); return; }
        const ids = App.datosPapelera.map(t => t.id);
        await fetch('/api/troqueles/bulk/descatalogar', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ ids, ubicacion: palet.trim() })
        });
        App.mostrarToast(`${ids.length} troqueles movidos a Descatalogados.`);
        App.datosPapelera = [];
        await App.cargarPapelera();
    },

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
        if(v==='vista-lista') {
            document.getElementById('sidebar').classList.remove('oculto');
            // Asegurar que el inventario siempre muestra datos activos al navegar
            if(App.datos.length === 0 || document.getElementById('titulo-lista').innerText.includes('PAPELERA')) {
                App.cargarTodo();
            }
        }
    },
    
    buscarMovil: (txt) => { 
        const d = document.getElementById('resultados-movil'); d.innerHTML = ""; 
        if(txt.length<2) return;
        const q = txt.toLowerCase();
        const h = App.datos.filter(t => [
            t.id_troquel, t.nombre, t.ubicacion,
            t.codigos_articulo, t.referencias_ot,
            t.observaciones, t.tamano_troquel, t.tamano_final,
            App.mapaFam[t.familia_id], App.mapaCat[t.categoria_id]
        ].some(v => v && String(v).toLowerCase().includes(q)));
        if(h.length === 0) {
            d.innerHTML = '<div style="padding:20px; text-align:center; color:#64748b;">Sin resultados</div>';
            return;
        }
        d.innerHTML = h.slice(0,50).map(t => `
            <div class="card-movil" onclick="App.abrirDetalleMovil(${t.id})">
                <div style="font-weight:900; color:var(--primary);">${t.id_troquel}</div>
                <div style="font-size:13px; margin:2px 0;">${t.nombre}</div>
                <div style="font-size:11px; color:#64748b;">${t.ubicacion || ''} ${t.codigos_articulo ? '· '+t.codigos_articulo : ''}</div>
                <button class="btn-secundario" style="margin-top:6px;">Ver ficha</button>
            </div>`).join(''); 
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
        const t = App.datos.find(x => x.id === id); if(!t) return;
        const palet = prompt(
            `¿Dónde se apila "${t.id_troquel}"?\n(Ej: PALET-A, PALET-3...)\nUbicación actual: ${t.ubicacion}`,
            'PALET-1'
        );
        if(palet === null) return;
        if(!palet.trim()) { App.mostrarToast("Debes indicar la ubicación del palet.", "error"); return; }
        const res = await fetch('/api/troqueles/bulk/descatalogar', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ ids: [id], ubicacion: palet.trim() })
        });
        if(res.ok) {
            App.mostrarToast(`${t.id_troquel} → Descatalogado en ${palet.trim().toUpperCase()}`);
            await App.cargarTodo();
        } else {
            App.mostrarToast("Error al descatalogar.", "error");
        }
    },

    descatalogarLote: async () => {
        if(App.seleccionados.size === 0) return;
        const palet = prompt(`¿Dónde se apilan los ${App.seleccionados.size} troqueles seleccionados?\n(Ej: PALET-A, PALET-3...)`);
        if(palet === null) return;
        if(!palet.trim()) { App.mostrarToast("Debes indicar la ubicación del palet.", "error"); return; }
        const res = await fetch('/api/troqueles/bulk/descatalogar', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ ids: Array.from(App.seleccionados), ubicacion: palet.trim() })
        });
        if(res.ok) {
            App.mostrarToast(`${App.seleccionados.size} troqueles descatalogados → ${palet.trim().toUpperCase()}`);
            App.limpiarSeleccion();
            await App.cargarTodo();
        } else {
            App.mostrarToast("Error al descatalogar.", "error");
        }
    },
    moverLote: async (acc) => { await fetch('/api/movimientos/lote', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: Array.from(App.seleccionados), accion: acc }) }); App.mostrarToast("Lote movido."); App.limpiarSeleccion(); App.cargarTodo(); },
    asignarMasivo: async (c) => { let id=c==='familia'?'bulk-familia':'bulk-tipo'; let v=document.getElementById(id).value; if(v && confirm("¿Aplicar?")) { await fetch(`/api/troqueles/bulk/${c}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: Array.from(App.seleccionados), valor_id: parseInt(v) }) }); App.mostrarToast("Asignación masiva completada."); App.limpiarSeleccion(); App.cargarTodo(); } },
    abrirGestionAux: () => document.getElementById('modal-aux').classList.remove('oculto'),


    // ============================================================
    // FUNCIÓN GODEX - CANVAS HORIZONTAL (v6)
    // Driver en landscape → papel sale ancho x alto (50x23 o 100x70).
    // Canvas dibujado igual: W=ancho, H=alto a 203dpi.
    // Layout: QR a la izquierda, texto a la derecha.
    // Chrome: Márgenes=Ninguno, Escala=100%
    // ============================================================
    imprimirEtiquetasGodex: (items, tamano = '50x23') => {

        const PX_MM = 203 / 25.4;  // 203 dpi → 7.99 px/mm

        // Driver en landscape: W es el lado largo, H el corto
        const W_MM = tamano === '100x70' ? 100 : 50;
        const H_MM = tamano === '100x70' ? 70  : 23;
        const W    = Math.round(W_MM * PX_MM);
        const H    = Math.round(H_MM * PX_MM);
        const pad  = Math.round(1.5 * PX_MM);

        const dibujarEtiqueta = (t) => {
            const canvas = document.createElement('canvas');
            canvas.width  = W;
            canvas.height = H;
            const ctx = canvas.getContext('2d');

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, W, H);

            // QR: cuadrado usando el 40% del ancho total, centrado verticalmente
            const qrSize   = Math.round(W * 0.38);
            const qrY      = Math.round((H - qrSize) / 2);
            const qrCanvas = document.createElement('canvas');
            new QRious({ element: qrCanvas, value: t.id.toString(), size: qrSize, level: 'M', background: 'white', foreground: 'black' });
            ctx.drawImage(qrCanvas, pad, qrY, qrSize, qrSize);

            // Texto a la derecha del QR
            const txtX    = pad + qrSize + pad;
            const txtMaxW = W - txtX - pad;
            let   curY    = pad;

            const escribir = (texto, fMM, bold, color) => {
                const fs = Math.round(fMM * PX_MM);
                if (curY + fs > H - pad) return;
                ctx.fillStyle = color || '#000000';
                ctx.font = `${bold ? '900' : '400'} ${fs}px Arial`;
                let txt = String(texto || '');
                while (ctx.measureText(txt).width > txtMaxW && txt.length > 1) txt = txt.slice(0, -1);
                if (txt.length < String(texto || '').length) txt = txt.slice(0, -1) + '…';
                ctx.fillText(txt, txtX, curY + fs);
                curY += fs + Math.round(0.8 * PX_MM);
            };

            if (tamano === '100x70') {
                escribir('TROQUEL ' + t.id_troquel,        6.0, true,  '#000000');
                escribir('UBI: '    + (t.ubicacion||'- '), 5.5, true,  '#000000');
                escribir(t.nombre,                          4.0, false, '#333333');
                if (t.codigos_articulo) escribir('Art: ' + t.codigos_articulo, 3.5, true, '#555555');
            } else {
                escribir('TROQUEL ' + t.id_troquel,        2.8, true,  '#000000');
                escribir('UBI: '    + (t.ubicacion||'-'), 2.6, true,  '#000000');
                escribir(t.nombre,                          2.2, false, '#333333');
                if (t.codigos_articulo) escribir('Art: ' + t.codigos_articulo, 2.0, true, '#555555');
            }

            return canvas.toDataURL('image/png');
        };

        const printWindow = window.open('', '_blank', 'width=750,height=600');
        if (!printWindow) { App.mostrarToast("El navegador bloqueó la ventana emergente.", "error"); return; }

        const dataUrls = items.map(t => dibujarEtiqueta(t));
        const imgsHtml = dataUrls.map(src => `<div class="et"><img src="${src}"></div>`).join('');

        const css = `
            * { margin:0; padding:0; box-sizing:border-box; }
            @page { size:${W_MM}mm ${H_MM}mm; margin:0; }
            body { background:#334155; font-family:Arial,sans-serif; }
            .wrap { display:flex; flex-direction:column; align-items:center; padding:16px; gap:12px; }
            .et img { display:block; width:${W_MM}mm; height:${H_MM}mm; }
            .btn { background:#14b8a6; color:#fff; padding:12px 26px; border:none; border-radius:8px; font-size:16px; font-weight:bold; cursor:pointer; }
            .nota { color:#e2e8f0; font-size:12px; text-align:center; background:#1e3a5f; padding:8px 16px; border-radius:6px; max-width:460px; line-height:1.6; }
            @media print {
                body { background:#fff; }
                .no-print { display:none !important; }
                .wrap { padding:0; gap:0; }
                .et { page-break-after:always; }
                .et img { display:block; width:${W_MM}mm; height:${H_MM}mm; }
            }
        `;

        const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
            <title>Godex ${tamano}</title><style>${css}</style></head>
            <body><div class="wrap">
                <button class="btn no-print" onclick="window.print()">🖨️ Imprimir Godex (${W_MM}×${H_MM}mm)</button>
                <p class="nota no-print">En Chrome: <b>Márgenes → Ninguno</b> · <b>Escala → 100%</b> · <b>Tamaño → ${W_MM}×${H_MM}mm</b></p>
                ${imgsHtml}
            </div></body></html>`;

        printWindow.document.write(html);
        printWindow.document.close();
        const modalQr = document.getElementById('modal-qr');
        if (modalQr) modalQr.classList.add('oculto');
        setTimeout(() => { printWindow.print(); }, 800);
    },


    imprimirEtiquetasA4: (items) => {
        const printWindow = window.open('', '_blank', 'width=800,height=900');
        if (!printWindow) { App.mostrarToast("El navegador bloqueó la ventana emergente.", "error"); return; }

        const etiquetasHtml = items.map(t => {
            const qrCanvas = document.createElement('canvas');
            new QRious({ element: qrCanvas, value: t.id.toString(), size: 120, level: 'M', background: 'white', foreground: 'black' });
            const qrSrc = qrCanvas.toDataURL('image/png');
            // Truncar descripción a ~55 chars para que no se corte feo
            const desc = t.nombre && t.nombre.length > 55 ? t.nombre.slice(0, 54) + '…' : (t.nombre || '');
            return `
            <div class="etiqueta">
                <img class="qr" src="${qrSrc}" alt="QR">
                <div class="info">
                    <div class="matricula">Nº ${t.id_troquel}</div>
                    <div class="ubi">${t.ubicacion || '-'}</div>
                    ${t.codigos_articulo ? `<div class="arts">${t.codigos_articulo}</div>` : ''}
                    <div class="desc">${desc}</div>
                </div>
            </div>`;
        }).join('');

        const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
        <title>Etiquetas A4</title>
        <style>
            * { margin:0; padding:0; box-sizing:border-box; }
            @page { size: A4 portrait; margin: 6mm; }
            body { font-family: Arial, sans-serif; background: #e2e8f0; }

            .toolbar { display:flex; gap:10px; align-items:center; padding:12px 16px; background:#1e293b; }
            .toolbar button { background:#7c3aed; color:#fff; border:none; padding:10px 22px; border-radius:6px; font-size:15px; font-weight:bold; cursor:pointer; }
            .toolbar span { color:#94a3b8; font-size:13px; }

            .pagina {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 3mm;
                background: white;
                margin: 10px auto;
                width: 198mm;
                padding: 0;
            }

            .etiqueta {
                display: flex;
                flex-direction: row;
                align-items: stretch;
                border: 0.8pt solid #94a3b8;
                height: 66mm;
                background: white;
                overflow: hidden;
            }

            /* QR: columna izquierda fija, pequeña pero legible */
            .qr {
                width: 38mm;
                height: 38mm;
                flex-shrink: 0;
                align-self: center;
                margin: 0 2mm 0 2mm;
            }

            /* Separador vertical */
            .sep {
                width: 0.5pt;
                background: #cbd5e1;
                margin: 3mm 0;
                flex-shrink: 0;
            }

            /* Bloque de texto: ocupa el resto */
            .info {
                flex: 1;
                padding: 3mm 3mm 3mm 3mm;
                display: flex;
                flex-direction: column;
                justify-content: center;
                gap: 2mm;
                overflow: hidden;
                min-width: 0;
            }

            /* Matrícula: lo más grande */
            .matricula {
                font-size: 18pt;
                font-weight: 900;
                color: #0f172a;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                line-height: 1;
            }

            /* Ubicación */
            .ubi {
                font-size: 12pt;
                font-weight: 700;
                color: #0369a1;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            /* Código artículo */
            .arts {
                font-size: 11pt;
                font-weight: 600;
                color: #374151;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            /* Descripción: más pequeña, con ellipsis */
            .desc {
                font-size: 8pt;
                color: #64748b;
                line-height: 1.3;
                overflow: hidden;
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
            }

            @media print {
                body { background: white; }
                .toolbar { display: none !important; }
                .pagina { margin: 0; width: 100%; }
            }
        </style>
        </head><body>
        <div class="toolbar">
            <button onclick="window.print()">🖨️ Imprimir A4 (8 por folio)</button>
            <span>${items.length} etiqueta${items.length !== 1 ? 's' : ''} · ${Math.ceil(items.length / 8)} folio${Math.ceil(items.length / 8) !== 1 ? 's' : ''} · Márgenes mínimos · A4 vertical</span>
        </div>
        <div class="pagina">${etiquetasHtml}</div>
        </body></html>`;

        printWindow.document.write(html);
        printWindow.document.close();
        const modalQr = document.getElementById('modal-qr');
        if (modalQr) modalQr.classList.add('oculto');
        setTimeout(() => { printWindow.print(); }, 800);
    },

        imprimirLoteQRs: (tamano = '50x23') => { 
        if(App.seleccionados.size === 0) return; 
        const itemsToPrint = Array.from(App.seleccionados).map(id => App.datos.find(t => t.id === id)).filter(t => t); 
        if(tamano === 'a4') App.imprimirEtiquetasA4(itemsToPrint);
        else App.imprimirEtiquetasGodex(itemsToPrint, tamano); 
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
        document.getElementById('btn-imprimir-qr-unico-50').onclick  = () => { App.imprimirEtiquetasGodex([t], '50x23'); };
        document.getElementById('btn-imprimir-qr-unico-100').onclick = () => { App.imprimirEtiquetasGodex([t], '100x70'); };
        const btnA4 = document.getElementById('btn-imprimir-qr-unico-a4');
        if(btnA4) btnA4.onclick = () => { App.imprimirEtiquetasA4([t]); };
    },


    // ─── FLUJO DESCATALOGADOS ───────────────────────────────────
    verDescatalogados: async () => {
        document.querySelectorAll('.vista').forEach(v => v.classList.add('oculto'));
        document.getElementById('vista-descatalogados').classList.remove('oculto');
        document.querySelectorAll('.menu-item').forEach(b => b.classList.remove('activo'));
        
        const tbody = document.getElementById('tabla-desc-body');
        const counter = document.getElementById('desc-contador');
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">Cargando... ⏳</td></tr>';
        
        try {
            const res = await fetch('/api/troqueles/descatalogados');
            const data = await res.json();
            if(counter) counter.innerText = data.length;
            
            if(data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding:40px; color:#64748b;">No hay troqueles descatalogados.</td></tr>';
                return;
            }
            tbody.innerHTML = data.map(t => {
                const fecha = t.fecha_descatalogado 
                    ? new Date(t.fecha_descatalogado).toLocaleDateString('es-ES') 
                    : '<span style="color:#94a3b8">Sin fecha</span>';
                return `<tr>
                    <td style="font-weight:900; color:#0f766e;">${t.id_troquel}</td>
                    <td style="color:#64748b; font-weight:bold;">${t.ubicacion || '-'}</td>
                    <td>${t.nombre}</td>
                    <td style="color:#0369a1; font-weight:bold;">${t.codigos_articulo || '-'}</td>
                    <td style="color:#b91c1c; font-weight:bold;">${fecha}</td>
                    <td style="white-space:nowrap;">
                        <button class="btn-icono" onclick="App.verHistorialTroquel(${t.id}, '${t.id_troquel}', '${(t.nombre||'').replace(/'/g,'')}')" title="Historial">🕒</button>
                        <button class="btn-accion" style="background:#16a34a; padding:4px 10px; font-size:12px;" onclick="App.reactivar(${t.id})">♻️ Reactivar</button>
                    </td>
                </tr>`;
            }).join('');
        } catch(e) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-red">Error al cargar.</td></tr>';
        }
    },

    reactivar: async (id) => {
        const nuevaUbi = prompt(
            '¿En qué ubicación de estantería se coloca este troquel?\n(Déjalo vacío para asignar después)',
            ''
        );
        if(nuevaUbi === null) return; // cancelado
        
        try {
            const res = await fetch(`/api/troqueles/${id}/reactivar`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ ubicacion: nuevaUbi.trim().toUpperCase() || null })
            });
            if(res.ok) {
                App.mostrarToast('Troquel reactivado y de vuelta al inventario activo.');
                await App.cargarTodo();
                App.verDescatalogados();
            } else {
                App.mostrarToast('Error al reactivar el troquel.', 'error');
            }
        } catch(e) {
            App.mostrarToast('Error de red.', 'error');
        }
    },
    // ────────────────────────────────────────────────────────────
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
    
    exportarCopiaSeguridad: async () => {
        App.mostrarToast("Generando copia de seguridad...");
        try {
            // Obtener TODOS los troqueles: activos, papelera y descatalogados
            const [resActivos, resPapelera, resDesc] = await Promise.all([
                fetch('/api/troqueles?ver_papelera=false'),
                fetch('/api/troqueles?ver_papelera=true'),
                fetch('/api/troqueles/descatalogados')
            ]);
            const activos      = await resActivos.json();
            const papelera     = await resPapelera.json();
            const descatalogados = await resDesc.json();

            // Unificar sin duplicados (por id)
            const mapaIds = {};
            [...activos, ...papelera, ...descatalogados].forEach(t => mapaIds[t.id] = t);
            const todos = Object.values(mapaIds);

            const ahora = new Date();
            const fecha = ahora.toISOString().split('T')[0];
            const hora  = ahora.toTimeString().slice(0,5).replace(':','-');

            const payload = {
                version: 2,
                fecha_backup: ahora.toISOString(),
                total: todos.length,
                resumen: {
                    activos: activos.length,
                    papelera: papelera.length,
                    descatalogados: descatalogados.length
                },
                troqueles: todos
            };

            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href     = url;
            a.download = `BACKUP_TROQUELES_${fecha}_${hora}.json`;
            a.click();
            URL.revokeObjectURL(url);
            App.mostrarToast(`Copia descargada: ${todos.length} troqueles (${activos.length} activos, ${descatalogados.length} desc., ${papelera.length} papelera).`);
        } catch(e) {
            App.mostrarToast("Error al generar la copia de seguridad.", "error");
            console.error(e);
        }
    },

    restaurarCopiaSeguridad: async (input) => {
        const file = input.files[0]; if(!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const parsed = JSON.parse(e.target.result);

                // Soportar formato v2 (objeto con .troqueles) y v1 (array directo)
                const backupData = Array.isArray(parsed) ? parsed : (parsed.troqueles || []);
                const esFecha    = parsed.fecha_backup ? new Date(parsed.fecha_backup).toLocaleString('es-ES') : 'desconocida';
                const resumen    = parsed.resumen || {};

                const msg = parsed.version === 2
                    ? `Backup del ${esFecha}\n\nContenido:\n• ${resumen.activos || '?'} activos\n• ${resumen.descatalogados || '?'} descatalogados\n• ${resumen.papelera || '?'} en papelera\n• Total: ${backupData.length} troqueles\n\n⚠️ Esto REEMPLAZARÁ la base de datos actual.\n¿Continuar?`
                    : `Backup con ${backupData.length} troqueles (formato antiguo).\n\n⚠️ Esto REEMPLAZARÁ la base de datos actual.\n¿Continuar?`;

                if(!confirm(msg)) return;
                App.mostrarToast("Restaurando copia de seguridad...");
                const res = await fetch('/api/troqueles/backup/restaurar', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(backupData)
                });
                if(res.ok) {
                    App.mostrarToast("Base de datos restaurada correctamente.");
                    await App.cargarTodo();
                } else {
                    App.mostrarToast("Error en el servidor al restaurar.", "error");
                }
            } catch (err) {
                App.mostrarToast("Formato JSON inválido.", "error");
                console.error(err);
            }
        };
        reader.readAsText(file);
    }
};

window.onload = App.init;