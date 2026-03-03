// ==========================================
// 1. VARIABLES GLOBALES DE ESTADO
// ==========================================
let listaTroquelesCache = []; 
let datosExportables = []; 

// Filtros Activos
let filtroTipoActivo = 'TODOS';      // Chips superiores (Categorias)
let filtroFamiliaActivo = 'TODAS';   // Dropdown (Familias)

// Ordenación
let columnaOrden = 'id_troquel'; 
let ordenAscendente = true; 

// Herramientas
let html5QrCode; 
let idsSeleccionados = new Set(); // Para acciones masivas

// ==========================================
// 2. SISTEMA DE NAVEGACIÓN (VISTAS)
// ==========================================
window.cambiarVista = function(idVista, btnElement) { 
    // 1. Ocultar todas las secciones
    const vistas = document.querySelectorAll('.vista');
    vistas.forEach(v => v.classList.add('oculto'));
    
    // 2. Mostrar la deseada
    const vistaDestino = document.getElementById(idVista);
    if (vistaDestino) {
        vistaDestino.classList.remove('oculto'); 
    }
    
    // 3. Gestionar estado de los botones del menú
    const botonesMenu = document.querySelectorAll('.menu-item');
    botonesMenu.forEach(b => b.classList.remove('activo'));
    
    if (btnElement) {
        btnElement.classList.add('activo'); 
    }
}

window.abrirVistaCrear = function(btnElement) { 
    // Resetear formulario
    const form = document.getElementById('form-troquel');
    if (form) form.reset();
    
    document.getElementById('input-id-db').value = ""; 
    document.getElementById('titulo-formulario').innerText = "Alta de Nuevo Troquel"; 
    
    // Truco: Al escribir el ID, copiamos valor a Ubicación (son lo mismo)
    const inputId = document.getElementById('input-id');
    const inputUbi = document.getElementById('input-ubicacion');
    inputId.oninput = function() {
        inputUbi.value = inputId.value;
    };
    
    cambiarVista('vista-formulario', btnElement); 
}

// ==========================================
// 3. CARGA DE DATOS (CORE)
// ==========================================
async function cargarDatos() {
    try {
        console.log("Iniciando carga de datos...");

        // Carga paralela para velocidad: Tipos, Familias y Troqueles
        const [resCat, resFam, resTroq] = await Promise.all([
            fetch('/api/categorias'), // Tipos (Normal, Pequeño...)
            fetch('/api/familias'),   // Familias (Cajas, Carpetas...)
            fetch('/api/troqueles')   // Datos
        ]);

        const categorias = await resCat.json();
        const familias = await resFam.json();
        listaTroquelesCache = await resTroq.json();

        // Una vez cargado todo, pintamos la interfaz
        rellenarSelectoresYFiltros(categorias, familias);
        aplicarFiltrosYOrden();
        
    } catch (error) { 
        console.error("Error crítico cargando datos:", error); 
        alert("Error de conexión con el servidor. Revisa la consola.");
    }
}

function rellenarSelectoresYFiltros(categorias, familias) {
    // A. Selectores del Formulario (Alta/Edición)
    const formCat = document.getElementById('input-categoria');
    const formFam = document.getElementById('input-familia');
    
    formCat.innerHTML = '<option value="">Seleccionar Tipo...</option>';
    formFam.innerHTML = '<option value="">Seleccionar Familia...</option>';

    // B. Selectores de Acciones Masivas (Bulk)
    const bulkCat = document.getElementById('bulk-categoria');
    const bulkFam = document.getElementById('bulk-familia');
    
    bulkCat.innerHTML = '<option value="">Asignar Tipo...</option>';
    bulkFam.innerHTML = '<option value="">Asignar Familia...</option>';

    // C. Filtros Visuales (Chips y Buscador)
    const contenedorChips = document.getElementById('contenedor-chips');
    const filtroFam = document.getElementById('filtro-familia');
    
    contenedorChips.innerHTML = '<button class="chip activo" onclick="filtrarPorTipo(\'TODOS\', this)">Todos los Tipos</button>';
    filtroFam.innerHTML = '<option value="TODAS">Todas las Familias</option>';

    // --- RELLENADO DE DATOS ---
    
    // 1. Tipos (Categorías)
    categorias.forEach(cat => {
        // En formulario
        formCat.innerHTML += `<option value="${cat.id}">${cat.nombre}</option>`;
        // En bulk
        bulkCat.innerHTML += `<option value="${cat.id}">${cat.nombre}</option>`;
        // En chips
        contenedorChips.innerHTML += `<button class="chip" onclick="filtrarPorTipo('${cat.nombre}', this)">${cat.nombre}</button>`;
    });

    // 2. Familias
    familias.forEach(fam => {
        // En formulario
        formFam.innerHTML += `<option value="${fam.id}">${fam.nombre}</option>`;
        // En bulk
        bulkFam.innerHTML += `<option value="${fam.id}">${fam.nombre}</option>`;
        // En filtro
        filtroFam.innerHTML += `<option value="${fam.nombre}">${fam.nombre}</option>`;
    });
}

