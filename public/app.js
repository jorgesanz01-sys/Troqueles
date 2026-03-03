// ==========================================
// VARIABLES GLOBALES
// ==========================================
let listaTroquelesCache = []; 
let datosExportables = []; 
let filtroTipoActivo = 'TODOS'; 
let filtroFamiliaActivo = 'TODAS';
let columnaOrden = 'id_troquel'; // Ordenamos por Matrícula
let ordenAscendente = true; 
let html5QrCode; 
let idsSeleccionados = new Set();

// ==========================================
// 1. NAVEGACIÓN
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
    // IMPORTANTE: Ya NO vinculamos ID y Ubicación. Son independientes.
    cambiarVista('vista-formulario', btnElement); 
}

// ==========================================
// 2. CARGA DE DATOS
// ==========================================
async function cargarDatos() {
    try {
        const [resCat, resFam, resTroq] = await Promise.all([
            fetch('/api/categorias'),
            fetch('/api/familias'),
            fetch('/api/troqueles')
        ]);

        const categorias = await resCat.json();
        const familias = await resFam.json();
        listaTroquelesCache = await resTroq.json();

        rellenarSelects(categorias, familias);
        aplicarFiltrosYOrden();

    } catch (error) { console.error("Error cargando datos:", error); }
}

function rellenarSelects(cats, fams) {
    const fCat = document.getElementById('input-categoria');
    const fFam = document.getElementById('input-familia');
    const bCat = document.getElementById('bulk-categoria');
    const bFam = document.getElementById('bulk-familia');
    const chips = document.getElementById('contenedor-chips');
    const filtroFam = document.getElementById('filtro-familia');

    fCat.innerHTML = '<option value="">Seleccionar Tipo...</option>';
    fFam.innerHTML = '<option value="">Seleccionar Familia...</option>';
    bCat.innerHTML = '<option value="">Tipo...</option>';
    bFam.innerHTML = '<option value="">Familia...</option>';
    
    // Chips SOLO para TIPOS
    chips.innerHTML = '<button class="chip activo" onclick="filtrarPorTipo(\'TODOS\', this)">Todos los Tipos</button>';
    // Dropdown SOLO para FAMILIAS
    filtroFam.innerHTML = '<option value="TODAS">Todas las Familias</option>';

    cats.forEach(c => {
        fCat.innerHTML += `<option value="${c.id}">${c.nombre}</option>`;
        bCat.innerHTML += `<option value="${c.id}">${c.nombre}</option>`;
        chips.innerHTML += `<button class="chip" onclick="filtrarPorTipo('${c.nombre}', this)">${c.nombre}</button>`;
    });

    fams.forEach(f => {
        fFam.innerHTML += `<option value="${f.id}">${f.nombre}</option>`;
        bFam.innerHTML += `<option value="${f.id}">${f.nombre}</option>`;
        filtroFam.innerHTML += `<option value="${f.nombre}">${f.nombre}</option>`;
    });
}

// ==========================================
// 3. FILTROS Y ORDEN
// ==========================================
window.filtrarPorTipo = function(tipo, btn) {
    filtroTipoActivo = tipo;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('activo'));
    btn.classList.add('activo');
    aplicarFiltrosYOrden();
}

window.filtrarPorFamilia = function(select) {
    filtroFamiliaActivo = select.value;
    aplicarFiltrosYOrden();
}

const buscador = document.getElementById('buscador');
if (buscador) {
    buscador.addEventListener('input', () => { 
        document.getElementById('btn-limpiar').classList.toggle('oculto', buscador.value === '');
        aplicarFiltrosYOrden(); 
    });
}
window.limpiarBuscador = function() { buscador.value = ''; document.getElementById('btn-limpiar').classList.add('oculto'); aplicarFiltrosYOrden(); }

window.ordenarPor = function(col) { 
    if(columnaOrden === col) ordenAscendente = !ordenAscendente;
    else { columnaOrden = col; ordenAscendente = true; } 
    aplicarFiltrosYOrden(); 
}

