// =============================================================
// ERP PACKAGING - LÓGICA PRINCIPAL (V15)
// =============================================================

const App = {
    // --- ESTADO DE LA APLICACIÓN ---
    datos: [],                // Base de datos de troqueles
    seleccionados: new Set(), // IDs seleccionados con checkbox
    filtroTipo: 'TODOS',      // Filtro de pestañas superiores
    mapaCat: {},              // Diccionario: ID -> Nombre Categoría
    mapaFam: {},              // Diccionario: ID -> Nombre Familia
    columnaOrden: 'id_troquel', 
    ordenAsc: true,
    scanner: null,            // Objeto del lector de cámara
    modoMovil: false,         // ¿Estamos en modo operario?
    archivosActuales: [],     // Lista temporal de archivos al editar
    escaneadosLote: new Map(),// Lista temporal del escáner masivo
    enPapelera: false,        // ¿Estamos viendo borrados?

    // =========================================================
    // 1. INICIALIZACIÓN
    // =========================================================
    init: async () => {
        console.log("Iniciando Sistema V15...");
        // Paso 1: Cargar los nombres de familias y tipos
        await App.cargarSelects();
        // Paso 2: Cargar los datos de los troqueles
        await App.cargarTodo();
    },

    // =========================================================
    // 2. CARGA DE DATOS (BACKEND)
    // =========================================================
    cargarTodo: async (papelera = false) => {
        try {
            App.enPapelera = papelera;
            // Pide los datos al servidor
            const res = await fetch(`/api/troqueles?ver_papelera=${papelera}`);
            
            if (res.ok) {
                App.datos = await res.json();
                App.renderTabla(); // Dibuja la tabla en pantalla
                
                // Ajusta títulos y botones según si estamos en papelera
                document.getElementById('titulo-lista').innerText = papelera ? "🗑️ PAPELERA DE RECICLAJE" : "Inventario Activo";
                
                const btnRestaurar = document.getElementById('btn-restaurar-papelera');
                const panelAcciones = document.getElementById('panel-acciones');
                
                if (papelera) {
                    btnRestaurar.classList.remove('oculto');
                    panelAcciones.classList.add('oculto');
                } else {
                    btnRestaurar.classList.add('oculto');
                }
            } else {
                console.error("Error del servidor al cargar datos");
            }
        } catch (e) {
            console.error("Error de conexión:", e);
            alert("Error de conexión con el servidor.");
        }
    },

    cargarSelects: async () => {
        try {
            // Carga paralela de categorías y familias
            const [cats, fams] = await Promise.all([
                fetch('/api/categorias').then(r => r.json()), 
                fetch('/api/familias').then(r => r.json())
            ]);
            
            // Crear diccionarios para traducción rápida (ID -> Nombre)
            App.mapaCat = {};
            App.mapaFam = {};
            cats.forEach(c => App.mapaCat[c.id] = c.nombre);
            fams.forEach(f => App.mapaFam[f.id] = f.nombre);

            // 1. Dibujar los botones superiores (Chips)
            const divChips = document.getElementById('chips-tipos');
            divChips.innerHTML = `<button class="chip activo" onclick="App.setFiltroTipo('TODOS', this)">TODOS</button>`;
            cats.forEach(c => {
                divChips.innerHTML += `<button class="chip" onclick="App.setFiltroTipo('${c.nombre}', this)">${c.nombre}</button>`;
            });

            // 2. Rellenar todos los desplegables del HTML
            const llenarSelect = (idSelect, datos, opcionPorDefecto) => {
                const elemento = document.getElementById(idSelect);
                if (elemento) {
                    const valorPrevio = elemento.value;
                    // Caso especial para el filtro principal
                    if (idSelect === 'filtro-familia') {
                        elemento.innerHTML = '<option value="TODAS">Todas las Familias</option>';
                    } else {
                        elemento.innerHTML = `<option value="">${opcionPorDefecto}</option>`;
                    }
                    
                    datos.forEach(d => {
                        elemento.innerHTML += `<option value="${d.id}">${d.nombre}</option>`;
                    });
                    
                    if (valorPrevio) elemento.value = valorPrevio;
                }
            };

            llenarSelect('f-cat', cats, 'Selecciona Tipo...');
            llenarSelect('bulk-tipo', cats, 'Asignar Tipo...');
            llenarSelect('f-fam', fams, 'Sin Familia');
            llenarSelect('bulk-familia', fams, 'Asignar Familia...');
            llenarSelect('filtro-familia', fams, ''); 

        } catch (e) {
            console.error("Error cargando listas auxiliares:", e);
        }
    },

    // =========================================================
    // 3. VISTA DE LECTURA (MODAL SEGURO) - NUEVO V15
    // =========================================================
    verFicha: (id) => {
        const t = App.datos.find(x => x.id === id);
        if (!t) return;

        // Rellenar datos de texto
        document.getElementById('ver-matricula').innerText = t.id_troquel || "-";
        document.getElementById('ver-ubicacion').innerText = t.ubicacion || "-";
        document.getElementById('ver-nombre').innerText = t.nombre || "Sin descripción";
        
        // Traducir IDs a nombres
        document.getElementById('ver-tipo').innerHTML = App.mapaCat[t.categoria_id] || '<span style="color:#cbd5e1;">-</span>';
        document.getElementById('ver-familia').innerHTML = App.mapaFam[t.familia_id] || '<span style="color:#cbd5e1;">-</span>';
        
        document.getElementById('ver-arts').innerText = t.codigos_articulo || "-";
        document.getElementById('ver-obs').innerText = t.observaciones || "Sin observaciones";
        
        // Guardar ID oculto por si decidimos editar
        document.getElementById('ver-id-oculto').value = t.id;

        // --- GALERÍA DE ARCHIVOS ---
        const galeria = document.getElementById('ver-galeria');
        galeria.innerHTML = "";
        
        if (t.archivos && Array.isArray(t.archivos) && t.archivos.length > 0) {
            t.archivos.forEach(arch => {
                const isPdf = arch.tipo === 'pdf';
                // Si es PDF mostramos icono, si es imagen mostramos la foto
                const preview = isPdf ? '<span style="font-size:30px">📄</span>' : `<img src="${arch.url}">`;
                
                galeria.innerHTML += `
                    <a href="${arch.url}" target="_blank" class="thumb-archivo" title="${arch.nombre}">
                        ${preview}
                        <span>${arch.nombre}</span>
                    </a>
                `;
            });
        } else {
            galeria.innerHTML = '<span style="font-size:12px; color:#94a3b8; font-style:italic;">No hay archivos adjuntos.</span>';
        }

        // Mostrar el modal
        document.getElementById('modal-ficha').classList.remove('oculto');
    },

    editarDesdeFicha: () => {
        // Botón "Editar" dentro de la ficha de lectura
        const id = parseInt(document.getElementById('ver-id-oculto').value);
        document.getElementById('modal-ficha').classList.add('oculto');
        App.editar(id);
    },

    // =========================================================
    // 4. RENDERIZADO DE TABLA (LISTADO)
    // =========================================================
    renderTabla: () => {
        const tbody = document.getElementById('tabla-body');
        if (!tbody) return;

        // Leer filtros actuales
        const textoBusqueda = document.getElementById('buscador').value.toLowerCase();
        const familiaFiltro = document.getElementById('filtro-familia').value;
        const estadoFiltro = document.getElementById('filtro-estado').value;

        // 1. FILTRAR
        let filtrados = App.datos.filter(t => {
            const nombreCat = App.mapaCat[t.categoria_id] || '';
            
            const cumpleTipo = App.filtroTipo === 'TODOS' || nombreCat === App.filtroTipo;
            const cumpleFam = familiaFiltro === 'TODAS' || t.familia_id == familiaFiltro; // Laxa por si uno es string
            const cumpleEstado = estadoFiltro === 'TODOS' || (t.estado || 'EN ALMACEN') === estadoFiltro;
            
            const cumpleTexto = (
                (t.nombre || "").toLowerCase().includes(textoBusqueda) || 
                (t.id_troquel || "").toLowerCase().includes(textoBusqueda) ||
                (t.ubicacion || "").toLowerCase().includes(textoBusqueda)
            );
            
            return cumpleTipo && cumpleFam && cumpleEstado && cumpleTexto;
        });

        // 2. ORDENAR
        filtrados.sort((a, b) => {
            let valorA = (a[App.columnaOrden] || "").toString();
            let valorB = (b[App.columnaOrden] || "").toString();
            
            // Si ordenamos por Familia, usamos el nombre real, no el ID
            if (App.columnaOrden === 'familia') { 
                valorA = App.mapaFam[a.familia_id] || ""; 
                valorB = App.mapaFam[b.familia_id] || ""; 
            }

            const numA = parseFloat(valorA); 
            const numB = parseFloat(valorB);
            
            if (!isNaN(numA) && !isNaN(numB) && !valorA.match(/[a-z]/i)) {
                return App.ordenAsc ? numA - numB : numB - numA;
            }
            return App.ordenAsc ? valorA.localeCompare(valorB) : valorB.localeCompare(valorA);
        });

        // 3. PINTAR
        if (filtrados.length === 0) { 
            tbody.innerHTML = '<tr><td colspan="8" style="padding:30px; text-align:center; color:#94a3b8;">No hay datos que coincidan.</td></tr>'; 
            return; 
        }

        tbody.innerHTML = filtrados.map(t => {
            const isChecked = App.seleccionados.has(t.id) ? 'checked' : '';
            
            // Badge Documentos
            const numDocs = (t.archivos && Array.isArray(t.archivos)) ? t.archivos.length : 0;
            const docBadge = numDocs > 0 ? `<span class="obs-pildora" style="background:#e0f2fe; color:#0369a1;">📎 ${numDocs}</span>` : '-';
            
            // Badge Estado con colores
            let estiloEstado = 'background:#dcfce7; color:#166534;'; // Verde (Almacén)
            if (t.estado === 'EN PRODUCCION') estiloEstado = 'background:#fee2e2; color:#991b1b;'; // Rojo
            if (t.estado === 'DESCATALOGADO') estiloEstado = 'background:#f3f4f6; color:#6b7280;'; // Gris
            
            const badgeEstado = `<span style="${estiloEstado} padding:2px 8px; border-radius:12px; font-size:10px; font-weight:800;">${t.estado || 'ALMACÉN'}</span>`;

            // Nombre Familia (Diagnóstico de errores)
            let nombreFamilia = App.mapaFam[t.familia_id];
            if (!nombreFamilia && t.familia_id) {
                // Si tiene ID pero no nombre, mostramos ID en rojo
                nombreFamilia = `<span style="color:red; font-weight:bold;">ID:${t.familia_id}</span>`;
            }

            let nombreTipo = App.mapaCat[t.categoria_id] || '';

            // Botones de Acción
            let botones = `
                <button class="btn-icono" onclick="App.editar(${t.id})" title="Editar Ficha Completa">✏️</button>
                <button class="btn-icono" onclick="App.generarQR('${t.id_troquel}', '${t.ubicacion}', '${t.nombre.replace(/'/g,"")}')" title="Imprimir Etiqueta">🖨️</button>
                <button class="btn-icono" onclick="App.borrar(${t.id})" style="color:#ef4444;" title="Mover a Papelera">🗑️</button>
            `;
            if (App.enPapelera) {
                botones = `<button class="btn-accion" style="background:#22c55e; padding:4px 8px; font-size:11px;" onclick="App.restaurar(${t.id})">♻️ Restaurar</button>`;
            }

            // IMPORTANTE: Al hacer clic en la fila -> App.verFicha (Modo Lectura)
            return `
            <tr style="${t.estado==='DESCATALOGADO' ? 'opacity:0.6; background:#f9fafb;' : ''}" onclick="App.verFicha(${t.id})" style="cursor:pointer;">
                <td onclick="event.stopPropagation()" style="text-align:center;">
                    <input type="checkbox" value="${t.id}" ${isChecked} onchange="App.select(this, ${t.id})">
                </td>
                <td style="text-align:center;">${docBadge}</td>
                <td style="text-align:center;">${badgeEstado}</td>
                <td style="font-weight:900; color:#0f766e; font-family:monospace; font-size:14px;">${t.id_troquel}</td>
                <td style="font-weight:700;">${t.ubicacion}</td>
                <td>${t.nombre}</td>
                <td><small style="color:#64748b;">${nombreFamilia || '-'}</small></td>
                <td onclick="event.stopPropagation()">${botones}</td>
            </tr>`;
        }).join('');
    },

    // =========================================================
    // 5. GESTIÓN DE AUXILIARES (FAMILIAS / TIPOS)
    // =========================================================
    crearFamilia: async () => {
        const nombre = prompt("Nombre de la nueva Familia:");
        if (!nombre) return;
        
        // Enviamos al servidor
        const res = await fetch('/api/familias', { 
            method: 'POST', 
            headers: {'Content-Type':'application/json'}, 
            body: JSON.stringify({ nombre: nombre }) 
        });

        if (res.ok) {
            const data = await res.json();
            // Recargamos los selects para que aparezca la nueva opción
            await App.cargarSelects();
            // Si estamos en el formulario, la seleccionamos automáticamente
            if (data.data && data.data[0]) {
                const nuevoSelect = document.getElementById('f-fam');
                if (nuevoSelect) nuevoSelect.value = data.data[0].id;
            }
            alert("Familia creada correctamente.");
        } else {
            alert("Error al crear familia.");
        }
    },

    crearTipo: async () => {
        const nombre = prompt("Nombre del nuevo Tipo:");
        if (!nombre) return;

        const res = await fetch('/api/categorias', { 
            method: 'POST', 
            headers: {'Content-Type':'application/json'}, 
            body: JSON.stringify({ nombre: nombre }) 
        });

        if (res.ok) {
            const data = await res.json();
            await App.cargarSelects();
            if (data.data && data.data[0]) {
                const nuevoSelect = document.getElementById('f-cat');
                if (nuevoSelect) nuevoSelect.value = data.data[0].id;
            }
            alert("Tipo creado correctamente.");
        }
    },

    abrirGestionAux: () => {
        document.getElementById('modal-aux').classList.remove('oculto');
    },

    // =========================================================
    // 6. SUBIDA DE ARCHIVOS (FOTOS Y PDF)
    // =========================================================
    subirArchivos: async (input) => {
        if (!input.files.length) return;
        
        const btn = input.parentElement;
        const textoOriginal = btn.innerText;
        btn.innerText = "⏳ Subiendo...";

        // Procesar archivo por archivo
        for (let i = 0; i < input.files.length; i++) {
            const file = input.files[i];
            const fd = new FormData(); 
            fd.append('file', file);
            
            try {
                const res = await fetch('/api/subir_foto', { method: 'POST', body: fd });
                if (res.ok) {
                    const data = await res.json();
                    // Agregar a la lista temporal
                    App.archivosActuales.push({
                        url: data.url,
                        nombre: file.name,
                        tipo: data.tipo // 'img' o 'pdf'
                    });
                }
            } catch (e) { alert("Error al subir archivo: " + file.name); }
        }
        
        // Actualizar vista previa y limpiar input
        App.renderListaArchivos();
        btn.innerText = textoOriginal;
        input.value = ""; 
    },

    renderListaArchivos: () => {
        const div = document.getElementById('lista-archivos');
        div.innerHTML = "";
        
        App.archivosActuales.forEach((arch, idx) => {
            const icon = arch.tipo === 'pdf' ? '📄' : `<img src="${arch.url}" style="height:30px; border-radius:3px;">`;
            div.innerHTML += `
                <div style="display:flex; align-items:center; gap:8px; background:white; padding:5px; border:1px solid #cbd5e1; border-radius:4px; font-size:11px;">
                    <a href="${arch.url}" target="_blank" style="text-decoration:none;">${icon}</a>
                    <span style="max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${arch.nombre}</span>
                    <span onclick="App.quitarArchivo(${idx})" style="color:#ef4444; font-weight:bold; cursor:pointer; margin-left:5px;">✕</span>
                </div>
            `;
        });
    },

    quitarArchivo: (idx) => {
        if (confirm("¿Quitar este archivo de la lista?")) {
            App.archivosActuales.splice(idx, 1);
            App.renderListaArchivos();
        }
    },

    // =========================================================
    // 7. GESTIÓN DEL FORMULARIO (CRUD)
    // =========================================================
    nuevoTroquel: () => {
        document.getElementById('titulo-form').innerText = "Alta de Nuevo Troquel";
        document.querySelector('form').reset();
        document.getElementById('f-id-db').value = "";
        
        // Limpiar archivos anteriores
        App.archivosActuales = [];
        App.renderListaArchivos();
        
        // Gestión de vistas
        if (App.modoMovil) document.getElementById('sidebar').classList.add('oculto');
        App.nav('vista-formulario');
    },

    editar: (id) => {
        const t = App.datos.find(x => x.id === id);
        if (!t) return;

        document.getElementById('titulo-form').innerText = "Editar Ficha Técnica";
        document.getElementById('f-id-db').value = t.id;
        document.getElementById('f-matricula').value = t.id_troquel;
        document.getElementById('f-ubicacion').value = t.ubicacion;
        document.getElementById('f-nombre').value = t.nombre;
        
        // Selectores (manejo de nulos)
        document.getElementById('f-cat').value = t.categoria_id || "";
        document.getElementById('f-fam').value = t.familia_id || "";
        
        document.getElementById('f-medidas-madera').value = t.tamano_troquel || "";
        document.getElementById('f-medidas-corte').value = t.tamano_final || "";
        document.getElementById('f-arts').value = t.codigos_articulo || "";
        document.getElementById('f-ot').value = t.referencias_ot || "";
        document.getElementById('f-obs').value = t.observaciones || "";
        
        // Cargar archivos
        App.archivosActuales = (t.archivos && Array.isArray(t.archivos)) ? t.archivos : [];
        App.renderListaArchivos();

        if (App.modoMovil) document.getElementById('sidebar').classList.add('oculto');
        App.nav('vista-formulario');
    },

    guardarFicha: async (e) => {
        e.preventDefault();
        const id = document.getElementById('f-id-db').value;
        
        // Construimos el objeto a guardar
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
            archivos: App.archivosActuales // Enviamos la lista completa
        };

        const method = id ? 'PUT' : 'POST';
        const url = id ? `/api/troqueles/${id}` : '/api/troqueles';
        
        await fetch(url, { method: method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
        
        // Recargar y volver
        await App.cargarTodo();
        App.volverDesdeForm();
    },

    // Cálculo automático de matrícula al cambiar Tipo
    calcularSiguienteId: async () => {
        const idDb = document.getElementById('f-id-db').value;
        if (idDb) return; // Si editamos, no cambiamos la matrícula
        
        const catId = document.getElementById('f-cat').value;
        if (!catId) return;
        
        try {
            const res = await fetch(`/api/siguiente_numero?categoria_id=${catId}`);
            const data = await res.json();
            document.getElementById('f-matricula').value = data.siguiente;
            document.getElementById('f-ubicacion').value = data.siguiente; // Por defecto misma ubi
        } catch (e) { console.error(e); }
    },

    // =========================================================
    // 8. UTILIDADES Y NAVEGACIÓN
    // =========================================================
    nav: (vista) => {
        document.querySelectorAll('.vista').forEach(x => x.classList.add('oculto'));
        document.getElementById(vista).classList.remove('oculto');
        // Si volvemos al inicio, restaurar sidebar
        if (vista === 'vista-lista') document.getElementById('sidebar').classList.remove('oculto');
    },

    volverDesdeForm: () => {
        if (App.modoMovil) App.activarModoMovil();
        else App.nav('vista-lista');
    },

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

    // Buscador en tiempo real para móvil
    buscarMovil: (txt) => {
        const div = document.getElementById('resultados-movil');
        div.innerHTML = "";
        if (txt.length < 2) return;
        
        const hits = App.datos.filter(t => (t.nombre+t.id_troquel+t.ubicacion).toLowerCase().includes(txt.toLowerCase()));
        
        div.innerHTML = hits.slice(0, 10).map(t => `
            <div class="card-movil" onclick="App.verFicha(${t.id})">
                <div style="font-weight:900; font-size:18px; color:#0f766e;">${t.id_troquel}</div>
                <div style="font-weight:bold;">${t.ubicacion}</div>
                <div>${t.nombre}</div>
                <button class="btn-secundario" style="width:100%; margin-top:5px;">Ver Ficha</button>
            </div>
        `).join('');
    },

    // =========================================================
    // 9. ACCIONES MASIVAS Y ESCÁNER
    // =========================================================
    select: (chk, id) => {
        if (chk.checked) App.seleccionados.add(id); else App.seleccionados.delete(id);
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
        App.renderTabla();
    },

    moverLote: async (accion) => {
        await fetch('/api/movimientos/lote', { 
            method: 'POST', 
            headers: {'Content-Type':'application/json'}, 
            body: JSON.stringify({ ids: Array.from(App.seleccionados), accion: accion }) 
        });
        App.limpiarSeleccion();
        App.cargarTodo();
    },

    asignarMasivo: async (campo) => {
        let selectId = campo === 'familia' ? 'bulk-familia' : 'bulk-tipo';
        let val = document.getElementById(selectId).value;
        if (!val || App.seleccionados.size === 0) return alert("Selecciona un valor primero");
        
        if (!confirm(`¿Aplicar a ${App.seleccionados.size} troqueles?`)) return;

        await fetch(`/api/troqueles/bulk/${campo}`, { 
            method: 'PUT', 
            headers: {'Content-Type':'application/json'}, 
            body: JSON.stringify({ ids: Array.from(App.seleccionados), valor_id: parseInt(val) }) 
        });
        App.limpiarSeleccion();
        App.cargarTodo(App.enPapelera);
    },

    // --- ESCÁNER CON PROTECCIÓN DE REBOTE ---
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
                // Bloqueo de 3 segundos para no leer el mismo código seguido
                if (txt === lastCode && (Date.now() - lastTime < 3000)) return; 
                
                const t = App.datos.find(x => x.id_troquel === txt);
                if (t) {
                    if (!App.escaneadosLote.has(t.id)) {
                        App.escaneadosLote.set(t.id, t);
                        App.renderListaEscaneados();
                        if (navigator.vibrate) navigator.vibrate(200);
                    }
                    lastCode = txt;
                    lastTime = Date.now();
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
                <div class="chip activo" style="background:white; color:black; display:flex; align-items:center; gap:5px;">
                    <b>${t.id_troquel}</b>
                    <span onclick="App.borrarDeLote(${id})" style="color:red; font-weight:bold; cursor:pointer;">✕</span>
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
        App.seleccionados = new Set(App.escaneadosLote.keys());
        await App.moverLote(acc);
        App.toggleScanner(false);
    },

    // =========================================================
    // 10. OTRAS ACCIONES (QR, BORRAR, FILTROS)
    // =========================================================
    descatalogar: async (id) => {
        if (!confirm("¿Marcar como DESCATALOGADO?")) return;
        const t = App.datos.find(x => x.id === id);
        // Creamos copia para no mutar el original directamente
        const update = { ...t, estado: "DESCATALOGADO" };
        
        await fetch(`/api/troqueles/${id}`, { 
            method: 'PUT', 
            headers: {'Content-Type':'application/json'}, 
            body: JSON.stringify(update) 
        });
        App.cargarTodo();
    },

    borrar: async (id) => {
        if (!confirm("¿Mover a PAPELERA?")) return;
        await fetch(`/api/troqueles/${id}`, { method: 'DELETE' });
        App.cargarTodo();
    },

    restaurar: async (id) => {
        await fetch(`/api/troqueles/${id}/restaurar`, { method: 'POST' });
        App.cargarTodo(true);
    },

    verPapelera: () => App.cargarTodo(true),
    salirPapelera: () => App.cargarTodo(false),

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

    limpiarBuscador: () => {
        document.getElementById('buscador').value = '';
        App.filtrar();
    },

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
                <td style="font-size:11px; color:#666;">${new Date(h.fecha_hora).toLocaleString()}</td>
                <td><b>${h.troqueles?.nombre || '?'}</b></td>
                <td><span class="obs-pildora">${h.accion}</span></td>
                <td style="font-size:11px;">${h.ubicacion_anterior || '-'} ➝ ${h.ubicacion_nueva || '-'}</td>
            </tr>
        `).join('');
    },

    exportarCSV: () => {
        let csv = "Matricula,Ubicacion,Nombre,Tipo,Familia,Estado\n";
        App.datos.forEach(t => {
            const tipo = App.mapaCat[t.categoria_id] || "";
            const fam = App.mapaFam[t.familia_id] || "";
            csv += `"${t.id_troquel}","${t.ubicacion}","${t.nombre}","${tipo}","${fam}","${t.estado}"\n`;
        });
        const a = document.createElement('a');
        a.href = 'data:text/csv;charset=utf-8,' + encodeURI(csv);
        a.download = 'inventario.csv';
        a.click();
    }
};

// Arrancar la App
window.onload = App.init;