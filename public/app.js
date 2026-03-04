// =============================================================
// CEREBRO DE LA APLICACIÓN (ERP V11)
// =============================================================

const App = {
    // ESTADO DE LA APLICACIÓN
    datos: [],                // Aquí guardamos todos los troqueles descargados
    seleccionados: new Set(), // IDs de los troqueles seleccionados (checkbox)
    filtroTipo: 'TODOS',      // Filtro actual de tipo
    mapaCat: {},              // Diccionario ID -> Nombre Categoría
    mapaFam: {},              // Diccionario ID -> Nombre Familia
    columnaOrden: 'id_troquel', 
    ordenAsc: true,
    scanner: null,            // Objeto del lector QR
    modoMovil: false,
    archivosActuales: [],     // Lista temporal de archivos al editar/crear
    escaneadosLote: new Map(),// Mapa temporal para el escáner masivo
    enPapelera: false,        // ¿Estamos viendo la papelera?

    // 1. INICIALIZACIÓN
    init: async () => {
        console.log("Iniciando ERP V11...");
        // Cargamos primero los datos y luego los selectores
        await App.cargarTodo();
        await App.cargarSelects();
    },

    // 2. CARGA DE DATOS DESDE EL BACKEND
    cargarTodo: async (verPapelera = false) => {
        try {
            App.enPapelera = verPapelera;
            
            // Llamamos a la API. Si verPapelera es true, trae los borrados.
            const res = await fetch(`/api/troqueles?ver_papelera=${verPapelera}`);
            
            if (res.ok) {
                App.datos = await res.json();
                App.renderTabla(); // Pintamos la tabla
                
                // Actualizamos la interfaz según si estamos en papelera o no
                document.getElementById('titulo-lista').innerText = verPapelera ? "🗑️ PAPELERA DE RECICLAJE" : "Inventario Activo";
                const btnRes = document.getElementById('btn-restaurar-papelera');
                const panel = document.getElementById('panel-acciones');
                
                if (verPapelera) {
                    btnRes.classList.remove('oculto');
                    panel.classList.add('oculto'); // Ocultar acciones masivas en papelera
                } else {
                    btnRes.classList.add('oculto');
                }
            } else {
                console.error("Error al cargar datos del servidor");
            }
        } catch (e) { 
            console.error("Error de conexión:", e); 
        }
    },

    // 3. CARGAR LISTAS DESPLEGABLES (FAMILIAS Y TIPOS)
    cargarSelects: async () => {
        try {
            // Carga paralela de categorías y familias
            const [cats, fams] = await Promise.all([
                fetch('/api/categorias').then(r => r.json()), 
                fetch('/api/familias').then(r => r.json())
            ]);
            
            // Guardamos en mapas para acceso rápido por ID
            App.mapaCat = {};
            App.mapaFam = {};
            cats.forEach(c => App.mapaCat[c.id] = c.nombre);
            fams.forEach(f => App.mapaFam[f.id] = f.nombre);

            // A) Rellenar los "Chips" de filtro superior
            const divChips = document.getElementById('chips-tipos');
            divChips.innerHTML = `<button class="chip activo" onclick="App.setFiltroTipo('TODOS', this)">TODOS</button>`;
            cats.forEach(c => {
                divChips.innerHTML += `<button class="chip" onclick="App.setFiltroTipo('${c.nombre}', this)">${c.nombre}</button>`;
            });

            // B) Función auxiliar para llenar cualquier <select>
            const rellenarSelect = (idSelect, datos, textoPorDefecto) => {
                const el = document.getElementById(idSelect);
                if (!el) return;
                
                // Guardamos el valor actual por si estamos recargando y no queremos perder la selección
                const valorPrevio = el.value;
                
                el.innerHTML = `<option value="">${textoPorDefecto}</option>`;
                datos.forEach(d => {
                    el.innerHTML += `<option value="${d.id}">${d.nombre}</option>`;
                });

                // Si el valor previo sigue existiendo, lo volvemos a poner
                if (valorPrevio) el.value = valorPrevio;
            };

            // Rellenar todos los selects de la interfaz
            rellenarSelect('f-cat', cats, 'Selecciona Tipo...');
            rellenarSelect('bulk-tipo', cats, 'Asignar Tipo...');
            
            rellenarSelect('f-fam', fams, 'Sin Familia');
            rellenarSelect('bulk-familia', fams, 'Asignar Familia...');
            rellenarSelect('filtro-familia', fams, 'Todas las Familias');

        } catch (e) { console.error("Error cargando selects:", e); }
    },

    // 4. CREACIÓN DE FAMILIAS Y TIPOS (GESTIÓN AUXILIAR)
    crearFamilia: async () => {
        const nombre = prompt("Escribe el nombre de la nueva Familia:");
        if (!nombre) return; // Cancelado

        const res = await fetch('/api/familias', { 
            method: 'POST', 
            headers: {'Content-Type':'application/json'}, 
            body: JSON.stringify({ nombre: nombre }) 
        });

        if (res.ok) {
            // La API devuelve un array con el objeto creado: [{id: 5, nombre: "NUEVA"}]
            const data = await res.json();
            // Recargamos los selects para que aparezca
            await App.cargarSelects();
            
            // TRUCO: Si estamos en el formulario, seleccionamos la nueva familia automáticamente
            const nuevoId = data.data ? data.data[0].id : null;
            if (nuevoId) {
                document.getElementById('f-fam').value = nuevoId;
            }
            alert("Familia creada correctamente.");
        } else {
            alert("Error al crear familia.");
        }
    },

    crearTipo: async () => {
        const nombre = prompt("Escribe el nombre del nuevo Tipo:");
        if (!nombre) return;

        const res = await fetch('/api/categorias', { 
            method: 'POST', 
            headers: {'Content-Type':'application/json'}, 
            body: JSON.stringify({ nombre: nombre }) 
        });

        if (res.ok) {
            const data = await res.json();
            await App.cargarSelects();
            const nuevoId = data.data ? data.data[0].id : null;
            if (nuevoId) {
                document.getElementById('f-cat').value = nuevoId;
                // Al cambiar el tipo, intentamos calcular la matrícula
                App.calcularSiguienteId(); 
            }
            alert("Tipo creado correctamente.");
        }
    },

    abrirGestionAux: () => document.getElementById('modal-aux').classList.remove('oculto'),

    // 5. GESTIÓN DE ARCHIVOS MÚLTIPLES (FOTOS / PDF)
    subirArchivos: async (input) => {
        if (!input.files.length) return;
        
        const btn = input.parentElement;
        const textoOriginal = btn.innerText;
        btn.innerText = "⏳ Subiendo...";

        // Recorremos todos los archivos seleccionados
        for (let i = 0; i < input.files.length; i++) {
            const file = input.files[i];
            const fd = new FormData(); 
            fd.append('file', file);
            
            try {
                const res = await fetch('/api/subir_foto', { method: 'POST', body: fd });
                if (res.ok) {
                    const data = await res.json();
                    // Añadimos el resultado a nuestra lista en memoria
                    App.archivosActuales.push({
                        url: data.url,
                        nombre: file.name,
                        tipo: data.tipo // 'img' o 'pdf'
                    });
                }
            } catch (e) { alert("Error al subir " + file.name); }
        }
        
        // Refrescamos la vista de archivos y limpiamos el input
        App.renderListaArchivos();
        btn.innerText = textoOriginal;
        input.value = ""; 
    },

    renderListaArchivos: () => {
        const div = document.getElementById('lista-archivos');
        div.innerHTML = "";
        
        if (App.archivosActuales.length === 0) {
            div.innerHTML = "<span style='color:#94a3b8; font-size:12px; font-style:italic;'>No hay archivos adjuntos.</span>";
            return;
        }

        App.archivosActuales.forEach((arch, idx) => {
            // Icono diferente si es PDF o Imagen
            let contenidoVisual = '';
            if (arch.tipo === 'pdf') {
                contenidoVisual = '<span style="font-size:20px;">📄</span>';
            } else {
                contenidoVisual = `<img src="${arch.url}" style="height:40px; border-radius:3px;">`;
            }

            div.innerHTML += `
                <div style="display:flex; align-items:center; gap:8px; background:white; padding:5px 8px; border:1px solid #cbd5e1; border-radius:4px; font-size:11px;">
                    <a href="${arch.url}" target="_blank" style="text-decoration:none; display:flex; align-items:center;">
                        ${contenidoVisual}
                    </a>
                    <div style="display:flex; flex-direction:column;">
                        <span style="font-weight:bold; max-width:100px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                            ${arch.nombre}
                        </span>
                        <a href="${arch.url}" target="_blank" style="color:#0f766e; text-decoration:none;">Ver</a>
                    </div>
                    <span onclick="App.quitarArchivo(${idx})" style="color:#ef4444; font-weight:900; cursor:pointer; padding:5px; margin-left:5px;">✕</span>
                </div>
            `;
        });
    },

    quitarArchivo: (idx) => {
        if (confirm("¿Eliminar este archivo de la ficha?")) {
            App.archivosActuales.splice(idx, 1);
            App.renderListaArchivos();
        }
    },

    // 6. RENDERIZADO DE TABLA (SIN CLIC EN TR)
    renderTabla: () => {
        const tbody = document.getElementById('tabla-body');
        const textoBusqueda = document.getElementById('buscador').value.toLowerCase();
        const familiaFiltro = document.getElementById('filtro-familia').value;
        const estadoFiltro = document.getElementById('filtro-estado').value;

        // A) Filtrar datos
        let filtrados = App.datos.filter(t => {
            const nombreCat = App.mapaCat[t.categoria_id] || '';
            const nombreFam = App.mapaFam[t.familia_id] || '';
            
            const cumpleTipo = App.filtroTipo === 'TODOS' || nombreCat === App.filtroTipo;
            const cumpleFam = familiaFiltro === 'TODAS' || nombreFam === familiaFiltro;
            const cumpleEstado = estadoFiltro === 'TODOS' || (t.estado || 'EN ALMACEN') === estadoFiltro;
            
            // Búsqueda en varios campos
            const cumpleTexto = (
                (t.nombre || "").toLowerCase().includes(textoBusqueda) || 
                (t.id_troquel || "").toLowerCase().includes(textoBusqueda) ||
                (t.ubicacion || "").toLowerCase().includes(textoBusqueda)
            );
            
            return cumpleTipo && cumpleFam && cumpleEstado && cumpleTexto;
        });

        // B) Ordenar datos
        filtrados.sort((a, b) => {
            let valorA = (a[App.columnaOrden] || "").toString();
            let valorB = (b[App.columnaOrden] || "").toString();
            
            // Si ordenamos por nombres resueltos (no por ID)
            if (App.columnaOrden === 'categoria') { 
                valorA = App.mapaCat[a.categoria_id] || ""; 
                valorB = App.mapaCat[b.categoria_id] || ""; 
            }
            if (App.columnaOrden === 'familia') { 
                valorA = App.mapaFam[a.familia_id] || ""; 
                valorB = App.mapaFam[b.familia_id] || ""; 
            }

            // Detección numérica inteligente
            const numA = parseFloat(valorA); 
            const numB = parseFloat(valorB);
            
            // Si ambos son números válidos y no contienen letras, orden numérico
            if (!isNaN(numA) && !isNaN(numB) && !valorA.match(/[a-z]/i)) {
                return App.ordenAsc ? numA - numB : numB - numA;
            }
            // Si no, orden alfabético
            return App.ordenAsc ? valorA.localeCompare(valorB) : valorB.localeCompare(valorA);
        });

        // C) Pintar HTML
        if (filtrados.length === 0) { 
            tbody.innerHTML = '<tr><td colspan="8" style="padding:40px; text-align:center; color:#94a3b8;">No se encontraron troqueles.</td></tr>'; 
            return; 
        }

        tbody.innerHTML = filtrados.map(t => {
            const isChecked = App.seleccionados.has(t.id) ? 'checked' : '';
            
            // Badge Documentos
            const numDocs = (t.archivos && Array.isArray(t.archivos)) ? t.archivos.length : 0;
            const badgeDocs = numDocs > 0 
                ? `<span class="obs-pildora" style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd;">📎 ${numDocs}</span>` 
                : '';
            
            // Badge Estado con Colores
            let badgeEstado = `<span style="background:#dcfce7; color:#166534; padding:3px 8px; border-radius:12px; font-size:10px; font-weight:800; border:1px solid #bbf7d0;">ALMACÉN</span>`;
            if (t.estado === 'EN PRODUCCION') badgeEstado = `<span style="background:#fee2e2; color:#991b1b; padding:3px 8px; border-radius:12px; font-size:10px; font-weight:800; border:1px solid #fecaca;">PRODUCCIÓN</span>`;
            if (t.estado === 'DESCATALOGADO') badgeEstado = `<span style="background:#f3f4f6; color:#6b7280; padding:3px 8px; border-radius:12px; font-size:10px; font-weight:800; border:1px solid #e5e7eb;">BAJA</span>`;

            // Botones de acción (Diferentes si es papelera)
            let botonesAccion = `
                <div style="display:flex; justify-content:center;">
                    <button class="btn-icono" onclick="App.editar(${t.id})" title="Editar Ficha">✏️</button>
                    <button class="btn-icono" onclick="App.generarQR('${t.id_troquel}', '${t.ubicacion}', '${t.nombre.replace(/'/g,"")}')" title="Imprimir QR">🖨️</button>
                    <button class="btn-icono" onclick="App.descatalogar(${t.id})" title="Dar de Baja" style="color:orange;">🚫</button>
                    <button class="btn-icono" onclick="App.borrar(${t.id})" title="Mover a Papelera" style="color:#ef4444;">🗑️</button>
                </div>
            `;
            
            if (App.enPapelera) {
                botonesAccion = `<button class="btn-accion" style="background:#22c55e; padding:5px 10px; font-size:11px;" onclick="App.restaurar(${t.id})">♻️ Restaurar</button>`;
            }

            // Estilo visual si está de baja
            const estiloFila = t.estado === 'DESCATALOGADO' ? 'opacity:0.6; background:#f9fafb;' : '';

            // NOTA: Hemos quitado el onclick del <tr> para evitar aperturas accidentales
            return `
            <tr style="${estiloFila}">
                <td style="text-align:center;">
                    <input type="checkbox" value="${t.id}" ${isChecked} onchange="App.select(this, ${t.id})">
                </td>
                <td style="text-align:center;">${badgeDocs}</td>
                <td style="text-align:center;">${badgeEstado}</td>
                <td style="font-weight:900; color:#0f766e; font-family:monospace; font-size:14px;">${t.id_troquel}</td>
                <td style="font-weight:700;">${t.ubicacion}</td>
                <td>${t.nombre}</td>
                <td><small style="color:#64748b;">${App.mapaFam[t.familia_id] || '-'}</small></td>
                <td>${botonesAccion}</td>
            </tr>`;
        }).join('');
    },

    // 7. FUNCIONES CRUD (CREAR, LEER, ACTUALIZAR, BORRAR)
    nav: (vista) => { 
        document.querySelectorAll('.vista').forEach(x => x.classList.add('oculto')); 
        document.getElementById(vista).classList.remove('oculto'); 
        
        // Si vamos a la lista, aseguramos que el sidebar se vea (por si venimos del móvil)
        if (vista === 'vista-lista') document.getElementById('sidebar').classList.remove('oculto');
    },
    
    volverDesdeForm: () => {
        if (App.modoMovil) App.activarModoMovil();
        else App.nav('vista-lista');
    },

    nuevoTroquel: () => { 
        document.getElementById('titulo-form').innerText = "Nuevo Troquel"; 
        document.querySelector('form').reset(); 
        document.getElementById('f-id-db').value = ""; 
        App.archivosActuales = []; 
        App.renderListaArchivos();
        
        if (App.modoMovil) document.getElementById('sidebar').classList.add('oculto');
        App.nav('vista-formulario'); 
    },

    editar: (id) => {
        const t = App.datos.find(x => x.id === id);
        if (!t) return;
        
        document.getElementById('titulo-form').innerText = "Editar Ficha";
        document.getElementById('f-id-db').value = t.id;
        document.getElementById('f-matricula').value = t.id_troquel;
        document.getElementById('f-ubicacion').value = t.ubicacion;
        document.getElementById('f-nombre').value = t.nombre;
        
        // Selectores (con protección contra nulos)
        document.getElementById('f-cat').value = t.categoria_id || "";
        document.getElementById('f-fam').value = t.familia_id || "";
        
        document.getElementById('f-medidas-madera').value = t.tamano_troquel || "";
        document.getElementById('f-medidas-corte').value = t.tamano_final || "";
        document.getElementById('f-arts').value = t.codigos_articulo || "";
        document.getElementById('f-ot').value = t.referencias_ot || "";
        document.getElementById('f-obs').value = t.observaciones || "";
        
        // Cargar archivos existentes (si es null, array vacío)
        App.archivosActuales = (t.archivos && Array.isArray(t.archivos)) ? t.archivos : [];
        App.renderListaArchivos();
        
        if (App.modoMovil) document.getElementById('sidebar').classList.add('oculto');
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
            archivos: App.archivosActuales // Enviamos la lista completa de archivos
        };

        const method = id ? 'PUT' : 'POST';
        const url = id ? `/api/troqueles/${id}` : '/api/troqueles';
        
        await fetch(url, { method: method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
        
        App.cargarTodo();
        App.volverDesdeForm();
    },

    calcularSiguienteId: async () => {
        const idDb = document.getElementById('f-id-db').value;
        if (idDb) return; // Si estamos editando, no cambiamos la matrícula
        
        const catId = document.getElementById('f-cat').value;
        if (!catId) return;
        
        try {
            const res = await fetch(`/api/siguiente_numero?categoria_id=${catId}`);
            const data = await res.json();
            document.getElementById('f-matricula').value = data.siguiente;
            document.getElementById('f-ubicacion').value = data.siguiente;
        } catch (e) {}
    },

    // 8. ACCIONES ESPECIALES (BORRAR, DESCATALOGAR, RESTAURAR)
    descatalogar: async (id) => {
        if (!confirm("¿Marcar como DESCATALOGADO? (No se borra, queda histórico)")) return;
        
        const t = App.datos.find(x => x.id === id);
        // Creamos una copia del objeto y cambiamos el estado
        const copia = { ...t, estado: "DESCATALOGADO" };
        
        await fetch(`/api/troqueles/${id}`, { 
            method: 'PUT', 
            headers: {'Content-Type':'application/json'}, 
            body: JSON.stringify(copia) 
        });
        App.cargarTodo();
    },

    borrar: async (id) => {
        if (!confirm("¿Mover a PAPELERA DE RECICLAJE?")) return;
        await fetch(`/api/troqueles/${id}`, { method: 'DELETE' });
        App.cargarTodo();
    },

    restaurar: async (id) => {
        await fetch(`/api/troqueles/${id}/restaurar`, { method: 'POST' });
        App.cargarTodo(true); // Recargamos la vista de papelera
    },

    // 9. LÓGICA DE SELECCIÓN Y ACCIONES MASIVAS
    select: (chk, id) => {
        if (chk.checked) App.seleccionados.add(id);
        else App.seleccionados.delete(id);
        App.updatePanel();
    },

    toggleAll: (chk) => {
        const checkboxes = document.querySelectorAll('#tabla-body input[type="checkbox"]');
        checkboxes.forEach(c => {
            c.checked = chk.checked;
            if (chk.checked) App.seleccionados.add(parseInt(c.value));
            else App.seleccionados.delete(parseInt(c.value));
        });
        App.updatePanel();
    },

    updatePanel: () => {
        const p = document.getElementById('panel-acciones');
        if (App.seleccionados.size > 0) {
            p.classList.remove('oculto');
            document.getElementById('contador-sel').innerText = App.seleccionados.size;
        } else {
            p.classList.add('oculto');
        }
    },

    limpiarSeleccion: () => {
        App.seleccionados.clear();
        document.getElementById('check-all').checked = false;
        App.updatePanel();
        App.renderTabla(); // Repintar para quitar checks visuales
    },

    moverLote: async (acc) => {
        await fetch('/api/movimientos/lote', { 
            method: 'POST', 
            headers: {'Content-Type':'application/json'}, 
            body: JSON.stringify({ ids: Array.from(App.seleccionados), accion: acc }) 
        });
        App.limpiarSeleccion();
        App.cargarTodo();
    },

    asignarMasivo: async (campo) => {
        let selectId = campo === 'familia' ? 'bulk-familia' : 'bulk-tipo';
        let val = document.getElementById(selectId).value;
        
        if (!val || App.seleccionados.size === 0) return alert("Selecciona valor y troqueles");
        if (!confirm(`¿Aplicar cambio a ${App.seleccionados.size} troqueles?`)) return;

        await fetch(`/api/troqueles/bulk/${campo}`, { 
            method: 'PUT', 
            headers: {'Content-Type':'application/json'}, 
            body: JSON.stringify({ ids: Array.from(App.seleccionados), valor_id: parseInt(val) }) 
        });
        App.limpiarSeleccion();
        App.cargarTodo(App.enPapelera);
    },

    // 10. MODO MÓVIL Y ESCÁNER INTELIGENTE
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
        if (txt.length < 2) return;
        
        const hits = App.datos.filter(t => (t.nombre+t.id_troquel+t.ubicacion).toLowerCase().includes(txt.toLowerCase()));
        
        div.innerHTML = hits.slice(0, 10).map(t => `
            <div class="card-movil" onclick="App.editar(${t.id})">
                <div style="display:flex; justify-content:space-between;">
                    <span style="font-weight:900; color:#0f766e; font-size:18px;">${t.id_troquel}</span>
                    <span style="font-weight:bold;">${t.ubicacion}</span>
                </div>
                <div style="margin-top:5px;">${t.nombre}</div>
                <button class="btn-secundario" style="width:100%; margin-top:10px;">Ver Ficha</button>
            </div>
        `).join('');
    },

    toggleScanner: (show = true) => {
        const el = document.getElementById('modal-scanner');
        if (show) {
            el.classList.remove('oculto');
            App.escaneadosLote.clear();
            App.renderListaEscaneados();
            
            App.scanner = new Html5Qrcode("reader");
            
            let lastCode = null;
            let lastTime = 0;

            App.scanner.start({facingMode:"environment"}, {fps:10, qrbox:250}, (txt) => {
                // EVITAR REBOTES: No leer el mismo código en 3 segundos
                const now = Date.now();
                if (txt === lastCode && (now - lastTime < 3000)) return;

                const t = App.datos.find(x => x.id_troquel === txt);
                if (t) {
                    if (!App.escaneadosLote.has(t.id)) {
                        App.escaneadosLote.set(t.id, t);
                        App.renderListaEscaneados();
                        // Feedback táctil
                        if (navigator.vibrate) navigator.vibrate(100);
                    }
                    lastCode = txt;
                    lastTime = now;
                }
            });
        } else {
            el.classList.add('oculto');
            if (App.scanner) App.scanner.stop();
        }
    },

    renderListaEscaneados: () => {
        const div = document.getElementById('lista-escaneados');
        div.innerHTML = "";
        document.getElementById('count-scans').innerText = App.escaneadosLote.size;
        
        App.escaneadosLote.forEach((t, id) => {
            div.innerHTML += `
                <div class="chip activo" style="background:white; color:black; display:flex; align-items:center; gap:8px; border:1px solid #999;">
                    <b>${t.id_troquel}</b>
                    <span>${t.nombre.substring(0,10)}...</span>
                    <span onclick="App.borrarDeLote(${id})" style="color:red; font-weight:bold; cursor:pointer; font-size:14px;">✕</span>
                </div>
            `;
        });
    },

    borrarDeLote: (id) => {
        App.escaneadosLote.delete(id);
        App.renderListaEscaneados();
    },

    procesarEscaneo: async (acc) => {
        if (App.escaneadosLote.size === 0) return;
        // Convertimos el mapa de escaneo a la selección principal
        App.seleccionados = new Set(App.escaneadosLote.keys());
        await App.moverLote(acc);
        App.toggleScanner(false);
    },

    // 11. UTILIDADES VARIAS (Filtros, QR, Historial)
    setFiltroTipo: (tipo, btn) => {
        App.filtroTipo = tipo;
        document.querySelectorAll('.chip').forEach(c => c.classList.remove('activo'));
        btn.classList.add('activo');
        App.renderTabla();
    },
    filtrar: () => {
        const btn = document.getElementById('btn-limpiar');
        const txt = document.getElementById('buscador').value;
        btn.classList.toggle('oculto', txt === '');
        App.renderTabla();
    },
    limpiarBuscador: () => { document.getElementById('buscador').value = ''; App.filtrar(); },
    
    ordenar: (col) => {
        if (App.columnaOrden === col) App.ordenAsc = !App.ordenAsc;
        else { App.columnaOrden = col; App.ordenAsc = true; }
        App.renderTabla();
    },

    generarQR: (id, ubi, nom) => {
        document.getElementById('modal-qr').classList.remove('oculto');
        document.getElementById('qr-texto-ubi').innerText = ubi || "SIN UBI";
        document.getElementById('qr-texto-id').innerText = id;
        document.getElementById('qr-texto-desc').innerText = nom;
        new QRious({ element: document.getElementById('qr-canvas'), value: id, size: 200, padding: 0, level: 'M' });
    },

    cargarHistorial: async () => {
        const res = await fetch('/api/historial');
        const data = await res.json();
        document.getElementById('tabla-historial').innerHTML = data.map(h => `
            <tr>
                <td style="font-size:12px; color:#666;">${new Date(h.fecha_hora).toLocaleString()}</td>
                <td><b>${h.troqueles?.nombre || '???'}</b></td>
                <td><span class="obs-pildora">${h.accion}</span></td>
                <td style="font-size:12px;">${h.ubicacion_anterior || '-'} ➝ ${h.ubicacion_nueva || '-'}</td>
            </tr>
        `).join('');
    },

    exportarCSV: () => {
        let csv = "Matricula,Ubicacion,Nombre,Tipo,Familia,Estado\n";
        App.datos.forEach(t => {
            csv += `${t.id_troquel},${t.ubicacion},${t.nombre},${App.mapaCat[t.categoria_id]},${App.mapaFam[t.familia_id]},${t.estado}\n`;
        });
        const a = document.createElement('a');
        a.href = 'data:text/csv;charset=utf-8,' + encodeURI(csv);
        a.download = 'inventario.csv';
        a.click();
    }
};

// Iniciar aplicación al cargar
window.onload = App.init;