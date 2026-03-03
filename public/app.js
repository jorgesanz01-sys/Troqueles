// ==========================================
// 1. VARIABLES GLOBALES
// ==========================================
let listaTroquelesCache = []; 
let datosExportables = []; 
let filtroTipoActivo = 'TODOS'; 
let filtroFamiliaActivo = 'TODAS';
let columnaOrden = 'id_troquel'; 
let ordenAscendente = true; 
let html5QrCode; 
let idsSeleccionados = new Set();

// Mapas auxiliares para nombres
let mapaCategorias = {};
let mapaFamilias = {};

// ==========================================
// 2. NAVEGACIÓN
// ==========================================
window.cambiarVista = function(idVista, btnElement) { 
    document.querySelectorAll('.vista').forEach(v => v.classList.add('oculto'));
    document.getElementById(idVista).classList.remove('oculto');
    document.querySelectorAll('.menu-item').forEach(b => b.classList.remove('activo'));
    if(btnElement) btnElement.classList.add('activo');
}

window.abrirVistaCrear = function(btnElement) { 
    const f = document.getElementById('form-troquel');
    if(f) f.reset();
    document.getElementById('input-id-db').value = ""; 
    document.getElementById('titulo-formulario').innerText = "Alta de Nuevo Troquel"; 
    cambiarVista('vista-formulario', btnElement); 
}

// ==========================================
// 3. CARGA DE DATOS
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

        // Crear mapas para buscar nombres rápido
        if(Array.isArray(categorias)) categorias.forEach(c => mapaCategorias[c.id] = c.nombre);
        if(Array.isArray(familias)) familias.forEach(f => mapaFamilias[f.id] = f.nombre);

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
    bCat.innerHTML = '<option value="">Asignar Tipo...</option>';
    bFam.innerHTML = '<option value="">Asignar Familia...</option>';
    chips.innerHTML = '<button class="chip activo" onclick="filtrarPorTipo(\'TODOS\', this)">Todos los Tipos</button>';
    filtroFam.innerHTML = '<option value="TODAS">Todas las Familias</option>';

    if(Array.isArray(cats)) {
        cats.forEach(c => {
            fCat.innerHTML += `<option value="${c.id}">${c.nombre}</option>`;
            bCat.innerHTML += `<option value="${c.id}">${c.nombre}</option>`;
            chips.innerHTML += `<button class="chip" onclick="filtrarPorTipo('${c.nombre}', this)">${c.nombre}</button>`;
        });
    }

    if(Array.isArray(fams)) {
        fams.forEach(f => {
            fFam.innerHTML += `<option value="${f.id}">${f.nombre}</option>`;
            bFam.innerHTML += `<option value="${f.id}">${f.nombre}</option>`;
            filtroFam.innerHTML += `<option value="${f.nombre}">${f.nombre}</option>`;
        });
    }
}

// ==========================================
// 4. FILTROS Y ORDEN
// ==========================================
window.filtrarPorTipo = function(t, btn) {
    filtroTipoActivo = t;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('activo'));
    if(btn) btn.classList.add('activo');
    aplicarFiltrosYOrden();
}

window.filtrarPorFamilia = function(sel) {
    filtroFamiliaActivo = sel.value;
    aplicarFiltrosYOrden();
}

const buscador = document.getElementById('buscador');
if(buscador) buscador.addEventListener('input', () => { 
    aplicarFiltrosYOrden(); 
});
window.limpiarBuscador = function() { buscador.value=''; aplicarFiltrosYOrden(); }

window.ordenarPor = function(col) {
    if(columnaOrden === col) ordenAscendente = !ordenAscendente;
    else { columnaOrden = col; ordenAscendente = true; }
    aplicarFiltrosYOrden();
}

function getNombreCat(t) {
    if (t.categorias && t.categorias.nombre) return t.categorias.nombre;
    if (t.categoria_id && mapaCategorias[t.categoria_id]) return mapaCategorias[t.categoria_id];
    return '';
}