// ==========================================
// 4. LÓGICA DE FILTRADO Y BÚSQUEDA
// ==========================================

// Filtro por Chips (Tipos)
window.filtrarPorTipo = function(nombreTipo, btnElement) { 
    filtroTipoActivo = nombreTipo; 
    
    // Actualizar visualmente los chips
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('activo'));
    if (btnElement) btnElement.classList.add('activo'); 
    
    aplicarFiltrosYOrden(); 
}

// Filtro por Dropdown (Familias)
window.filtrarPorFamilia = function(selectElement) {
    filtroFamiliaActivo = selectElement.value;
    aplicarFiltrosYOrden();
}

// Buscador de Texto
const buscador = document.getElementById('buscador'); 
const btnLimpiar = document.getElementById('btn-limpiar');

if (buscador) {
    buscador.addEventListener('input', () => { 
        if (btnLimpiar) {
            btnLimpiar.classList.toggle('oculto', buscador.value === '');
        }
        aplicarFiltrosYOrden(); 
    });
}

window.limpiarBuscador = function() { 
    if (buscador) buscador.value = ''; 
    if (btnLimpiar) btnLimpiar.classList.add('oculto'); 
    aplicarFiltrosYOrden(); 
}

window.ordenarPor = function(columna) { 
    if (columnaOrden === columna) {
        ordenAscendente = !ordenAscendente; 
    } else { 
        columnaOrden = columna; 
        ordenAscendente = true; 
    } 
    aplicarFiltrosYOrden(); 
}

// --- MOTOR PRINCIPAL DE FILTRADO ---
function aplicarFiltrosYOrden() {
    if (!buscador) return;
    const texto = buscador.value.toLowerCase();
    
    // 1. Filtrado
    let procesados = listaTroquelesCache.filter(t => {
        // A. Coincidencia de TIPO
        const nombreTipo = t.categorias?.nombre || '';
        const pasaTipo = (filtroTipoActivo === 'TODOS') || (nombreTipo === filtroTipoActivo);
        
        // B. Coincidencia de FAMILIA
        const nombreFam = t.familias?.nombre || '';
        const pasaFam = (filtroFamiliaActivo === 'TODAS') || (nombreFam === filtroFamiliaActivo);

        // C. Coincidencia de TEXTO
        const pasaTexto = (
            (t.nombre && t.nombre.toLowerCase().includes(texto)) || 
            (t.id_troquel && t.id_troquel.toLowerCase().includes(texto)) ||
            (t.codigos_articulo && t.codigos_articulo.toLowerCase().includes(texto)) ||
            (t.referencias_ot && t.referencias_ot.toLowerCase().includes(texto)) ||
            (t.observaciones && t.observaciones.toLowerCase().includes(texto))
        );
        
        return pasaTipo && pasaFam && pasaTexto;
    });

    // 2. Ordenación
    procesados.sort((a, b) => {
        let valA = "", valB = "";
        
        // Gestión especial de columnas relacionales
        if (columnaOrden === 'tipo') {
            valA = a.categorias?.nombre || "";
            valB = b.categorias?.nombre || "";
        } else if (columnaOrden === 'familia') {
            valA = a.familias?.nombre || "";
            valB = b.familias?.nombre || "";
        } else {
            valA = (a[columnaOrden] || "").toString();
            valB = (b[columnaOrden] || "").toString();
        }
        
        // Intento de ordenación numérica inteligente (para que "10" vaya después de "2")
        const numA = parseFloat(valA);
        const numB = parseFloat(valB);

        if (!isNaN(numA) && !isNaN(numB) && !valA.match(/[a-z]/i) && !valB.match(/[a-z]/i)) {
            // Si ambos son números puros
            return ordenAscendente ? numA - numB : numB - numA;
        }
        
        // Ordenación alfabética normal
        return ordenAscendente ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });

    // Guardar para exportar lo que se ve
    datosExportables = procesados; 
    
    // Renderizar
    renderizarTabla(procesados);
}

