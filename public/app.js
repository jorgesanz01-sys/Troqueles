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
    document.querySelectorAll('.vista').forEach(v => v.classList.add('oculto')); 
    document.getElementById(idVista).classList.remove('oculto'); 
    document.querySelectorAll('.menu-item').forEach(b => b.classList.remove('activo')); 
    if(btnElement) btnElement.classList.add('activo'); 
}

window.abrirVistaCrear = function(btnElement) { 
    document.getElementById('form-troquel').reset(); 
    document.getElementById('input-id-db').value = ""; 
    document.getElementById('titulo-formulario').innerText = "Alta de Nuevo Troquel"; 
    cambiarVista('vista-formulario', btnElement); 
}

// ==========================================
// 2. CARGA DE DATOS DESDE EL SERVIDOR
// ==========================================
async function cargarDatos() {
    try {
        const resCat = await fetch('/api/categorias'); 
        const categorias = await resCat.json();
        
        const select = document.getElementById('input-categoria'); 
        const selectBulk = document.getElementById('bulk-categoria'); 
        const chips = document.getElementById('contenedor-chips');
        
        select.innerHTML = '<option value="">Seleccionar...</option>'; 
        selectBulk.innerHTML = '<option value="">Cambiar familia a...</option>'; 
        chips.innerHTML = '<button class="chip activo" onclick="filtrarPorChip(\'TODOS\', this)">Todas</button>';
        
        categorias.forEach(cat => { 
            select.innerHTML += `<option value="${cat.id}">${cat.nombre}</option>`; 
            selectBulk.innerHTML += `<option value="${cat.id}">${cat.nombre}</option>`; 
            chips.innerHTML += `<button class="chip" onclick="filtrarPorChip('${cat.nombre}', this)">${cat.nombre}</button>`; 
        });

        const resTroq = await fetch('/api/troqueles'); 
        listaTroquelesCache = await resTroq.json(); 
        
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
    if (!nueva || nueva.trim() === "") return;
    
    try { 
        await fetch('/api/categorias', { 
            method: 'POST', 
            headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify({ nombre: nueva.trim() }) 
        }); 
        await cargarDatos(); 
        
        const opciones = Array.from(document.getElementById('input-categoria').options); 
        const opcionNueva = opciones.find(o => o.text === nueva.trim().toUpperCase()); 
        if (opcionNueva) opcionNueva.selected = true;
    } catch (error) { 
        alert("Error al crear la familia"); 
    }
}

// ==========================================
// 4. SISTEMA DE BÚSQUEDA Y FILTRADO
// ==========================================
const buscador = document.getElementById('buscador'); 
const btnLimpiar = document.getElementById('btn-limpiar');

buscador.addEventListener('input', () => { 
    btnLimpiar.classList.toggle('oculto', buscador.value === ''); 
    aplicarFiltrosYOrden(); 
});

window.limpiarBuscador = function() { 
    buscador.value = ''; 
    btnLimpiar.classList.add('oculto'); 
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
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('activo')); 
    btnElement.classList.add('activo'); 
    aplicarFiltrosYOrden(); 
}

function aplicarFiltrosYOrden() {
    const texto = buscador.value.toLowerCase();
    
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

    procesados.sort((a, b) => {
        let valA = (columnaOrden === 'familia' ? a.categorias?.nombre : a[columnaOrden]) || "";
        let valB = (columnaOrden === 'familia' ? b.categorias?.nombre : b[columnaOrden]) || "";
        
        if (valA < valB) return ordenAscendente ? -1 : 1;
        if (valA > valB) return ordenAscendente ? 1 : -1;
        return 0;
    });

    datosExportables = procesados; 
    renderizarTabla(procesados);
}