function getNombreFam(t) {
    if (t.familias && t.familias.nombre) return t.familias.nombre;
    if (t.familia_id && mapaFamilias[t.familia_id]) return mapaFamilias[t.familia_id];
    return '';
}

function aplicarFiltrosYOrden() {
    const txt = buscador.value.toLowerCase();
    
    let res = listaTroquelesCache.filter(t => {
        const nCat = getNombreCat(t);
        const nFam = getNombreFam(t);

        const okTip = filtroTipoActivo === 'TODOS' || nCat === filtroTipoActivo;
        const okFam = filtroFamiliaActivo === 'TODAS' || nFam === filtroFamiliaActivo;
        
        const okTxt = (
            (t.nombre && t.nombre.toLowerCase().includes(txt)) || 
            (t.id_troquel && t.id_troquel.toString().toLowerCase().includes(txt)) || 
            (t.ubicacion && t.ubicacion.toString().toLowerCase().includes(txt)) || 
            (t.codigos_articulo && t.codigos_articulo.toLowerCase().includes(txt))
        );
        return okTip && okFam && okTxt;
    });

    res.sort((a,b) => {
        let vA = (a[columnaOrden]||"").toString();
        let vB = (b[columnaOrden]||"").toString();
        const nA = parseFloat(vA); const nB = parseFloat(vB);
        if(!isNaN(nA) && !isNaN(nB) && !vA.match(/[a-z]/i)) return ordenAscendente ? nA-nB : nB-nA;
        return ordenAscendente ? vA.localeCompare(vB) : vB.localeCompare(vA);
    });

    datosExportables = res;
    renderizarTabla(res);
}

function renderizarTabla(datos) {
    const tbody = document.getElementById('lista-troqueles');
    document.getElementById('check-all').checked = false;
    evaluarBarra(); // Resetear barra si se filtra
    
    if(datos.length === 0) { tbody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding:40px;">Sin resultados</td></tr>'; return; }

    tbody.innerHTML = datos.map(t => {
        const chk = idsSeleccionados.has(t.id) ? 'checked' : '';
        const cls = idsSeleccionados.has(t.id) ? 'fila-seleccionada' : '';
        const art = t.codigos_articulo ? `<span class="obs-pildora">${t.codigos_articulo}</span>` : '-';
        
        const nCat = getNombreCat(t) || '-';
        const nFam = getNombreFam(t) || '-';

        // LÁPIZ: Importante, pasamos el ID como string con comillas '${t.id}'
        return `<tr class="${cls}">
            <td class="text-center"><input type="checkbox" class="check-row" value="${t.id}" ${chk} onclick="toggleCheck(this, ${t.id})"></td>
            <td class="text-primary" style="font-weight:900;">${t.id_troquel || '-'}</td>
            <td style="font-weight:700;">${t.ubicacion || '-'}</td>
            <td class="fw-bold">${t.nombre || 'Sin nombre'}</td>
            <td><span class="etiqueta-familia">${nCat}</span></td>
            <td style="color:#059669; font-weight:600;">${nFam}</td>
            <td style="max-width:200px;">${art}</td>
            <td>
                <div style="display:flex; justify-content:center; gap:5px;">
                    <button class="btn-icono" onclick="abrirVistaEditar('${t.id}')">✏️</button>
                    <button class="btn-icono" onclick="generarQR('${t.id_troquel}')">🖨️</button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

// ==========================================
// 5. ACCIONES MASIVAS
// ==========================================
window.toggleCheck = function(c, id) { 
    c.checked ? idsSeleccionados.add(id) : idsSeleccionados.delete(id); 
    // Actualizamos visualmente solo la fila para no recargar toda la tabla
    c.closest('tr').className = c.checked ? 'fila-seleccionada' : '';
    evaluarBarra();
}

window.toggleAllChecks = function(m) { 
    const checkboxes = document.querySelectorAll('.check-row'); 
    checkboxes.forEach(chk => { 
        chk.checked = m.checked; 
        const id = parseInt(chk.value);
        if (m.checked) idsSeleccionados.add(id); else idsSeleccionados.delete(id);
        chk.closest('tr').className = m.checked ? 'fila-seleccionada' : '';
    }); 
    evaluarBarra();
}

function evaluarBarra() { 
    const b = document.getElementById('barra-flotante'); 
    if(idsSeleccionados.size > 0) { 
        document.getElementById('contador-seleccionados').innerText = `${idsSeleccionados.size}`; 
        b.classList.remove('oculto'); 
    } else {
        b.classList.add('oculto'); 
    }
}

// Botón de cancelar añadido en el HTML
window.limpiarSeleccion = function() {
    idsSeleccionados.clear();
    aplicarFiltrosYOrden(); // Recarga la tabla limpia
}

window.aplicarBulk = async function(tipo) {
    const val = document.getElementById(`bulk-${tipo}`).value;
    if(!val) return alert("Elige un valor");
    await fetch(`/api/troqueles/bulk/${tipo}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: Array.from(idsSeleccionados), valor_id: parseInt(val) }) });
    idsSeleccionados.clear(); cargarDatos();
}

