const buscador = document.getElementById('buscador');
const btnLimpiar = document.getElementById('btn-limpiar');
const contenedorGrid = document.getElementById('grid-troqueles');
const contenedorCamara = document.getElementById('contenedor-camara');
let html5QrCode;
let listaTroquelesCache = []; 

// --- 1. BUSCADOR (REGLA DE ORO) ---
buscador.addEventListener('input', () => {
    if (buscador.value.length > 0) {
        btnLimpiar.classList.remove('oculto');
    } else {
        btnLimpiar.classList.add('oculto');
    }
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
        contenedorGrid.innerHTML = '<p style="color:red; padding: 20px;">Error al conectar con el servidor.</p>';
        console.error(error);
    }
}

function renderizarTarjetas(datos) {
    if (datos.length === 0) {
        contenedorGrid.innerHTML = '<p style="padding: 20px;">No hay troqueles activos para mostrar.</p>';
        return;
    }

    // Aquí usamos las clases exactas de tu CSS (tarjeta, badge, btn-peligro)
    contenedorGrid.innerHTML = datos.map(troquel => `
        <div class="tarjeta">
            <div>
                <h3>${troquel.nombre}</h3>
                <p><strong>Ubicación:</strong> ${troquel.ubicacion || 'Sin asignar'}</p>
                <p><strong>ID:</strong> <span class="badge">${troquel.id_troquel}</span></p>
            </div>
            <div class="tarjeta-acciones">
                <button class="btn-peligro" onclick="moverAPapelera(${troquel.id})">🗑️ Papelera</button>
            </div>
        </div>
    `).join('');
}

// --- 3. SOFT DELETE ---
async function moverAPapelera(id_db) {
    if (confirm("¿Estás seguro de mover este troquel a la papelera?")) {
        try {
            await fetch(`/api/borrar/${id_db}`, { method: 'POST' });
            cargarDatos(); 
        } catch (error) {
            alert("Hubo un error al mover a la papelera.");
        }
    }
}

// --- 4. LECTOR QR ---
function iniciarEscaneo() {
    contenedorCamara.classList.remove('oculto');
    html5QrCode = new Html5Qrcode("reader");
    
    html5QrCode.start(
        { facingMode: "environment" }, 
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (textoDecodificado) => {
            detenerEscaneo();
            buscador.value = textoDecodificado;
            btnLimpiar.classList.remove('oculto');
            filtrarResultados(textoDecodificado);
        },
        (errorMensaje) => { /* Ignorar errores de enfoque */ }
    ).catch(err => {
        alert("No se pudo acceder a la cámara.");
        detenerEscaneo();
    });
}

function detenerEscaneo() {
    if (html5QrCode) {
        html5QrCode.stop().then(() => {
            html5QrCode.clear();
            contenedorCamara.classList.add('oculto');
        });
    } else {
        contenedorCamara.classList.add('oculto');
    }
}

// --- 5. FILTRADO RÁPIDO ---
function filtrarResultados(texto) {
    const textoLimpio = texto.toLowerCase();
    const filtrados = listaTroquelesCache.filter(t => 
        t.nombre.toLowerCase().includes(textoLimpio) || 
        t.id_troquel.toLowerCase().includes(textoLimpio)
    );
    renderizarTarjetas(filtrados);
}

// Iniciar aplicación
cargarDatos();