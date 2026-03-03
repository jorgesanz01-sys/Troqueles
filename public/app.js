// ==========================================
// 1. VARIABLES GLOBALES DE ESTADO
// ==========================================
let listaTroquelesCache = []; 
let datosExportables = []; 

// Filtros Activos
let filtroTipoActivo = 'TODOS';      // Chips superiores (Tipos: Normal, Pequeño...)
let filtroFamiliaActivo = 'TODAS';   // Dropdown (Familias: Cajas, Carpetas...)

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
    
    // Vinculación: Al escribir ID, se copia a Ubicación (son lo mismo por defecto)
    const inputId = document.getElementById('input-id');
    const inputUbi = document.getElementById('input-ubicacion');
    if(inputId && inputUbi){
        inputId.oninput = function() {
            inputUbi.value = inputId.value;
        };
    }
    
    cambiarVista('vista-formulario', btnElement); 
}

// ==========================================
// 3. CARGA DE DATOS (CORE)
// ==========================================
async function cargarDatos() {
    try {
        console.log("Iniciando carga de datos...");

        // Carga paralela: Tipos, Familias y Troqueles
        const [resCat, resFam, resTroq] = await Promise.all([
            fetch('/api/categorias'), // Tipos
            fetch('/api/familias'),   // Familias
            fetch('/api/troqueles')   // Datos
        ]);

        const categorias = await resCat.json();
        const familias = await resFam.json();
        listaTroquelesCache = await resTroq.json();

        // Rellenar interfaces
        rellenarSelectoresYFiltros(categorias, familias);
        aplicarFiltrosYOrden();
        
    } catch (error) { 
        console.error("Error cargando datos:", error); 
    }
}

function rellenarSelectoresYFiltros(categorias, familias) {
    // A. Selectores del Formulario
    const fCat = document.getElementById('input-categoria');
    const fFam = document.getElementById('input-familia');
    if(fCat) fCat.innerHTML = '<option value="">Seleccionar Tipo...</option>';
    if(fFam) fFam.innerHTML = '<option value="">Seleccionar Familia...</option>';

    // B. Selectores Bulk
    const bCat = document.getElementById('bulk-categoria');
    const bFam = document.getElementById('bulk-familia');
    if(bCat) bCat.innerHTML = '<option value="">Asignar Tipo...</option>';
    if(bFam) bFam.innerHTML = '<option value="">Asignar Familia...</option>';

    // C. Filtros Visuales
    // 1. CHIPS (SOLO TIPOS)
    const chipsContainer = document.getElementById('contenedor-chips');
    if(chipsContainer) {
        chipsContainer.innerHTML = '<button class="chip activo" onclick="filtrarPorTipo(\'TODOS\', this)">Todos los Tipos</button>';
        
        categorias.forEach(cat => {
            // Formulario
            if(fCat) fCat.innerHTML += `<option value="${cat.id}">${cat.nombre}</option>`;
            // Bulk
            if(bCat) bCat.innerHTML += `<option value="${cat.id}">${cat.nombre}</option>`;
            // Chip
            chipsContainer.innerHTML += `<button class="chip" onclick="filtrarPorTipo('${cat.nombre}', this)">${cat.nombre}</button>`;
        });
    }

    // 2. DROPDOWN (SOLO FAMILIAS)
    const filtroFam = document.getElementById('filtro-familia');
    if(filtroFam) {
        filtroFam.innerHTML = '<option value="TODAS">Todas las Familias</option>';
        
        familias.forEach(fam => {
            // Formulario
            if(fFam) fFam.innerHTML += `<option value="${fam.id}">${fam.nombre}</option>`;
            // Bulk
            if(bFam) bFam.innerHTML += `<option value="${fam.id}">${fam.nombre}</option>`;
            // Filtro Dropdown
            filtroFam.innerHTML += `<option value="${fam.nombre}">${fam.nombre}</option>`;
        });
    }
}

// ==========================================
// 4. LÓGICA DE FILTRADO Y BÚSQUEDA
// ==========================================

// Filtro por Chips (Tipos)
window.filtrarPorTipo = function(nombreTipo, btnElement) { 
    filtroTipoActivo = nombreTipo; 
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('activo'));
    if (btnElement) btnElement.classList.add('activo'); 
    aplicarFiltrosYOrden(); 
}