window.aplicarBulkBorrar = async function() {
    if(!confirm("¿Borrar seleccionados?")) return;
    await fetch('/api/troqueles/bulk/borrar', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: Array.from(idsSeleccionados) }) });
    idsSeleccionados.clear(); cargarDatos(); 
}

// ==========================================
// 6. IMPORTAR / EXPORTAR
// ==========================================
window.crearEntidad = async function(tab) {
    const n = prompt("Nombre:"); if(n) { await fetch(`/api/${tab}`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ nombre: n }) }); cargarDatos(); }
}

window.subirCSV = async function() {
    const inp = document.getElementById('input-csv-import');
    const tipo = document.getElementById('select-tipo-importacion').value;
    if(!inp.files[0]) return;
    
    if(!confirm(`¿Importar en "${tipo}"?`)) return;
    
    const fd = new FormData(); fd.append('file', inp.files[0]); fd.append('tipo_seleccionado', tipo);
    try {
        const res = await fetch('/api/importar_csv', { method: 'POST', body: fd });
        const d = await res.json();
        if(res.ok) { alert(`¡Importado! ${d.total} registros.`); cargarDatos(); } else alert("Error: "+d.detail);
    } catch(e) { alert("Error conexión"); }
}

window.exportarCSV = function() {
    if(datosExportables.length===0) return;
    let csv = "data:text/csv;charset=utf-8,\uFEFFMatricula,Ubicacion,Nombre,Tipo,Familia,Articulos\r\n";
    datosExportables.forEach(t => {
        const nCat = getNombreCat(t);
        const nFam = getNombreFam(t);
        csv += `"${t.id_troquel}","${t.ubicacion}","${t.nombre}","${nCat}","${nFam}","${t.codigos_articulo}"\r\n`;
    });
    const a = document.createElement("a"); a.href = encodeURI(csv); a.download="inventario.csv"; document.body.appendChild(a); a.click();
}

// ==========================================
// 7. EDITAR (BLINDADO)
// ==========================================
window.abrirVistaEditar = function(id_db) {
    // 1. Buscamos el troquel usando == para que coincida aunque uno sea texto y otro numero
    const t = listaTroquelesCache.find(x => x.id == id_db); 
    
    if(!t) {
        console.error("No se encuentra el ID:", id_db);
        alert("Error: No se pudo cargar el troquel.");
        return;
    }

    // 2. Rellenamos datos
    document.getElementById('input-id-db').value = t.id;
    document.getElementById('input-id').value = t.id_troquel || "";
    document.getElementById('input-ubicacion').value = t.ubicacion || "";
    document.getElementById('input-nombre').value = t.nombre || "";
    document.getElementById('input-articulos').value = t.codigos_articulo||"";
    document.getElementById('input-ot').value = t.referencias_ot||"";
    document.getElementById('input-tamano-troquel').value = t.tamano_troquel||"";
    document.getElementById('input-tamano-final').value = t.tamano_final||"";
    document.getElementById('input-archivo').value = t.enlace_archivo||"";
    document.getElementById('input-observaciones').value = t.observaciones||"";
    
    // 3. Selectores
    document.getElementById('input-categoria').value = t.categoria_id||"";
    document.getElementById('input-familia').value = t.familia_id||"";

    document.getElementById('titulo-formulario').innerText = "Editar Troquel";
    cambiarVista('vista-formulario');
}