// ==========================================
// 5. RENDERIZADO DE TABLA HTML
// ==========================================
function renderizarTabla(datos) {
    const tbody = document.getElementById('lista-troqueles'); 
    const checkAll = document.getElementById('check-all');
    if (checkAll) checkAll.checked = false;
    
    if (!tbody) return;

    if (datos.length === 0) { 
        tbody.innerHTML = '<tr><td colspan="9" class="text-center" style="padding:40px; color: #64748b;">No se encontraron troqueles con esos filtros.</td></tr>'; 
        return; 
    }

    let filasHTML = "";
    
    datos.forEach(t => {
        let pdfLink = t.enlace_archivo ? `<a href="${t.enlace_archivo}" target="_blank" class="btn-pdf">📄</a>` : '-';
        let isChecked = idsSeleccionados.has(t.id) ? 'checked' : '';
        let claseFila = idsSeleccionados.has(t.id) ? 'fila-seleccionada' : '';
        
        // Formateo de etiquetas visuales
        let arts = t.codigos_articulo ? `<span class="obs-pildora" style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe;">${t.codigos_articulo}</span>` : '-';
        let tipo = t.categorias?.nombre ? `<span style="font-weight:600; color:#475569;">${t.categorias.nombre}</span>` : '-';
        let familia = t.familias?.nombre ? `<span style="color:#059669; font-weight:600;">${t.familias.nombre}</span>` : '-';

        filasHTML += `
        <tr class="${claseFila}">
            <td class="text-center">
                <input type="checkbox" class="check-row" value="${t.id}" ${isChecked} onclick="toggleCheck(this, ${t.id})">
            </td>
            <td class="text-primary" style="font-size: 14px; font-weight: 800; font-family: monospace;">${t.id_troquel}</td>
            
            <td class="fw-bold">${t.nombre}</td>
            
            <td>${familia}</td>
            
            <td>${tipo}</td>
            
            <td style="max-width: 250px;">${arts}</td>
            
            <td>${t.referencias_ot || '-'}</td>
            
            <td>
                <div style="display:flex; justify-content:center; align-items: center; gap: 5px;">
                    ${pdfLink}
                    <button class="btn-icono" onclick="abrirVistaEditar(${t.id})" title="Editar">✏️</button>
                    <button class="btn-icono" onclick="generarQR('${t.id_troquel}')" title="Etiqueta Godex">🖨️</button>
                </div>
            </td>
        </tr>`;
    });

    tbody.innerHTML = filasHTML;
    evaluarBarraFlotante();
}

// ==========================================
// 6. GESTIÓN DE SELECCIÓN Y BULK
// ==========================================
window.toggleCheck = function(checkbox, id) { 
    if (checkbox.checked) idsSeleccionados.add(id); 
    else idsSeleccionados.delete(id); 
    aplicarFiltrosYOrden(); 
}

window.toggleAllChecks = function(mainCheckbox) { 
    const checkboxes = document.querySelectorAll('.check-row'); 
    checkboxes.forEach(chk => { 
        chk.checked = mainCheckbox.checked; 
        if (mainCheckbox.checked) idsSeleccionados.add(parseInt(chk.value)); 
        else idsSeleccionados.delete(parseInt(chk.value)); 
    }); 
    aplicarFiltrosYOrden(); 
}

function evaluarBarraFlotante() { 
    const barra = document.getElementById('barra-flotante'); 
    const contador = document.getElementById('contador-seleccionados'); 
    
    if (barra && contador) {
        if (idsSeleccionados.size > 0) { 
            contador.innerText = `${idsSeleccionados.size} seleccionados`; 
            barra.classList.remove('oculto'); 
        } else { 
            barra.classList.add('oculto'); 
        } 
    }
}

// Aplicar cambios masivos (Tipo o Familia)
window.aplicarBulk = async function(tipoEntidad) {
    // tipoEntidad puede ser 'categoria' (Tipo) o 'familia' (Familia)
    const select = document.getElementById(`bulk-${tipoEntidad}`);
    const valorId = select.value;
    
    if (!valorId) return alert("Por favor selecciona un valor de la lista.");
    
    if (!confirm(`¿Aplicar este cambio a ${idsSeleccionados.size} troqueles?`)) return;

    try {
        await fetch(`/api/troqueles/bulk/${tipoEntidad}`, { 
            method: 'PUT', 
            headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify({ 
                ids: Array.from(idsSeleccionados), 
                valor_id: parseInt(valorId) 
            }) 
        });
        
        idsSeleccionados.clear(); 
        cargarDatos();
        alert("Cambios aplicados correctamente.");
    } catch (e) {
        alert("Error al aplicar cambios masivos.");
    }
}

