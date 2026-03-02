const buscador = document.getElementById('buscador');
const btnLimpiar = document.getElementById('btn-limpiar');
const contenedorGrid = document.getElementById('grid-troqueles');
const contenedorCamara = document.getElementById('contenedor-camara');
const selectCategorias = document.getElementById('input-categoria');
const contenedorChips = document.getElementById('contenedor-chips');

let html5QrCode;
let listaTroquelesCache = []; 
let familiaActiva = 'TODOS';

// --- 1. INICIALIZACIÓN PRO ---
async function cargarDatos() {
    try {
        const resCat = await fetch('/api/categorias');
        const categorias = await resCat.json();
        llenarDesplegablesYChips(categorias);

        const resTroq = await fetch('/api/troqueles');
        const datos = await resTroq.json();
        listaTroquelesCache = datos; 
        aplicarFiltrosCruzados(); // Renderiza usando buscador + chip
    } catch (error) {
        contenedorGrid.innerHTML = '<p class="error-msg">Error conectando al servidor MES.</p>';
    }
}

function llenarDesplegablesYChips(categorias) {
    // 1. Llenar el <select> del formulario
    selectCategorias.innerHTML = '<option value="">Seleccionar...</option>';
    
    // 2. Limpiar chips visuales dejando solo el "Todos"
    contenedorChips.innerHTML = '<button class="chip activo" onclick="filtrarPorChip(\'TODOS\', this)">Todos</button>';

    categorias.forEach(cat => {
        selectCategorias.innerHTML += `<option value="${cat.id}">${cat.nombre}</option>`;
        contenedorChips.innerHTML += `<button class="chip" onclick="filtrarPorChip('${cat.nombre}', this)">${cat.nombre}</button>`;
    });
}

// --- 2. RENDERIZADO VISUAL IMPACTANTE ---
function renderizarTarjetas(datos) {
    if (datos.length === 0) {
        contenedorGrid.innerHTML = '<div class="empty-state">No se encontraron troqueles.</div>';
        return;
    }

    contenedorGrid.innerHTML = datos.map(troquel => {
        const catNombre = troquel.categorias?.nombre || 'General';
        return `
        <div class="tarjeta-pro">
            <div class="tarjeta-header">
                <span class="etiqueta-familia">${catNombre}</span>
                <span class="codigo-id">${troquel.id_troquel}</span>
            </div>
            <div class="tarjeta-body">
                <h3>${troquel.nombre}</h3>
                <p class="ubicacion">📍 ${troquel.ubicacion || 'Sin asignar'}</p>
                <div class="medidas-grid">
                    <div class="medida-box">
                        <small>Troquel</small>
                        <span>${troquel.tamano_troquel || '-'}</span>
                    </div>
                    <div class="medida-box">
                        <small>Trabajo</small>
                        <span>${troquel.tamano_final || '-'}</span>
                    </div>
                </div>
                ${troquel.observaciones ? `<p class="observaciones">⚠️ ${troquel.observaciones}</p>` : ''}
            </div>
            <div class="tarjeta-footer">
                <div class="acciones-izq">
                    <button class="btn-icono" onclick="abrirModalQR('${troquel.id_troquel}')" title="Imprimir QR">🖨️</button>
                    <button class="btn-icono" onclick="abrirModalEditar(${troquel.id})" title="Editar">✏️</button>
                </div>
                <button class="btn-icono peligro" onclick="moverAPapelera(${troquel.id})" title="Papelera">🗑️</button>
            </div>
        </div>
        `;
    }).join('');
}

// --- 3. FILTROS CRUZADOS (Buscador + Chips) ---
buscador.addEventListener('input', () => {
    btnLimpiar.classList.toggle('oculto', buscador.value === '');
    aplicarFiltrosCruzados();
});

btnLimpiar.addEventListener('click', () => {
    buscador.value = '';
    btnLimpiar.classList.add('oculto');
    aplicarFiltrosCruzados();
});

window.filtrarPorChip = function(familia, botonElement) {
    familiaActiva = familia;
    // Actualizar estilos visuales de los chips
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('activo'));
    botonElement.classList.add('activo');
    aplicarFiltrosCruzados();
}

function aplicarFiltrosCruzados() {
    const texto = buscador.value.toLowerCase();
    
    const filtrados = listaTroquelesCache.filter(t => {
        const catNom = t.categorias?.nombre || 'General';
        
        // 1. Cumple la familia?
        const pasaFamilia = (familiaActiva === 'TODOS') || (catNom === familiaActiva);
        
        // 2. Cumple el texto?
        const pasaTexto = (
            (t.nombre && t.nombre.toLowerCase().includes(texto)) || 
            (t.id_troquel && t.id_troquel.toLowerCase().includes(texto)) ||
            (t.observaciones && t.observaciones.toLowerCase().includes(texto))
        );

        return pasaFamilia && pasaTexto;
    });

    renderizarTarjetas(filtrados);
}

// --- 4. SISTEMA DE EDICIÓN Y CREACIÓN UNIFICADO ---
function abrirModalFormulario() {
    document.getElementById('form-troquel').reset();
    document.getElementById('input-id-db').value = ""; // ID vacío = Nuevo
    document.getElementById('modal-titulo').innerText = "Nuevo Troquel";
    document.getElementById('modal-formulario').classList.remove('oculto');
}

window.abrirModalEditar = function(id_db) {
    const troquel = listaTroquelesCache.find(t => t.id === id_db);
    if (!troquel) return;

    // Rellenamos el formulario con los datos existentes
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

function cerrarModalFormulario() { 
    document.getElementById('modal-formulario').classList.add('oculto'); 
}

document.getElementById('form-troquel').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id_db = document.getElementById('input-id-db').value;
    const datosFormulario = {
        id_troquel: document.getElementById('input-id').value,
        nombre: document.getElementById('input-nombre').value,
        ubicacion: document.getElementById('input-ubicacion').value,
        categoria_id: parseInt(document.getElementById('input-categoria').value) || null,
        tamano_troquel: document.getElementById('input-tamano-troquel').value,
        tamano_final: document.getElementById('input-tamano-final').value,
        observaciones: document.getElementById('input-observaciones').value
    };

    try {
        if (id_db) {
            // MODO EDICIÓN (PUT)
            await fetch(`/api/troqueles/${id_db}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(datosFormulario)
            });
        } else {
            // MODO CREACIÓN (POST)
            await fetch('/api/troqueles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(datosFormulario)
            });
        }
        
        cerrarModalFormulario();
        cargarDatos();
    } catch (error) { alert("Error al procesar la operación."); }
});

// --- 5. FUNCIONES RESTANTES (QR, Escáner, Papelera) ---
// (Misma lógica exacta que la versión anterior para estas funciones)
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
            detenerEscaneo(); buscador.value = texto;
            btnLimpiar.classList.remove('oculto'); aplicarFiltrosCruzados();
        }, () => {}
    ).catch(() => detenerEscaneo());
}

function detenerEscaneo() {
    if (html5QrCode) html5QrCode.stop().then(() => { html5QrCode.clear(); contenedorCamara.classList.add('oculto'); });
    else contenedorCamara.classList.add('oculto');
}

cargarDatos();