document.getElementById('form-troquel').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id_db = document.getElementById('input-id-db').value;
    const datos = {
        id_troquel: document.getElementById('input-id').value,
        ubicacion: document.getElementById('input-ubicacion').value,
        nombre: document.getElementById('input-nombre').value,
        codigos_articulo: document.getElementById('input-articulos').value,
        referencias_ot: document.getElementById('input-ot').value,
        categoria_id: parseInt(document.getElementById('input-categoria').value)||null,
        familia_id: parseInt(document.getElementById('input-familia').value)||null,
        tamano_troquel: document.getElementById('input-tamano-troquel').value,
        tamano_final: document.getElementById('input-tamano-final').value,
        enlace_archivo: document.getElementById('input-archivo').value,
        observaciones: document.getElementById('input-observaciones').value
    };

    const url = id_db ? `/api/troqueles/${id_db}` : '/api/troqueles';
    const method = id_db ? 'PUT' : 'POST';
    await fetch(url, { method: method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(datos) });
    await cargarDatos(); document.querySelector('.menu-item').click();
});

// ==========================================
// 8. QR GODEX (CORREGIDO)
// ==========================================
window.generarQR = function(id_troquel) {
    const t = listaTroquelesCache.find(x => x.id_troquel == id_troquel); 
    if(!t) return alert("Troquel no encontrado");
    
    document.getElementById('modal-qr').classList.remove('oculto');
    // UBI en Grande
    document.getElementById('qr-texto-ubi').innerText = t.ubicacion || "SIN UBI";
    // ID pequeño
    document.getElementById('qr-texto-id').innerText = t.id_troquel;
    // Nombre recortado
    document.getElementById('qr-texto-desc').innerText = t.nombre ? t.nombre.substring(0, 30) : "";
    
    new QRious({ element: document.getElementById('qr-canvas'), value: t.id_troquel, size: 200, padding: 0, level: 'M' });
}

window.cargarHistorial = async function() { try { const res = await fetch('/api/historial'); const d = await res.json(); document.getElementById('lista-historial').innerHTML = d.map(h => `<tr><td class="text-muted">${new Date(h.fecha_hora).toLocaleString()}</td><td class="fw-bold">${h.troqueles?.nombre||'Eliminado'}</td><td>${h.accion}</td></tr>`).join(''); } catch(e){} }
window.iniciarEscaneo = function() { document.getElementById('contenedor-camara').classList.remove('oculto'); html5QrCode = new Html5Qrcode("reader"); html5QrCode.start({facingMode:"environment"}, {fps:10, qrbox:250}, (txt)=>{ window.detenerEscaneo(); document.querySelector('.menu-item').click(); document.getElementById('buscador').value=txt; aplicarFiltrosYOrden(); }).catch(()=>{ window.detenerEscaneo(); }); }
window.detenerEscaneo = function() { if(html5QrCode) html5QrCode.stop().then(() => { html5QrCode.clear(); document.getElementById('contenedor-camara').classList.add('oculto'); }); else document.getElementById('contenedor-camara').classList.add('oculto'); }

// ==========================================
// ARRANQUE
// ==========================================
if(typeof window !== 'undefined') window.addEventListener('load', cargarDatos);