// Filtro por Dropdown (Familias)
window.filtrarPorFamilia = function(selectElement) {
    filtroFamiliaActivo = selectElement.value;
    aplicarFiltrosYOrden();
}

// Buscador
const buscador = document.getElementById('buscador'); 
const btnLimpiar = document.getElementById('btn-limpiar');

if (buscador) {
    buscador.addEventListener('input', () => { 
        if (btnLimpiar) btnLimpiar.classList.toggle('oculto', buscador.value === '');
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

// --- MOTOR PRINCIPAL ---
function aplicarFiltrosYOrden() {
    if (!buscador) return;
    const texto = buscador.value.toLowerCase();
    
    // 1. Filtrado Triple (Tipo + Familia + Texto)
    let procesados = listaTroquelesCache.filter(t => {
        // A. TIPO (Chip)
        const nombreTipo = t.categorias?.nombre || '';
        const pasaTipo = (filtroTipoActivo === 'TODOS') || (nombreTipo === filtroTipoActivo);
        
        // B. FAMILIA (Dropdown)
        const nombreFam = t.familias?.nombre || '';
        const pasaFam = (filtroFamiliaActivo === 'TODAS') || (nombreFam === filtroFamiliaActivo);

        // C. TEXTO (Buscador)
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
        
        // Ordenación numérica inteligente
        const numA = parseFloat(valA);
        const numB = parseFloat(valB);

        if (!isNaN(numA) && !isNaN(numB) && !valA.match(/[a-z]/i) && !valB.match(/[a-z]/i)) {
            return ordenAscendente ? numA - numB : numB - numA;
        }
        
        return ordenAscendente ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });

    datosExportables = procesados; 
    renderizarTabla(procesados);
}

// ==========================================
// 5. RENDERIZADO DE TABLA
// ==========================================
function renderizarTabla(datos) {
    const tbody = document.getElementById('lista-troqueles'); 
    const checkAll = document.getElementById('check-all');
    if (checkAll) checkAll.checked = false;
    
    if (!tbody) return;

    if (datos.length === 0) { 
        tbody.innerHTML = '<tr><td colspan="9" class="text-center" style="padding:40px; color: #64748b;">No se encontraron resultados.</td></tr>'; 
        return; 
    }

    let filasHTML = "";
    
    datos.forEach(t => {
        let pdfLink = t.enlace_archivo ? `<a href="${t.enlace_archivo}" target="_blank" class="btn-pdf">📄</a>` : '-';
        let isChecked = idsSeleccionados.has(t.id) ? 'checked' : '';
        let claseFila = idsSeleccionados.has(t.id) ? 'fila-seleccionada' : '';
        
        // Etiquetas visuales
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
// 6. ACCIONES MASIVAS
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

// Bulk TIPO o FAMILIA
window.aplicarBulk = async function(tipoEntidad) {
    // tipoEntidad = 'categoria' (Tipo) o 'familia' (Familia)
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
    if (!confirm(`PELIGRO: ¿Borrar ${idsSeleccionados.size} troqueles?`)) return;
    
    await fetch('/api/troqueles/bulk/borrar', { 
        method: 'POST', 
        headers: {'Content-Type': 'application/json'}, 
        body: JSON.stringify({ ids: Array.from(idsSeleccionados) }) 
    }); 
    
    idsSeleccionados.clear(); 
    cargarDatos(); 
}

// ==========================================
// 7. IMPORTAR / EXPORTAR / CREAR ENTIDADES
// ==========================================
window.crearEntidad = async function(tabla) {
    const nombre = prompt(`Nombre para ${tabla==='categorias'?'TIPO':'FAMILIA'}:`);
    if(!nombre || nombre.trim()==="") return;
    await fetch(`/api/${tabla}`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ nombre: nombre.trim() }) });
    await cargarDatos();
}

window.subirCSV = async function() {
    const input = document.getElementById('input-csv-import');
    const selectTipo = document.getElementById('select-tipo-importacion');
    if (!input.files[0]) return;
    
    const tipoNombre = selectTipo.value;
    const formData = new FormData();
    formData.append('file', input.files[0]);
    formData.append('tipo_seleccionado', tipoNombre); 

    if (!confirm(`¿Importar archivo?\n- Tipo: "${tipoNombre}"\n- ID = UBICACIÓN`)) return;

    try {
        const btn = document.querySelector('button[onclick*="input-csv-import"]');
        const txt = btn.innerText;
        btn.innerText = "⏳..."; btn.disabled = true;

        const res = await fetch('/api/importar_csv', { method: 'POST', body: formData });
        const data = await res.json();
        
        btn.innerText = txt; btn.disabled = false;

        if (res.ok) {
            alert(`¡Importación completada! ${data.total_importados} registros.`);
            cargarDatos();
        } else {
            alert("Error: " + (data.detail || "Fallo"));
        }
    } catch (e) { 
        alert("Error de conexión."); 
    }
}

window.exportarCSV = function() {
    if (datosExportables.length === 0) return alert("Sin datos");
    
    let csv = "data:text/csv;charset=utf-8,\uFEFFID,Articulos,OT,Descripcion,Tipo,Familia,Ubicacion,Medidas,Obs\r\n";
    datosExportables.forEach(t => {
        const cat = t.categorias?.nombre || '';
        const fam = t.familias?.nombre || '';
        csv += `"${t.id_troquel}","${t.codigos_articulo||''}","${t.referencias_ot||''}","${t.nombre}","${cat}","${fam}","${t.ubicacion}","${t.tamano_troquel||''}","${t.observaciones||''}"\r\n`;
    });
    
    const link = document.createElement("a"); 
    link.href = encodeURI(csv); 
    link.download = "inventario.csv"; 
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

// ==========================================
// 8. CRUD FORMULARIO
// ==========================================
window.abrirVistaEditar = function(id_db) {
    const t = listaTroquelesCache.find(x => x.id === id_db); 
    if (!t) return;
    
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
    
    // Selectores
    document.getElementById('input-categoria').value = t.categoria_id || "";
    document.getElementById('input-familia').value = t.familia_id || ""; 
    
    document.getElementById('titulo-formulario').innerText = "Editar Ficha"; 
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
            document.querySelector('.menu-item').click(); 
            
        } catch (error) { alert("Error guardando datos."); }
    });
}

// ==========================================
// 9. GENERACIÓN QR GODEX
// ==========================================
window.generarQR = function(id_troquel) { 
    const t = listaTroquelesCache.find(x => x.id_troquel === id_troquel); 
    if (!t) return;

    document.getElementById('modal-qr').classList.remove('oculto'); 
    
    // Diseño 3 líneas
    document.getElementById('qr-texto-ubi').innerText = t.ubicacion || "SIN UBICAR";
    document.getElementById('qr-texto-id').innerText = t.id_troquel; 
    document.getElementById('qr-texto-desc').innerText = t.nombre || '';

    const canvas = document.getElementById('qr-canvas');
    if (canvas) new QRious({ element: canvas, value: id_troquel, size: 200, padding: 0, level: 'M' }); 
}

// ==========================================
// 10. HISTORIAL Y ESCÁNER
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
            html += `<tr><td class="text-muted" style="font-weight:600;">${new Date(h.fecha_hora).toLocaleString()}</td><td class="fw-bold">${info}</td><td>${h.accion}</td></tr>`;
        });
        tbody.innerHTML = html;
    } catch (e) { console.error("Error historial", e); }
}

window.iniciarEscaneo = function() { 
    document.getElementById('contenedor-camara').classList.remove('oculto'); 
    html5QrCode = new Html5Qrcode("reader"); 
    html5QrCode.start({facingMode: "environment"}, {fps: 10, qrbox: 250}, (txt) => { 
        window.detenerEscaneo(); 
        document.querySelector('.menu-item').click(); 
        document.getElementById('buscador').value = txt; 
        aplicarFiltrosYOrden(); 
    }, () => {}).catch(() => window.detenerEscaneo()); 
}

window.detenerEscaneo = function() { 
    if (html5QrCode) html5QrCode.stop().then(() => { html5QrCode.clear(); document.getElementById('contenedor-camara').classList.add('oculto'); }); 
    else document.getElementById('contenedor-camara').classList.add('oculto'); 
}

// ==========================================
// ARRANQUE
// ==========================================
if (typeof window !== 'undefined') {
    window.addEventListener('load', cargarDatos);
}