function aplicarFiltrosYOrden() {
    const txt = buscador.value.toLowerCase();
    
    let procesados = listaTroquelesCache.filter(t => {
        const okTipo = filtroTipoActivo === 'TODOS' || (t.categorias?.nombre === filtroTipoActivo);
        const okFam = filtroFamiliaActivo === 'TODAS' || (t.familias?.nombre === filtroFamiliaActivo);
        const okTxt = (
            (t.nombre && t.nombre.toLowerCase().includes(txt)) || 
            (t.id_troquel && t.id_troquel.toLowerCase().includes(txt)) || // Buscar por Matrícula
            (t.ubicacion && t.ubicacion.toLowerCase().includes(txt)) ||   // Buscar por Ubicación
            (t.codigos_articulo && t.codigos_articulo.toLowerCase().includes(txt))
        );
        return okTipo && okFam && okTxt;
    });

    procesados.sort((a, b) => {
        let vA = "", vB = "";
        
        if (columnaOrden === 'categoria') { vA = a.categorias?.nombre || ""; vB = b.categorias?.nombre || ""; }
        else if (columnaOrden === 'familia') { vA = a.familias?.nombre || ""; vB = b.familias?.nombre || ""; }
        else { vA = (a[columnaOrden] || "").toString(); vB = (b[columnaOrden] || "").toString(); }

        const numA = parseFloat(vA);
        const numB = parseFloat(vB);
        if (!isNaN(numA) && !isNaN(numB)) return ordenAscendente ? numA - numB : numB - numA;
        return ordenAscendente ? vA.localeCompare(vB) : vB.localeCompare(vA);
    });

    datosExportables = procesados;
    renderizarTabla(procesados);
}

function renderizarTabla(datos) {
    const tbody = document.getElementById('lista-troqueles'); 
    document.getElementById('check-all').checked = false;
    
    if (datos.length === 0) { 
        tbody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding:40px;">Sin resultados</td></tr>'; 
        return; 
    }

    tbody.innerHTML = datos.map(t => {
        const isChk = idsSeleccionados.has(t.id) ? 'checked' : '';
        const clsRow = idsSeleccionados.has(t.id) ? 'fila-seleccionada' : '';
        const art = t.codigos_articulo ? `<span class="obs-pildora">${t.codigos_articulo}</span>` : '-';
        
        const nombreTipo = t.categorias?.nombre || '<span style="color:#cbd5e1;">-</span>';
        const nombreFam = t.familias?.nombre || '<span style="color:#cbd5e1;">-</span>';

        return `
        <tr class="${clsRow}">
            <td class="text-center"><input type="checkbox" class="check-row" value="${t.id}" ${isChk} onclick="toggleCheck(this, ${t.id})"></td>
            
            <td class="text-primary" style="font-size:15px; font-weight:800; font-family:monospace;">${t.id_troquel}</td>
            
            <td style="font-weight:700;">${t.ubicacion}</td>
            
            <td class="fw-bold">${t.nombre}</td>
            <td><span class="etiqueta-familia">${nombreTipo}</span></td>
            <td style="color:#059669; font-weight:600;">${nombreFam}</td>
            <td style="max-width:200px;">${art}</td>
            
            <td>
                <div style="display:flex; justify-content:center; gap:5px;">
                    <button class="btn-icono" onclick="abrirVistaEditar(${t.id})">✏️</button>
                    <button class="btn-icono" onclick="generarQR('${t.id_troquel}')">🖨️</button>
                </div>
            </td>
        </tr>`;
    }).join('');
    
    evaluarBarraFlotante();
}