window.aplicarBulkBorrar = async function() { 
    if (!confirm(`PELIGRO: ¿Estás seguro de enviar a la papelera ${idsSeleccionados.size} troqueles?`)) return;
    
    await fetch('/api/troqueles/bulk/borrar', { 
        method: 'POST', 
        headers: {'Content-Type': 'application/json'}, 
        body: JSON.stringify({ ids: Array.from(idsSeleccionados) }) 
    }); 
    
    idsSeleccionados.clear(); 
    cargarDatos(); 
}

// ==========================================
// 7. FUNCIONES DE CREACIÓN RÁPIDA (ENTIDADES)
// ==========================================
window.crearEntidad = async function(tabla) {
    const tipoTexto = tabla === 'categorias' ? 'TIPO' : 'FAMILIA';
    const nombre = prompt(`Escribe el nombre del nuevo ${tipoTexto}:`);
    
    if (!nombre || nombre.trim() === "") return;
    
    try {
        await fetch(`/api/${tabla}`, { 
            method: 'POST', 
            headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify({ nombre: nombre.trim() }) 
        });
        await cargarDatos(); // Recargar para ver la nueva opción
    } catch (e) {
        alert("Error al crear el registro.");
    }
}

// ==========================================
// 8. IMPORTACIÓN (CSV) Y EXPORTACIÓN
// ==========================================
window.subirCSV = async function() {
    const input = document.getElementById('input-csv-import');
    const selectTipo = document.getElementById('select-tipo-importacion');
    
    if (!input.files[0]) return;
    
    const tipoNombre = selectTipo.value;
    const formData = new FormData();
    formData.append('file', input.files[0]);
    formData.append('tipo_seleccionado', tipoNombre); // Enviamos el tipo elegido

    if (!confirm(`¿Importar archivo?\n\n- Se asignará el tipo: "${tipoNombre}"\n- El ID será la UBICACIÓN.`)) return;

    try {
        // Feedback visual
        const btn = document.querySelector('button[onclick*="input-csv-import"]');
        const txt = btn.innerText;
        btn.innerText = "⏳..."; btn.disabled = true;

        const res = await fetch('/api/importar_csv', { method: 'POST', body: formData });
        const data = await res.json();
        
        btn.innerText = txt; btn.disabled = false;

        if (res.ok) {
            alert(`¡Importación completada! ${data.total_importados} registros procesados.`);
            cargarDatos();
        } else {
            alert("Error: " + (data.detail || "Fallo desconocido"));
        }
    } catch (e) { 
        alert("Error de conexión al subir."); 
    }
}

