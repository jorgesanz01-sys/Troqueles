// ==========================================
// VARIABLES GLOBALES DE ESTADO
// ==========================================
let listaTroquelesCache = []; 
let datosExportables = []; 
let familiaActiva = 'TODOS'; 
let columnaOrden = 'id_troquel'; 
let ordenAscendente = true; 
let html5QrCode; 
let idsSeleccionados = new Set();

// ==========================================
// 1. NAVEGACIÓN ENTRE VISTAS
// ==========================================
window.cambiarVista = function(idVista, btnElement) { 
    // Ocultar todas las vistas
    const vistas = document.querySelectorAll('.vista');
    vistas.forEach(v => {
        v.classList.add('oculto');
    });
    
    // Mostrar la vista seleccionada
    const vistaDestino = document.getElementById(idVista);
    if (vistaDestino) {
        vistaDestino.classList.remove('oculto'); 
    }
    
    // Quitar la clase activo de todos los botones del menú
    const botonesMenu = document.querySelectorAll('.menu-item');
    botonesMenu.forEach(b => {
        b.classList.remove('activo');
    });
    
    // Poner la clase activo al botón pulsado
    if (btnElement) {
        btnElement.classList.add('activo'); 
    }
}

window.abrirVistaCrear = function(btnElement) { 
    // Limpiar formulario completo
    const form = document.getElementById('form-troquel');
    if (form) form.reset();
    
    document.getElementById('input-id-db').value = ""; 
    document.getElementById('titulo-formulario').innerText = "Alta de Nuevo Troquel"; 
    
    // Cambiar a la vista del formulario
    cambiarVista('vista-formulario', btnElement); 
}

// ==========================================
// 2. CARGA DE DATOS DESDE EL SERVIDOR
// ==========================================
async function cargarDatos() {
    try {
        // Cargar Categorías
        const resCat = await fetch('/api/categorias'); 
        const categorias = await resCat.json();
        
        const select = document.getElementById('input-categoria'); 
        const selectBulk = document.getElementById('bulk-categoria'); 
        const chips = document.getElementById('contenedor-chips');
        
        // Limpiar opciones previas
        if (select) select.innerHTML = '<option value="">Seleccionar...</option>'; 
        if (selectBulk) selectBulk.innerHTML = '<option value="">Cambiar familia a...</option>'; 
        if (chips) chips.innerHTML = '<button class="chip activo" onclick="filtrarPorChip(\'TODOS\', this)">Todas</button>';
        
        // Rellenar categorías
        categorias.forEach(cat => { 
            if (select) select.innerHTML += `<option value="${cat.id}">${cat.nombre}</option>`; 
            if (selectBulk) selectBulk.innerHTML += `<option value="${cat.id}">${cat.nombre}</option>`; 
            if (chips) chips.innerHTML += `<button class="chip" onclick="filtrarPorChip('${cat.nombre}', this)">${cat.nombre}</button>`; 
        });

        // Cargar Troqueles
        const resTroq = await fetch('/api/troqueles'); 
        listaTroquelesCache = await resTroq.json(); 
        
        // Aplicar filtros iniciales y pintar tabla
        aplicarFiltrosYOrden();
        
    } catch (error) { 
        console.error("Error cargando datos:", error); 
    }
}

// ==========================================
// 3. CREACIÓN DE CATEGORÍAS EN CALIENTE
// ==========================================
window.crearCategoriaAlVuelo = async function() {
    const nueva = prompt("Introduce el nombre de la nueva familia/tipo:"); 
    
    if (!nueva || nueva.trim() === "") {
        return;
    }
    
    try { 
        // Guardar nueva categoría en base de datos
        await fetch('/api/categorias', { 
            method: 'POST', 
            headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify({ nombre: nueva.trim() }) 
        }); 
        
        // Recargar los datos para actualizar los desplegables
        await cargarDatos(); 
        
        // Buscar la categoría recién creada y dejarla seleccionada en el formulario
        const opciones = Array.from(document.getElementById('input-categoria').options); 
        const opcionNueva = opciones.find(o => o.text === nueva.trim().toUpperCase()); 
        
        if (opcionNueva) {
            opcionNueva.selected = true;
        }
    } catch (error) { 
        alert("Error al crear la familia"); 
    }
}

