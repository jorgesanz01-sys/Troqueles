const buscador = document.getElementById('buscador');
const btnLimpiar = document.getElementById('btn-limpiar');
const contenedorGrid = document.getElementById('grid-troqueles');
const contenedorCamara = document.getElementById('contenedor-camara');
let html5QrCode;
let listaTroquelesCache = []; // Guardamos los datos para buscar rápido

// --- 1. REGLA DE ORO: BUSCADOR CON "X" ---
buscador.addEventListener('input', () => {
    // Si hay texto, mostramos la X. Si no, la ocultamos.
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
    renderizarTarjetas(listaTroquelesCache); // Mostramos todos de nuevo
});

// --- 2. COMUNICACIÓN CON PYTHON (API) ---
async function cargarDatos() {
    try {
        const respuesta = await fetch('/api/troqueles');
        const datos = await respuesta.json();
        listaTroquelesCache = datos; // Guardamos en memoria
        renderizarTarjetas(datos);
    } catch (error) {
        contenedorGrid.innerHTML = '<p style="color:red;">Error al conectar con el servidor. Revisa tu consola.</p>';
        console.error(error);
    }
}

function renderizarTarjetas(datos) {
    if (datos.length === 0) {
        contenedorGrid.innerHTML = '<p>No hay troqueles activos para mostrar.</p>';
        return;
    }

    contenedorGrid.innerHTML = datos.map(troquel => `
        <div class="tarjeta">
            <div class="tarjeta-contenido">
                <h3>${troquel.nombre}</h3>
                <p><strong>Ubicación:</strong> ${troquel.ubicacion || 'Sin asignar'}</p>
                <p><strong>ID:</strong> <span class="badge">${troquel.id_troquel}</span></p>
                <p><small>Últ. Mov: ${new Date(troquel.fecha_ultimo_mov).toLocaleDateString()}</small></p>
            </div>
            <div class="tarjeta-acciones">
                <button class="btn-peligro" onclick="moverAPapelera(${troquel.id})">🗑️ Papelera</button>
            </div>
        </div>
    `).join('');
}

// --- 3. REGLA DE ORO: SOFT DELETE ---
async function moverAPapelera(id_db) {
    if (confirm("¿Estás seguro de mover este troquel a la papelera?")) {
        try {
            await fetch(`/api/borrar/${id_db}`, { method: 'POST' });
            cargarDatos(); // Recargamos la lista actualizada
        } catch (error) {
            alert("Hubo un error al mover a la papelera.");
        }
    }
}

// --- 4. LECTOR DE CÓDIGOS QR ---
function iniciarEscaneo() {
    contenedorCamara.classList.remove('oculto');
    html5QrCode = new Html5Qrcode("reader");
    
    html5QrCode.start(
        { facingMode: "environment" }, // Cámara trasera
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (textoDecodificado) => {
            // Éxito al leer el QR
            detenerEscaneo();
            buscador.value = textoDecodificado;
            btnLimpiar.classList.remove('oculto');
            filtrarResultados(textoDecodificado);
        },
        (errorMensaje) => {
            // Ignoramos errores de lectura continuos (es normal mientras enfoca)
        }
    ).catch(err => {
        alert("No se pudo acceder a la cámara. Revisa los permisos.");
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

// Iniciar la aplicación
cargarDatos();