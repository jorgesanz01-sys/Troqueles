const buscador = document.getElementById('buscador');
const btnLimpiar = document.getElementById('btn-limpiar');
const tbodyLista = document.getElementById('lista-troqueles'); // Cambiado a tbody
const contenedorCamara = document.getElementById('contenedor-camara');
const selectCategorias = document.getElementById('input-categoria');
const contenedorChips = document.getElementById('contenedor-chips');

let html5QrCode;
let listaTroquelesCache = []; 
let familiaActiva = 'TODOS';

// --- NUEVAS VARIABLES DE ORDENACIÓN ---
let columnaOrden = 'id_troquel'; 
let ordenAscendente = true;

async function cargarDatos() {
    try {
        const resCat = await fetch('/api/categorias');
        const categorias = await resCat.json();
        llenarDesplegablesYChips(categorias);

        const resTroq = await fetch('/api/troqueles');
        const datos = await resTroq.json();
        listaTroquelesCache = datos; 
        aplicarFiltrosYOrden(); 
    } catch (error) {
        tbodyLista.innerHTML = '<tr><td colspan="7" class="error-msg">Error conectando al servidor.</td></tr>';
    }
}

function llenarDesplegablesYChips(categorias) {
    selectCategorias.innerHTML = '<option value="">Seleccionar...</option>';
    contenedorChips.innerHTML = '<button class="chip activo" onclick="filtrarPorChip(\'TODOS\', this)">Todos</button>';
    categorias.forEach(cat => {
        selectCategorias.innerHTML += `<option value="${cat.id}">${cat.nombre}</option>`;
        contenedorChips.innerHTML += `<button class="chip" onclick="filtrarPorChip('${cat.nombre}', this)">${cat.nombre}</button>`;
    });
}

// --- NUEVO SISTEMA DE ORDENACIÓN ---
window.ordenarPor = function(columna) {
    if (columnaOrden === columna) {
        ordenAscendente = !ordenAscendente; // Invertir orden si se hace clic en la misma
    } else {
        columnaOrden = columna;
        ordenAscendente = true; // Por defecto A-Z al cambiar de columna
    }
    aplicarFiltrosYOrden();
}

function aplicarFiltrosYOrden() {
    const texto = buscador.value.toLowerCase();
    
    // 1. Filtrar
    let procesados = listaTroquelesCache.filter(t => {
        const catNom = t.categorias?.nombre || 'General';
        const pasaFamilia = (familiaActiva === 'TODOS') || (catNom === familiaActiva);
        const pasaTexto = (
            (t.nombre && t.nombre.toLowerCase().includes(texto)) || 
            (t.id_troquel && t.id_troquel.toLowerCase().includes(texto)) ||
            (t.observaciones && t.observaciones.toLowerCase().includes(texto))
        );
        return pasaFamilia && pasaTexto;
    });

    // 2. Ordenar
    procesados.sort((a, b) => {
        let valorA, valorB;
        
        // Manejar el caso especial de la familia (está dentro del objeto 'categorias')
        if (columnaOrden === 'familia') {
            valorA = (a.categorias?.nombre || "").toLowerCase();
            valorB = (b.categorias?.nombre || "").toLowerCase();
        } else {
            valorA = (a[columnaOrden] || "").toString().toLowerCase();
            valorB = (b[columnaOrden] || "").toString().toLowerCase();
        }

        if (valorA < valorB) return ordenAscendente ? -1 : 1;
        if (valorA > valorB) return ordenAscendente ? 1 : -1;
        return 0;
    });

    renderizarLista(procesados);
}

// --- RENDERIZADO DE TABLA (MODO LISTA) ---
function renderizarLista(datos) {
    if (datos.length === 0) {
        tbodyLista.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px; color:#64748b;">No se encontraron troqueles.</td></tr>';
        return;
    }

    tbodyLista.innerHTML = datos.map(troquel => {
        const catNombre = troquel.categorias?.nombre || 'General';
        const obs = troquel.observaciones ? `<span class="obs-pildora" title="${troquel.observaciones}">${troquel.observaciones}</span>` : '-';
        
        return `
        <tr>
            <td class="codigo-id">${troquel.id_troquel}</td>
            <td class="fw-bold">${troquel.nombre}</td>
            <td><span class="etiqueta-familia">${catNombre}</span></td>
            <td class="ubicacion-celda">📍 ${troquel.ubicacion || '-'}</td>
            <td class="medidas-celda">${troquel.tamano_troquel || '-'} <br> <small class="text-muted">F: ${troquel.tamano_final || '-'}</small></td>
            <td class="obs-celda">${obs}</td>
            <td>
                <div class="acciones-tabla">
                    <button class="btn-icono" onclick="abrirModalQR('${troquel.id_troquel}')" title="Imprimir QR">🖨️</button>
                    <button class="btn-icono" onclick="abrirModalEditar(${troquel.id})" title="Editar">✏️</button>
                    <button class="btn-icono peligro" onclick="moverAPapelera(${troquel.id})" title="Papelera">🗑️</button>
                </div>
            </td>
        </tr>
        `;
    }).join('');
}