// ==========================================
// 4. SISTEMA DE BÚSQUEDA Y FILTRADO
// ==========================================
const buscador = document.getElementById('buscador'); 
const btnLimpiar = document.getElementById('btn-limpiar');

// Escuchar cambios en el buscador
if (buscador) {
    buscador.addEventListener('input', () => { 
        if (btnLimpiar) {
            if (buscador.value === '') {
                btnLimpiar.classList.add('oculto');
            } else {
                btnLimpiar.classList.remove('oculto');
            }
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

window.filtrarPorChip = function(familia, btnElement) { 
    familiaActiva = familia; 
    
    const chips = document.querySelectorAll('.chip');
    chips.forEach(c => {
        c.classList.remove('activo');
    });
    
    if (btnElement) btnElement.classList.add('activo'); 
    aplicarFiltrosYOrden(); 
}

function aplicarFiltrosYOrden() {
    if (!buscador) return;
    const texto = buscador.value.toLowerCase();
    
    // 1. Aplicar Filtrado
    let procesados = listaTroquelesCache.filter(t => {
        const catNom = t.categorias?.nombre || '';
        const pasaFam = (familiaActiva === 'TODOS') || (catNom === familiaActiva);
        
        const pasaTxt = (
            (t.nombre && t.nombre.toLowerCase().includes(texto)) || 
            (t.id_troquel && t.id_troquel.toLowerCase().includes(texto)) ||
            (t.codigos_articulo && t.codigos_articulo.toLowerCase().includes(texto)) ||
            (t.referencias_ot && t.referencias_ot.toLowerCase().includes(texto)) ||
            (t.observaciones && t.observaciones.toLowerCase().includes(texto))
        );
        
        return pasaFam && pasaTxt;
    });

    // 2. Aplicar Ordenación
    procesados.sort((a, b) => {
        let valA = "";
        let valB = "";
        
        if (columnaOrden === 'familia') {
            valA = (a.categorias?.nombre || "").toLowerCase();
            valB = (b.categorias?.nombre || "").toLowerCase();
        } else {
            valA = (a[columnaOrden] || "").toString().toLowerCase();
            valB = (b[columnaOrden] || "").toString().toLowerCase();
        }
        
        if (valA < valB) return ordenAscendente ? -1 : 1;
        if (valA > valB) return ordenAscendente ? 1 : -1;
        return 0;
    });

    // Guardar para posible exportación Excel
    datosExportables = procesados; 
    
    // Llamar a renderizar
    renderizarTabla(procesados);
}

// ==========================================
// 5. RENDERIZADO DE TABLA (LISTA)
// ==========================================
function renderizarTabla(datos) {
    const tbody = document.getElementById('lista-troqueles'); 
    const checkAll = document.getElementById('check-all');
    if (checkAll) checkAll.checked = false;
    
    if (!tbody) return;

    if (datos.length === 0) { 
        tbody.innerHTML = '<tr><td colspan="10" class="text-center" style="padding:40px;">No se encontraron resultados.</td></tr>'; 
        return; 
    }

    let filasHTML = "";
    
    datos.forEach(t => {
        let pdfLink = '-';
        if (t.enlace_archivo) {
            pdfLink = `<a href="${t.enlace_archivo}" target="_blank" title="Ver Plano" class="btn-pdf">📄 Ver</a>`;
        }
        
        let isChecked = '';
        if (idsSeleccionados.has(t.id)) {
            isChecked = 'checked';
        }
        
        let claseFila = '';
        if (idsSeleccionados.has(t.id)) {
            claseFila = 'fila-seleccionada';
        }
        
        let arts = '-';
        if (t.codigos_articulo) {
            arts = `<span class="obs-pildora" style="background:#f0fdf4; color:#166534; border-color:#bbf7d0;" title="${t.codigos_articulo}">${t.codigos_articulo}</span>`;
        }
        
        let nombreCategoria = '-';
        if (t.categorias && t.categorias.nombre) {
            nombreCategoria = t.categorias.nombre;
        }
        
        filasHTML += `
        <tr class="${claseFila}">
            <td class="text-center">
                <input type="checkbox" class="check-row" value="${t.id}" ${isChecked} onclick="toggleCheck(this, ${t.id})">
            </td>
            <td class="text-primary" style="font-size: 13px; font-weight: bold;">${t.id_troquel}</td>
            <td style="max-width: 200px;">${arts}</td>
            <td class="fw-bold">${t.nombre}</td>
            <td><span class="etiqueta-familia">${nombreCategoria}</span></td>
            <td>${t.ubicacion || '-'}</td>
            <td>${t.tamano_troquel || '-'}</td>
            <td>${t.tamano_final || '-'}</td>
            <td>
                <div style="display:flex; justify-content:center; align-items: center; gap: 5px;">
                    ${pdfLink}
                    <button class="btn-icono" onclick="abrirVistaEditar(${t.id})" title="Editar Troquel">✏️</button>
                    <button class="btn-icono" onclick="generarQR('${t.id_troquel}')" title="Imprimir Etiqueta QR">🖨️</button>
                </div>
            </td>
        </tr>`;
    });

    tbody.innerHTML = filasHTML;
    evaluarBarraFlotante();
}

// ==========================================
// 6. ACCIONES MASIVAS (BULK) Y SELECCIÓN
// ==========================================
window.toggleCheck = function(checkbox, id) { 
    if (checkbox.checked) {
        idsSeleccionados.add(id); 
    } else {
        idsSeleccionados.delete(id); 
    }
    aplicarFiltrosYOrden(); 
}

window.toggleAllChecks = function(mainCheckbox) { 
    const checkboxes = document.querySelectorAll('.check-row'); 
    
    checkboxes.forEach(chk => { 
        chk.checked = mainCheckbox.checked; 
        if (mainCheckbox.checked) {
            idsSeleccionados.add(parseInt(chk.value)); 
        } else {
            idsSeleccionados.delete(parseInt(chk.value)); 
        }
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

window.aplicarBulkCategoria = async function() { 
    const catId = document.getElementById('bulk-categoria').value; 
    
    if (!catId) {
        return alert("Selecciona una familia."); 
    }
    
    await fetch('/api/troqueles/bulk/categoria', { 
        method: 'PUT', 
        headers: {'Content-Type': 'application/json'}, 
        body: JSON.stringify({ 
            ids: Array.from(idsSeleccionados), 
            categoria_id: parseInt(catId) 
        }) 
    }); 
    
    idsSeleccionados.clear(); 
    cargarDatos(); 
}

window.aplicarBulkBorrar = async function() { 
    if (!confirm(`¿Estás seguro de mover ${idsSeleccionados.size} troqueles a la papelera?`)) {
        return;
    }
    
    await fetch('/api/troqueles/bulk/borrar', { 
        method: 'POST', 
        headers: {'Content-Type': 'application/json'}, 
        body: JSON.stringify({ ids: Array.from(idsSeleccionados) }) 
    }); 
    
    idsSeleccionados.clear(); 
    cargarDatos(); 
}

// ==========================================
// 7. EXPORTACIÓN A EXCEL (CSV)
// ==========================================
window.exportarCSV = function() {
    if (datosExportables.length === 0) {
        return alert("No hay datos para exportar");
    }
    
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += "QR_Fisico,Codigos_Articulo,Referencias_OT,Descripcion,Familia,Ubicacion,Tam_Troquel,Tam_Final,Observaciones\r\n";
    
    datosExportables.forEach(t => {
        let nombreCat = '';
        if (t.categorias && t.categorias.nombre) {
            nombreCat = t.categorias.nombre;
        }
        
        const row = [ 
            `"${t.id_troquel}"`, 
            `"${t.codigos_articulo || ''}"`, 
            `"${t.referencias_ot || ''}"`, 
            `"${t.nombre}"`, 
            `"${nombreCat}"`, 
            `"${t.ubicacion}"`, 
            `"${t.tamano_troquel || ''}"`, 
            `"${t.tamano_final || ''}"`, 
            `"${t.observaciones || ''}"` 
        ];
        csvContent += row.join(",") + "\r\n";
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a"); 
    link.setAttribute("href", encodedUri); 
    link.setAttribute("download", "inventario_troqueles.csv"); 
    
    document.body.appendChild(link); 
    link.click(); 
    document.body.removeChild(link);
}

// ==========================================
// 8. IMPORTAR CSV (UNIVERSAL)
// ==========================================
window.subirCSV = async function() {
    const input = document.getElementById('input-csv-import');
    if (!input.files[0]) return;

    const formData = new FormData();
    formData.append('file', input.files[0]);

    if (!confirm("¿Seguro que quieres importar este archivo? Se añadirán o actualizarán los troqueles.")) {
        return;
    }

    try {
        // Mostrar feedback de carga en el botón
        const btn = document.querySelector('button[onclick*="input-csv-import"]');
        const textoOriginal = btn.innerText;
        btn.innerText = "⏳ Procesando...";
        btn.disabled = true;

        const res = await fetch('/api/importar_csv', { 
            method: 'POST', 
            body: formData 
        });
        
        const data = await res.json();
        
        // Restaurar botón
        btn.innerText = textoOriginal;
        btn.disabled = false;

        if (res.ok) {
            alert(`¡Importación completada! Se han procesado ${data.total_importados} registros.`);
            cargarDatos();
        } else {
            alert("Error del servidor: " + (data.detail || "No se pudo procesar el archivo."));
        }
    } catch (error) { 
        alert("Error de conexión al subir el archivo."); 
        // Restaurar botón si falla la conexión
        const btn = document.querySelector('button[onclick*="input-csv-import"]');
        if (btn) {
            btn.innerText = "📤 Importar CSV";
            btn.disabled = false;
        }
    }
}

// ==========================================
// 9. CRUD (FORMULARIO)
// ==========================================
window.abrirVistaEditar = function(id_db) {
    const t = listaTroquelesCache.find(x => x.id === id_db); 
    if (!t) {
        return;
    }
    
    document.getElementById('input-id-db').value = t.id; 
    document.getElementById('input-id').value = t.id_troquel;
    document.getElementById('input-articulos').value = t.codigos_articulo || "";
    document.getElementById('input-ot').value = t.referencias_ot || "";
    document.getElementById('input-categoria').value = t.categoria_id || "";
    document.getElementById('input-nombre').value = t.nombre; 
    document.getElementById('input-ubicacion').value = t.ubicacion;
    document.getElementById('input-tamano-troquel').value = t.tamano_troquel || ""; 
    document.getElementById('input-tamano-final').value = t.tamano_final || "";
    document.getElementById('input-archivo').value = t.enlace_archivo || ""; 
    document.getElementById('input-observaciones').value = t.observaciones || "";
    
    document.getElementById('titulo-formulario').innerText = "Editar Ficha de Troquel"; 
    
    cambiarVista('vista-formulario'); 
    
    const botonesMenu = document.querySelectorAll('.menu-item');
    botonesMenu.forEach(b => {
        b.classList.remove('activo');
    });
}

const formTroquel = document.getElementById('form-troquel');
if (formTroquel) {
    formTroquel.addEventListener('submit', async (e) => {
        e.preventDefault(); 
        
        const id_db = document.getElementById('input-id-db').value;
        
        let categoriaId = document.getElementById('input-categoria').value;
        if (categoriaId === "") {
            categoriaId = null;
        } else {
            categoriaId = parseInt(categoriaId);
        }
        
        const datos = {
            id_troquel: document.getElementById('input-id').value,
            codigos_articulo: document.getElementById('input-articulos').value,
            referencias_ot: document.getElementById('input-ot').value,
            nombre: document.getElementById('input-nombre').value, 
            ubicacion: document.getElementById('input-ubicacion').value,
            categoria_id: categoriaId,
            tamano_troquel: document.getElementById('input-tamano-troquel').value, 
            tamano_final: document.getElementById('input-tamano-final').value,
            enlace_archivo: document.getElementById('input-archivo').value, 
            observaciones: document.getElementById('input-observaciones').value
        };

        try {
            if (id_db) {
                await fetch(`/api/troqueles/${id_db}`, { 
                    method: 'PUT', 
                    headers: {'Content-Type': 'application/json'}, 
                    body: JSON.stringify(datos) 
                });
            } else {
                await fetch('/api/troqueles', { 
                    method: 'POST', 
                    headers: {'Content-Type': 'application/json'}, 
                    body: JSON.stringify(datos) 
                });
            }
            
            await cargarDatos(); 
            document.querySelector('.menu-item').click();
            
        } catch (error) {
            alert("Ocurrió un error guardando el troquel en la base de datos.");
        }
    });
}

// ==========================================
// 10. HISTORIAL Y AUDITORÍA
// ==========================================
window.cargarHistorial = async function() {
    try {
        const res = await fetch('/api/historial'); 
        const datos = await res.json(); 
        const tbody = document.getElementById('lista-historial');
        
        if (!tbody) return;

        if (datos.length === 0) { 
            tbody.innerHTML = '<tr><td colspan="3" class="text-center" style="padding:40px;">No hay movimientos registrados.</td></tr>'; 
            return; 
        }
        
        let htmlHistorial = "";
        datos.forEach(h => {
            let infoTroquel = "Troquel Eliminado";
            if (h.troqueles) {
                infoTroquel = `[${h.troqueles.id_troquel}] ${h.troqueles.nombre}`;
            }
            
            const fechaFormateada = new Date(h.fecha_hora).toLocaleString();
            
            htmlHistorial += `
            <tr>
                <td class="text-muted" style="font-weight: 600;">${fechaFormateada}</td>
                <td class="fw-bold">${infoTroquel}</td>
                <td>${h.accion}</td>
            </tr>`;
        });
        
        tbody.innerHTML = htmlHistorial;
        
    } catch (error) { 
        console.error("Error cargando el historial", error); 
    }
}

// ==========================================
// 11. GENERACIÓN QR CON UBICACIÓN INCRUSTADA
// ==========================================
window.generarQR = function(id_troquel) { 
    // 1. Encontrar los datos del troquel en el cache local
    const t = listaTroquelesCache.find(x => x.id_troquel === id_troquel);
    if (!t) {
        return;
    }

    // Mostrar el modal
    document.getElementById('modal-qr').classList.remove('oculto'); 
    
    // 2. Rellenar los 3 campos de texto en orden (UBI - ID - DESC)
    const ubiEl = document.getElementById('qr-texto-ubi');
    const idEl = document.getElementById('qr-texto-id'); 
    const descEl = document.getElementById('qr-texto-desc');

    // LÍNEA 1: UBICACIÓN (ARRIBA)
    if (ubiEl) {
        ubiEl.innerText = t.ubicacion ? t.ubicacion.toUpperCase() : "SIN UBICACIÓN";
    }
    
    // LÍNEA 2: CÓDIGO (CENTRO) - Prioridad: ID
    if (idEl) {
        idEl.innerText = t.id_troquel; 
    }
    
    // LÍNEA 3: DESCRIPCIÓN (ABAJO)
    if (descEl) {
        descEl.innerText = t.nombre || '';
    }

    // 3. Generación del QR Base (Limpio y legible)
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
// 12. ESCÁNER DE CÁMARA (SMARTPHONE)
// ==========================================
window.iniciarEscaneo = function() { 
    document.getElementById('contenedor-camara').classList.remove('oculto'); 
    html5QrCode = new Html5Qrcode("reader"); 
    
    html5QrCode.start( 
        { facingMode: "environment" }, 
        { fps: 10, qrbox: 250 }, 
        (textoScaneado) => { 
            // Si escanea algo, detiene cámara, va a la lista y busca ese texto
            window.detenerEscaneo(); 
            document.querySelector('.menu-item').click(); 
            document.getElementById('buscador').value = textoScaneado; 
            aplicarFiltrosYOrden(); 
        }, 
        (errorMessage) => {
            // Ignoramos errores de lectura por falta de enfoque
        } 
    ).catch((error) => {
        alert("Error al iniciar la cámara. Asegúrate de dar permisos al navegador.");
        window.detenerEscaneo();
    }); 
}

window.detenerEscaneo = function() { 
    if(html5QrCode) { 
        html5QrCode.stop().then(() => { 
            html5QrCode.clear(); 
            document.getElementById('contenedor-camara').classList.add('oculto'); 
        }); 
    } else { 
        document.getElementById('contenedor-camara').classList.add('oculto'); 
    } 
}

// ==========================================
// ARRANQUE DE LA APLICACIÓN
// ==========================================
// Solo arrancar si estamos en el navegador
if (typeof window !== 'undefined') {
    window.addEventListener('load', cargarDatos);
}