// ==========================================
// 5. RENDERIZADO DE TABLA (LISTA)
// ==========================================
function renderizarTabla(datos) {
    const tbody = document.getElementById('lista-troqueles'); 
    document.getElementById('check-all').checked = false;
    
    if (datos.length === 0) { 
        tbody.innerHTML = '<tr><td colspan="9" class="text-center" style="padding:40px;">No se encontraron resultados.</td></tr>'; 
        return; 
    }

    tbody.innerHTML = datos.map(t => {
        let pdfLink = t.enlace_archivo ? `<a href="${t.enlace_archivo}" target="_blank" title="Ver Plano" class="btn-pdf">📄 Ver</a>` : '-';
        const isChecked = idsSeleccionados.has(t.id) ? 'checked' : '';
        const arts = t.codigos_articulo ? `<span class="obs-pildora" style="background:#f0fdf4; color:#166534; border-color:#bbf7d0;" title="${t.codigos_articulo}">${t.codigos_articulo}</span>` : '-';
        
        return `
        <tr class="${isChecked ? 'fila-seleccionada' : ''}">
            <td class="text-center">
                <input type="checkbox" class="check-row" value="${t.id}" ${isChecked} onclick="toggleCheck(this, ${t.id})">
            </td>
            <td class="text-primary" style="font-size: 13px; font-weight: bold;">${t.id_troquel}</td>
            <td style="max-width: 200px;">${arts}</td>
            <td class="fw-bold">${t.nombre}</td>
            <td><span class="etiqueta-familia">${t.categorias?.nombre || '-'}</span></td>
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
    }).join('');
    
    evaluarBarraFlotante();
}

// ==========================================
// 6. ACCIONES MASIVAS (BULK) Y SELECCIÓN
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
    if (idsSeleccionados.size > 0) { 
        contador.innerText = `${idsSeleccionados.size} seleccionados`; 
        barra.classList.remove('oculto'); 
    } else { 
        barra.classList.add('oculto'); 
    } 
}

window.aplicarBulkCategoria = async function() { 
    const catId = document.getElementById('bulk-categoria').value; 
    if (!catId) return alert("Selecciona una familia."); 
    
    await fetch('/api/troqueles/bulk/categoria', { 
        method: 'PUT', 
        headers: {'Content-Type': 'application/json'}, 
        body: JSON.stringify({ ids: Array.from(idsSeleccionados), categoria_id: parseInt(catId) }) 
    }); 
    idsSeleccionados.clear(); 
    cargarDatos(); 
}

window.aplicarBulkBorrar = async function() { 
    if (!confirm(`¿Borrar ${idsSeleccionados.size} troqueles?`)) return; 
    
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
    if (datosExportables.length === 0) return alert("No hay datos para exportar");
    
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += "QR_Fisico,Codigos_Articulo,Referencias_OT,Descripcion,Familia,Ubicacion,Tam_Troquel,Tam_Final,Observaciones\r\n";
    
    datosExportables.forEach(t => {
        const row = [ 
            `"${t.id_troquel}"`, 
            `"${t.codigos_articulo || ''}"`, 
            `"${t.referencias_ot || ''}"`, 
            `"${t.nombre}"`, 
            `"${t.categorias?.nombre || ''}"`, 
            `"${t.ubicacion}"`, 
            `"${t.tamano_troquel || ''}"`, 
            `"${t.tamano_final || ''}"`, 
            `"${t.observaciones || ''}"` 
        ];
        csvContent += row.join(",") + "\r\n";
    });
    
    const link = document.createElement("a"); 
    link.setAttribute("href", encodeURI(csvContent)); 
    link.setAttribute("download", "inventario_troqueles.csv"); 
    document.body.appendChild(link); 
    link.click(); 
    document.body.removeChild(link);
}

// ==========================================
// 8. CRUD (FORMULARIO)
// ==========================================
window.abrirVistaEditar = function(id_db) {
    const t = listaTroquelesCache.find(x => x.id === id_db); 
    if (!t) return;
    
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
    
    document.querySelectorAll('.menu-item').forEach(b => b.classList.remove('activo'));
}

document.getElementById('form-troquel').addEventListener('submit', async (e) => {
    e.preventDefault(); 
    
    const id_db = document.getElementById('input-id-db').value;
    const datos = {
        id_troquel: document.getElementById('input-id').value,
        codigos_articulo: document.getElementById('input-articulos').value,
        referencias_ot: document.getElementById('input-ot').value,
        nombre: document.getElementById('input-nombre').value, 
        ubicacion: document.getElementById('input-ubicacion').value,
        categoria_id: parseInt(document.getElementById('input-categoria').value) || null,
        tamano_troquel: document.getElementById('input-tamano-troquel').value, 
        tamano_final: document.getElementById('input-tamano-final').value,
        enlace_archivo: document.getElementById('input-archivo').value, 
        observaciones: document.getElementById('input-observaciones').value
    };

    try {
        if (id_db) {
            await fetch(`/api/troqueles/${id_db}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(datos) });
        } else {
            await fetch('/api/troqueles', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(datos) });
        }
        await cargarDatos(); 
        document.querySelector('.menu-item').click();
    } catch (error) {
        alert("Ocurrió un error guardando el troquel.");
    }
});

// ==========================================
// 9. HISTORIAL
// ==========================================
window.cargarHistorial = async function() {
    try {
        const res = await fetch('/api/historial'); 
        const datos = await res.json(); 
        const tbody = document.getElementById('lista-historial');
        
        if (datos.length === 0) { 
            tbody.innerHTML = '<tr><td colspan="3" class="text-center" style="padding:40px;">No hay movimientos registrados.</td></tr>'; 
            return; 
        }
        
        tbody.innerHTML = datos.map(h => `
            <tr>
                <td class="text-muted" style="font-weight: 600;">${new Date(h.fecha_hora).toLocaleString()}</td>
                <td class="fw-bold">${h.troqueles ? `[${h.troqueles.id_troquel}] ${h.troqueles.nombre}` : 'Troquel Eliminado'}</td>
                <td>${h.accion}</td>
            </tr>
        `).join('');
    } catch (e) { 
        console.error("Error historial", e); 
    }
}

// ==========================================
// 10. GENERACIÓN QR Y ESCÁNER DE CÁMARA
// ==========================================
window.generarQR = function(id) { 
    document.getElementById('modal-qr').classList.remove('oculto'); 
    document.getElementById('qr-texto-id').innerText = id; 
    new QRious({ 
        element: document.getElementById('qr-canvas'), 
        value: id, 
        size: 250 
    }); 
}

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
    if(html5QrCode) { 
        html5QrCode.stop().then(() => { 
            html5QrCode.clear(); 
            document.getElementById('contenedor-camara').classList.add('oculto'); 
        }); 
    } else { 
        document.getElementById('contenedor-camara').classList.add('oculto'); 
    } 
}

// INICIALIZACIÓN
cargarDatos();