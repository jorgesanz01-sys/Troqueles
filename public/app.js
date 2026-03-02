const buscador = document.getElementById('buscador');
const btnLimpiar = document.getElementById('btn-limpiar');
const contenedorGrid = document.getElementById('grid-troqueles');
const contenedorCamara = document.getElementById('contenedor-camara');
const selectCategorias = document.getElementById('input-categoria');
let html5QrCode;
let listaTroquelesCache = []; 

// --- 1. CARGA INICIAL (Troqueles y Familias) ---
async function cargarDatos() {
    try {
        // Cargar Categorías
        const resCat = await fetch('/api/categorias');
        const categorias = await resCat.json();
        llenarSelectCategorias(categorias);

        // Cargar Troqueles
        const resTroq = await fetch('/api/troqueles');
        const datos = await resTroq.json();
        listaTroquelesCache = datos; 
        renderizarTarjetas(datos);
    } catch (error) {
        contenedorGrid.innerHTML = '<p style="color:red; padding: 20px;">Error de conexión.</p>';
    }
}

function llenarSelectCategorias(categorias) {
    selectCategorias.innerHTML = '<option value="">Selecciona Familia...</option>';
    categorias.forEach(cat => {
        selectCategorias.innerHTML += `<option value="${cat.id}">${cat.nombre}</option>`;
    });
}

function renderizarTarjetas(datos) {
    if (datos.length === 0) {
        contenedorGrid.innerHTML = '<p style="padding: 20px;">No hay troqueles para mostrar.</p>';
        return;
    }

    contenedorGrid.innerHTML = datos.map(troquel => {
        const nombreFamilia = troquel.categorias?.nombre || 'Sin Familia';
        const obs = troquel.observaciones ? `<p><strong>Obs:</strong> ${troquel.observaciones}</p>` : '';
        const tam = (troquel.tamano_troquel || troquel.tamano_final) 
            ? `<p><strong>Medidas:</strong> Troquel: ${troquel.tamano_troquel || '-'} | Final: ${troquel.tamano_final || '-'}</p>` 
            : '';

        return `
        <div class="tarjeta">
            <div>
                <div style="display:flex; justify-content:space-between; align-items:start;">
                    <h3>${troquel.nombre}</h3>
                    <span class="badge" style="background:#e2e8f0; color:#475569;">${nombreFamilia}</span>
                </div>
                <p><strong>Ubicación:</strong> ${troquel.ubicacion || 'Sin asignar'}</p>
                <p><strong>ID:</strong> <span class="badge">${troquel.id_troquel}</span></p>
                ${tam}
                ${obs}
            </div>
            <div class="tarjeta-acciones" style="display:flex; justify-content:space-between; margin-top:15px;">
                <button class="btn-secundario" onclick="abrirModalQR('${troquel.id_troquel}')">🖨️ Imprimir QR</button>
                <button class="btn-peligro" onclick="moverAPapelera(${troquel.id})">🗑️</button>
            </div>
        </div>
        `;
    }).join('');
}

// --- 2. BUSCADOR GLOBAL "PRO" ---
buscador.addEventListener('input', () => {
    btnLimpiar.classList.toggle('oculto', buscador.value === '');
    filtrarResultados(buscador.value);
});

btnLimpiar.addEventListener('click', () => {
    buscador.value = '';
    btnLimpiar.classList.add('oculto');
    renderizarTarjetas(listaTroquelesCache); 
});

function filtrarResultados(texto) {
    const txt = texto.toLowerCase();
    const filtrados = listaTroquelesCache.filter(t => {
        const nomCat = t.categorias?.nombre?.toLowerCase() || "";
        return (
            (t.nombre && t.nombre.toLowerCase().includes(txt)) || 
            (t.id_troquel && t.id_troquel.toLowerCase().includes(txt)) ||
            (t.observaciones && t.observaciones.toLowerCase().includes(txt)) ||
            (nomCat.includes(txt))
        );
    });
    renderizarTarjetas(filtrados);
}

// --- 3. NUEVO TROQUEL ---
function abrirModalNuevo() { document.getElementById('modal-nuevo').classList.remove('oculto'); }
function cerrarModalNuevo() { document.getElementById('modal-nuevo').classList.add('oculto'); }

document.getElementById('form-nuevo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nuevoTroquel = {
        id_troquel: document.getElementById('input-id').value,
        nombre: document.getElementById('input-nombre').value,
        ubicacion: document.getElementById('input-ubicacion').value,
        categoria_id: parseInt(document.getElementById('input-categoria').value) || null,
        tamano_troquel: document.getElementById('input-tamano-troquel').value,
        tamano_final: document.getElementById('input-tamano-final').value,
        observaciones: document.getElementById('input-observaciones').value
    };

    try {
        await fetch('/api/troqueles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(nuevoTroquel)
        });
        document.getElementById('form-nuevo').reset();
        cerrarModalNuevo();
        cargarDatos();
    } catch (error) { alert("Error al guardar."); }
});

// --- 4. CÓDIGO QR Y ESCÁNER (Igual que antes) ---
function abrirModalQR(id) {
    document.getElementById('modal-qr').classList.remove('oculto');
    document.getElementById('qr-texto-id').innerText = id;
    new QRious({ element: document.getElementById('qr-canvas'), value: id, size: 200 });
}
function cerrarModalQR() { document.getElementById('modal-qr').classList.add('oculto'); }

async function moverAPapelera(id_db) {
    if (confirm("¿Mover este troquel a la papelera?")) {
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
            btnLimpiar.classList.remove('oculto'); filtrarResultados(texto);
        }, () => {}
    ).catch(() => detenerEscaneo());
}

function detenerEscaneo() {
    if (html5QrCode) html5QrCode.stop().then(() => { html5QrCode.clear(); contenedorCamara.classList.add('oculto'); });
    else contenedorCamara.classList.add('oculto');
}

// Iniciar aplicación
cargarDatos();