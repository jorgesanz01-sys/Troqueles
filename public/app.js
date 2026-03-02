const buscador = document.getElementById('buscador');
const btnLimpiar = document.getElementById('btn-limpiar');
const contenedorGrid = document.getElementById('grid-troqueles');
const contenedorCamara = document.getElementById('contenedor-camara');
let html5QrCode;
let listaTroquelesCache = []; 

// --- 1. BUSCADOR (REGLA DE ORO) ---
buscador.addEventListener('input', () => {
    btnLimpiar.classList.toggle('oculto', buscador.value === '');
    filtrarResultados(buscador.value);
});

btnLimpiar.addEventListener('click', () => {
    buscador.value = '';
    btnLimpiar.classList.add('oculto');
    renderizarTarjetas(listaTroquelesCache); 
});

// --- 2. COMUNICACIÓN CON PYTHON ---
async function cargarDatos() {
    try {
        const respuesta = await fetch('/api/troqueles');
        const datos = await respuesta.json();
        listaTroquelesCache = datos; 
        renderizarTarjetas(datos);
    } catch (error) {
        contenedorGrid.innerHTML = '<p style="color:red; padding: 20px;">Error al conectar.</p>';
    }
}

function renderizarTarjetas(datos) {
    if (datos.length === 0) {
        contenedorGrid.innerHTML = '<p style="padding: 20px;">No hay troqueles activos.</p>';
        return;
    }

    contenedorGrid.innerHTML = datos.map(troquel => `
        <div class="tarjeta">
            <div>
                <h3>${troquel.nombre}</h3>
                <p><strong>Ubicación:</strong> ${troquel.ubicacion || 'Sin asignar'}</p>
                <p><strong>ID:</strong> <span class="badge">${troquel.id_troquel}</span></p>
            </div>
            <div class="tarjeta-acciones" style="display:flex; justify-content:space-between;">
                <button class="btn-secundario" onclick="abrirModalQR('${troquel.id_troquel}')">🖨️ Imprimir QR</button>
                <button class="btn-peligro" onclick="moverAPapelera(${troquel.id})">🗑️</button>
            </div>
        </div>
    `).join('');
}

// --- 3. NUEVO TROQUEL (FORMULARIO) ---
function abrirModalNuevo() { document.getElementById('modal-nuevo').classList.remove('oculto'); }
function cerrarModalNuevo() { document.getElementById('modal-nuevo').classList.add('oculto'); }

document.getElementById('form-nuevo').addEventListener('submit', async (e) => {
    e.preventDefault(); // Evita que la página recargue
    
    // Recogemos los datos
    const nuevoTroquel = {
        id_troquel: document.getElementById('input-id').value,
        nombre: document.getElementById('input-nombre').value,
        ubicacion: document.getElementById('input-ubicacion').value
    };

    try {
        await fetch('/api/troqueles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(nuevoTroquel)
        });
        
        // Limpiamos form, cerramos modal y recargamos lista
        document.getElementById('form-nuevo').reset();
        cerrarModalNuevo();
        cargarDatos();
    } catch (error) {
        alert("Error al guardar el troquel.");
    }
});

// --- 4. GENERACIÓN DE QR ---
function abrirModalQR(idTroquel) {
    document.getElementById('modal-qr').classList.remove('oculto');
    document.getElementById('qr-texto-id').innerText = idTroquel;
    
    // Genera el dibujo del QR en el Canvas
    new QRious({
        element: document.getElementById('qr-canvas'),
        value: idTroquel,
        size: 200, // Tamaño en píxeles
        background: 'white',
        foreground: 'black'
    });
}
function cerrarModalQR() { document.getElementById('modal-qr').classList.add('oculto'); }

// --- 5. SOFT DELETE Y ESCÁNER (Igual que antes) ---
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
        },
        () => {}
    ).catch(() => { detenerEscaneo(); });
}

function detenerEscaneo() {
    if (html5QrCode) {
        html5QrCode.stop().then(() => { html5QrCode.clear(); contenedorCamara.classList.add('oculto'); });
    } else { contenedorCamara.classList.add('oculto'); }
}

function filtrarResultados(texto) {
    const textoLimpio = texto.toLowerCase();
    const filtrados = listaTroquelesCache.filter(t => 
        t.nombre.toLowerCase().includes(textoLimpio) || t.id_troquel.toLowerCase().includes(textoLimpio)
    );
    renderizarTarjetas(filtrados);
}

cargarDatos();