// --- EVENTOS DE BÚSQUEDA ---
buscador.addEventListener('input', () => {
    btnLimpiar.classList.toggle('oculto', buscador.value === '');
    aplicarFiltrosYOrden();
});

btnLimpiar.addEventListener('click', () => {
    buscador.value = '';
    btnLimpiar.classList.add('oculto');
    aplicarFiltrosYOrden();
});

window.filtrarPorChip = function(familia, botonElement) {
    familiaActiva = familia;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('activo'));
    botonElement.classList.add('activo');
    aplicarFiltrosYOrden();
}

// --- MODALES Y ACCIONES CRUD ---
function abrirModalFormulario() {
    document.getElementById('form-troquel').reset();
    document.getElementById('input-id-db').value = ""; 
    document.getElementById('modal-titulo').innerText = "Nuevo Troquel";
    document.getElementById('modal-formulario').classList.remove('oculto');
}

window.abrirModalEditar = function(id_db) {
    const troquel = listaTroquelesCache.find(t => t.id === id_db);
    if (!troquel) return;
    document.getElementById('input-id-db').value = troquel.id;
    document.getElementById('input-id').value = troquel.id_troquel;
    document.getElementById('input-categoria').value = troquel.categoria_id || "";
    document.getElementById('input-nombre').value = troquel.nombre;
    document.getElementById('input-ubicacion').value = troquel.ubicacion;
    document.getElementById('input-tamano-troquel').value = troquel.tamano_troquel || "";
    document.getElementById('input-tamano-final').value = troquel.tamano_final || "";
    document.getElementById('input-observaciones').value = troquel.observaciones || "";

    document.getElementById('modal-titulo').innerText = "Editar Troquel";
    document.getElementById('modal-formulario').classList.remove('oculto');
}

function cerrarModalFormulario() { document.getElementById('modal-formulario').classList.add('oculto'); }

document.getElementById('form-troquel').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id_db = document.getElementById('input-id-db').value;
    const datos = {
        id_troquel: document.getElementById('input-id').value,
        nombre: document.getElementById('input-nombre').value,
        ubicacion: document.getElementById('input-ubicacion').value,
        categoria_id: parseInt(document.getElementById('input-categoria').value) || null,
        tamano_troquel: document.getElementById('input-tamano-troquel').value,
        tamano_final: document.getElementById('input-tamano-final').value,
        observaciones: document.getElementById('input-observaciones').value
    };

    try {
        if (id_db) await fetch(`/api/troqueles/${id_db}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) });
        else await fetch('/api/troqueles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) });
        cerrarModalFormulario(); cargarDatos();
    } catch (error) { alert("Error al guardar."); }
});

function abrirModalQR(id) {
    document.getElementById('modal-qr').classList.remove('oculto');
    document.getElementById('qr-texto-id').innerText = id;
    new QRious({ element: document.getElementById('qr-canvas'), value: id, size: 250 });
}
function cerrarModalQR() { document.getElementById('modal-qr').classList.add('oculto'); }

async function moverAPapelera(id_db) {
    if (confirm("¿Confirmar baja física del troquel?")) {
        await fetch(`/api/borrar/${id_db}`, { method: 'POST' });
        cargarDatos(); 
    }
}

function iniciarEscaneo() {
    contenedorCamara.classList.remove('oculto');
    html5QrCode = new Html5Qrcode("reader");
    html5QrCode.start(
        { facingMode: "environment" }, { fps: 10, qrbox: 250 },
        (texto) => {
            detenerEscaneo(); buscador.value = texto; btnLimpiar.classList.remove('oculto'); aplicarFiltrosYOrden();
        }, () => {}
    ).catch(() => detenerEscaneo());
}

function detenerEscaneo() {
    if (html5QrCode) html5QrCode.stop().then(() => { html5QrCode.clear(); contenedorCamara.classList.add('oculto'); });
    else contenedorCamara.classList.add('oculto');
}

cargarDatos();