window.exportarCSV = function() {
    if (datosExportables.length === 0) return alert("No hay datos para exportar");
    
    let csv = "data:text/csv;charset=utf-8,\uFEFF";
    csv += "ID_Ubicacion,Articulos,OT,Descripcion,Tipo,Familia,Medidas,Obs\r\n";
    
    datosExportables.forEach(t => {
        const cat = t.categorias?.nombre || '';
        const fam = t.familias?.nombre || '';
        csv += `"${t.id_troquel}","${t.codigos_articulo||''}","${t.referencias_ot||''}","${t.nombre}","${cat}","${fam}","${t.tamano_troquel||''}","${t.observaciones||''}"\r\n`;
    });
    
    const link = document.createElement("a"); 
    link.href = encodeURI(csv); 
    link.download = "inventario_troqueles.csv"; 
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

// ==========================================
// 9. GESTIÓN DEL FORMULARIO (ALTA/EDICIÓN)
// ==========================================
window.abrirVistaEditar = function(id_db) {
    const t = listaTroquelesCache.find(x => x.id === id_db); 
    if (!t) return;
    
    // Rellenar campos
    document.getElementById('input-id-db').value = t.id; 
    document.getElementById('input-id').value = t.id_troquel;
    document.getElementById('input-articulos').value = t.codigos_articulo || "";
    document.getElementById('input-ot').value = t.referencias_ot || "";
    document.getElementById('input-nombre').value = t.nombre; 
    document.getElementById('input-ubicacion').value = t.ubicacion;
    document.getElementById('input-tamano-troquel').value = t.tamano_troquel || ""; 
    document.getElementById('input-tamano-final').value = t.tamano_final || "";
    document.getElementById('input-archivo').value = t.enlace_archivo || ""; 
    document.getElementById('input-observaciones').value = t.observaciones || "";
    
    // Selectores (manejo de nulos)
    document.getElementById('input-categoria').value = t.categoria_id || "";
    document.getElementById('input-familia').value = t.familia_id || ""; // Nuevo campo
    
    document.getElementById('titulo-formulario').innerText = "Editar Ficha de Troquel"; 
    cambiarVista('vista-formulario'); 
}

const formTroquel = document.getElementById('form-troquel');
if (formTroquel) {
    formTroquel.addEventListener('submit', async (e) => {
        e.preventDefault(); 
        const id_db = document.getElementById('input-id-db').value;
        
        const datos = {
            id_troquel: document.getElementById('input-id').value,
            codigos_articulo: document.getElementById('input-articulos').value,
            referencias_ot: document.getElementById('input-ot').value,
            nombre: document.getElementById('input-nombre').value, 
            ubicacion: document.getElementById('input-ubicacion').value,
            // Parsear IDs de selectores
            categoria_id: parseInt(document.getElementById('input-categoria').value) || null,
            familia_id: parseInt(document.getElementById('input-familia').value) || null,
            tamano_troquel: document.getElementById('input-tamano-troquel').value, 
            tamano_final: document.getElementById('input-tamano-final').value,
            enlace_archivo: document.getElementById('input-archivo').value, 
            observaciones: document.getElementById('input-observaciones').value
        };

        try {
            const url = id_db ? `/api/troqueles/${id_db}` : '/api/troqueles';
            const method = id_db ? 'PUT' : 'POST';
            
            await fetch(url, { 
                method: method, 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify(datos) 
            });
            
            await cargarDatos(); 
            document.querySelector('.menu-item').click(); // Volver a lista
            
        } catch (error) {
            alert("Error guardando datos.");
        }
    });
}

// ==========================================
// 10. GENERACIÓN ETIQUETA GODEX (3 LÍNEAS)
// ==========================================
window.generarQR = function(id_troquel) { 
    const t = listaTroquelesCache.find(x => x.id_troquel === id_troquel); 
    if (!t) return;

    document.getElementById('modal-qr').classList.remove('oculto'); 
    
    // Mapeo de campos al diseño
    // Línea 1: Ubicación
    document.getElementById('qr-texto-ubi').innerText = t.ubicacion || "SIN UBICAR";
    // Línea 2: ID (QR)
    document.getElementById('qr-texto-id').innerText = t.id_troquel; 
    // Línea 3: Descripción
    document.getElementById('qr-texto-desc').innerText = t.nombre || '';

    // Generar código QR limpio
    const canvas = document.getElementById('qr-canvas');
    if (canvas) {
        new QRious({ 
            element: canvas, 
            value: id_troquel, 
            size: 200,    
            padding: 0,   
            level: 'M' 
        }); 
    }
}

// ==========================================
// 11. ESCÁNER DE CÁMARA
// ==========================================
window.iniciarEscaneo = function() { 
    document.getElementById('contenedor-camara').classList.remove('oculto'); 
    html5QrCode = new Html5Qrcode("reader"); 
    
    html5QrCode.start( 
        { facingMode: "environment" }, 
        { fps: 10, qrbox: 250 }, 
        (textoScaneado) => { 
            window.detenerEscaneo(); 
            document.querySelector('.menu-item').click(); 
            document.getElementById('buscador').value = textoScaneado; 
            aplicarFiltrosYOrden(); 
        }, 
        () => {} 
    ).catch(() => window.detenerEscaneo()); 
}

window.detenerEscaneo = function() { 
    if (html5QrCode) { 
        html5QrCode.stop().then(() => { 
            html5QrCode.clear(); 
            document.getElementById('contenedor-camara').classList.add('oculto'); 
        }); 
    } else { 
        document.getElementById('contenedor-camara').classList.add('oculto'); 
    } 
}

// ==========================================
// 12. HISTORIAL
// ==========================================
window.cargarHistorial = async function() {
    try {
        const res = await fetch('/api/historial'); 
        const datos = await res.json(); 
        const tbody = document.getElementById('lista-historial');
        
        if (!tbody) return;
        if (datos.length === 0) { 
            tbody.innerHTML = '<tr><td colspan="3" class="text-center" style="padding:40px;">Sin movimientos.</td></tr>'; 
            return; 
        }
        
        let html = "";
        datos.forEach(h => {
            let info = h.troqueles ? `[${h.troqueles.id_troquel}] ${h.troqueles.nombre}` : "Troquel Eliminado";
            html += `
            <tr>
                <td class="text-muted" style="font-weight:600;">${new Date(h.fecha_hora).toLocaleString()}</td>
                <td class="fw-bold">${info}</td>
                <td>${h.accion}</td>
            </tr>`;
        });
        tbody.innerHTML = html;
    } catch (e) { console.error("Error historial", e); }
}

// ==========================================
// ARRANQUE
// ==========================================
if (typeof window !== 'undefined') {
    window.addEventListener('load', cargarDatos);
}