// ==========================================
// 4. ACCIONES MASIVAS
// ==========================================
window.toggleCheck = function(chk, id) { chk.checked ? idsSeleccionados.add(id) : idsSeleccionados.delete(id); aplicarFiltrosYOrden(); }
window.toggleAllChecks = function(main) { document.querySelectorAll('.check-row').forEach(c => { c.checked = main.checked; main.checked ? idsSeleccionados.add(parseInt(c.value)) : idsSeleccionados.delete(parseInt(c.value)); }); aplicarFiltrosYOrden(); }
function evaluarBarraFlotante() { const b = document.getElementById('barra-flotante'); b.classList.toggle('oculto', idsSeleccionados.size === 0); if(idsSeleccionados.size > 0) document.getElementById('contador-seleccionados').innerText = `${idsSeleccionados.size}`; }

window.aplicarBulk = async function(tipoEntidad) {
    const select = document.getElementById(`bulk-${tipoEntidad}`);
    const valorId = select.value;
    if(!valorId) return alert("Selecciona un valor");
    await fetch(`/api/troqueles/bulk/${tipoEntidad}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ ids: Array.from(idsSeleccionados), valor_id: parseInt(valorId) }) });
    idsSeleccionados.clear(); cargarDatos();
}

window.aplicarBulkBorrar = async function() {
    if(!confirm("¿Borrar seleccionados?")) return;
    await fetch('/api/troqueles/bulk/borrar', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ ids: Array.from(idsSeleccionados) }) });
    idsSeleccionados.clear(); cargarDatos(); 
}

// ==========================================
// 5. IMPORTAR / EXPORTAR
// ==========================================
window.crearEntidad = async function(tabla) {
    const nombre = prompt(`Nombre:`);
    if(!nombre || nombre.trim()==="") return;
    await fetch(`/api/${tabla}`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ nombre: nombre.trim() }) });
    await cargarDatos();
}

window.subirCSV = async function() {
    const input = document.getElementById('input-csv-import');
    const tipo = document.getElementById('select-tipo-importacion').value;
    if(!input.files[0]) return;
    
    if(!confirm(`¿Importar archivo en "${tipo}"?\n\nEl sistema buscará "CODIGO TROQUE" para la Matrícula y "UBICACIÓN" para la estantería.`)) return;
    
    const fd = new FormData(); fd.append('file', input.files[0]); fd.append('tipo_seleccionado', tipo);
    const btn = document.querySelector('button[onclick*="input-csv-import"]');
    btn.innerText = "⏳..."; btn.disabled = true;
    
    try {
        const res = await fetch('/api/importar_csv', { method: 'POST', body: fd });
        const d = await res.json();
        if(res.ok) { alert(`¡Importado! ${d.total} registros.`); cargarDatos(); } else alert("Error: " + d.detail);
    } catch(e) { alert("Error conexión"); }
    btn.innerText = "📤 Subir"; btn.disabled = false;
}

window.exportarCSV = function() {
    if(datosExportables.length===0) return alert("Sin datos");
    let csv = "data:text/csv;charset=utf-8,\uFEFFMatricula_ID,Ubicacion,Articulos,OT,Descripcion,Tipo,Familia,Medidas,Obs\r\n";
    datosExportables.forEach(t => csv += `"${t.id_troquel}","${t.ubicacion}","${t.codigos_articulo||''}","${t.referencias_ot||''}","${t.nombre}","${t.categorias?.nombre||''}","${t.familias?.nombre||''}","${t.tamano_troquel||''}","${t.observaciones||''}"\r\n`);
    const link = document.createElement("a"); link.href = encodeURI(csv); link.download = "inventario.csv"; document.body.appendChild(link); link.click();
}

// ==========================================
// 6. CRUD FORMULARIO
// ==========================================
window.abrirVistaEditar = function(id_db) {
    const t = listaTroquelesCache.find(x => x.id === id_db); if(!t) return;
    document.getElementById('input-id-db').value = t.id;
    document.getElementById('input-id').value = t.id_troquel; // MATRÍCULA
    document.getElementById('input-ubicacion').value = t.ubicacion; // UBICACIÓN
    document.getElementById('input-articulos').value = t.codigos_articulo||"";
    document.getElementById('input-ot').value = t.referencias_ot||"";
    document.getElementById('input-categoria').value = t.categoria_id||"";
    document.getElementById('input-familia').value = t.familia_id||"";
    document.getElementById('input-nombre').value = t.nombre;
    document.getElementById('input-tamano-troquel').value = t.tamano_troquel||"";
    document.getElementById('input-tamano-final').value = t.tamano_final||"";
    document.getElementById('input-archivo').value = t.enlace_archivo||"";
    document.getElementById('input-observaciones').value = t.observaciones||"";
    
    document.getElementById('titulo-formulario').innerText = "Editar Ficha";
    cambiarVista('vista-formulario');
}

document.getElementById('form-troquel').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id_db = document.getElementById('input-id-db').value;
    const datos = {
        id_troquel: document.getElementById('input-id').value, // MATRÍCULA
        ubicacion: document.getElementById('input-ubicacion').value, // UBICACIÓN
        codigos_articulo: document.getElementById('input-articulos').value,
        referencias_ot: document.getElementById('input-ot').value,
        nombre: document.getElementById('input-nombre').value,
        categoria_id: parseInt(document.getElementById('input-categoria').value)||null,
        familia_id: parseInt(document.getElementById('input-familia').value)||null,
        tamano_troquel: document.getElementById('input-tamano-troquel').value,
        tamano_final: document.getElementById('input-tamano-final').value,
        enlace_archivo: document.getElementById('input-archivo').value,
        observaciones: document.getElementById('input-observaciones').value,
    };
    
    const url = id_db ? `/api/troqueles/${id_db}` : '/api/troqueles';
    const method = id_db ? 'PUT' : 'POST';
    
    await fetch(url, { method: method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(datos) });
    await cargarDatos(); document.querySelector('.menu-item').click();
});

// ==========================================
// 7. QR Y OTROS
// ==========================================
window.generarQR = function(id_troquel) { 
    // Buscamos por MATRÍCULA (id_troquel)
    const t = listaTroquelesCache.find(x => x.id_troquel === id_troquel); if(!t) return;
    
    document.getElementById('modal-qr').classList.remove('oculto');
    // Muestra la ubicación humana
    document.getElementById('qr-texto-ubi').innerText = t.ubicacion || "SIN UBICAR";
    // Muestra la Matrícula
    document.getElementById('qr-texto-id').innerText = t.id_troquel; 
    document.getElementById('qr-texto-desc').innerText = t.nombre || "";
    // Codifica la MATRÍCULA (Única e Invariable)
    new QRious({ element: document.getElementById('qr-canvas'), value: id_troquel, size: 200, padding: 0, level: 'M' });
}

window.cargarHistorial = async function() { const res = await fetch('/api/historial'); const d = await res.json(); document.getElementById('lista-historial').innerHTML = d.map(h => `<tr><td class="text-muted">${new Date(h.fecha_hora).toLocaleString()}</td><td class="fw-bold">${h.troqueles?`${h.troqueles.nombre}`:'Eliminado'}</td><td>${h.accion}</td></tr>`).join(''); }

window.iniciarEscaneo = function() { 
    document.getElementById('contenedor-camara').classList.remove('oculto'); 
    html5QrCode = new Html5Qrcode("reader"); 
    html5QrCode.start({facingMode: "environment"}, {fps: 10, qrbox: 250}, (txt) => { 
        window.detenerEscaneo(); 
        document.querySelector('.menu-item').click(); 
        document.getElementById('buscador').value = txt; // Buscamos lo que lea el QR (Matrícula)
        aplicarFiltrosYOrden(); 
    }, () => {}).catch(() => window.detenerEscaneo()); 
}

window.detenerEscaneo = function() { if(html5QrCode) html5QrCode.stop().then(() => { html5QrCode.clear(); document.getElementById('contenedor-camara').classList.add('oculto'); }); else document.getElementById('contenedor-camara').classList.add('oculto'); }

// ==========================================
// ARRANQUE
// ==========================================
if (typeof window !== 'undefined') {
    window.addEventListener('load', cargarDatos);
}