// ==========================================
// VARIABLES GLOBALES DE ESTADO
// ==========================================
let listaTroquelesCache = []; 
let familiaActiva = 'TODOS';
let columnaOrden = 'id_troquel'; 
let ordenAscendente = true;
let html5QrCode;

// ==========================================
// 1. NAVEGACIÓN Y CONTROL DE VISTAS (ERP MODULES)
// ==========================================
window.cambiarVista = function(idVista, btnElement) {
    // Ocultar todas las vistas
    document.querySelectorAll('.vista').forEach(v => v.classList.add('oculto'));
    // Mostrar la solicitada
    document.getElementById(idVista).classList.remove('oculto');
    
    // Cambiar estado visual del menú
    document.querySelectorAll('.menu-item').forEach(b => b.classList.remove('activo'));
    if(btnElement) btnElement.classList.add('activo');
}

window.abrirVistaCrear = function(btnElement) {
    // Limpiamos el formulario completamente para un alta nueva
    document.getElementById('form-troquel').reset();
    document.getElementById('input-id-db').value = "";
    document.getElementById('titulo-formulario').innerText = "Alta de Nuevo Troquel";
    
    cambiarVista('vista-formulario', btnElement);
}

// ==========================================
// 2. CARGA INICIAL DE BASE DE DATOS
// ==========================================
async function cargarDatos() {
    try {
        // Cargar Categorías (Familias)
        const resCat = await fetch('/api/categorias');
        const categorias = await resCat.json();
        
        const select = document.getElementById('input-categoria');
        const chips = document.getElementById('contenedor-chips');
        
        select.innerHTML = '<option value="">Seleccionar...</option>';
        chips.innerHTML = '<button class="chip activo" onclick="filtrarPorChip(\'TODOS\', this)">Todas las Familias</button>';
        
        categorias.forEach(cat => {
            select.innerHTML += `<option value="${cat.id}">${cat.nombre}</option>`;
            chips.innerHTML += `<button class="chip" onclick="filtrarPorChip('${cat.nombre}', this)">${cat.nombre}</button>`;
        });

        // Cargar Troqueles Activos
        const resTroq = await fetch('/api/troqueles');
        listaTroquelesCache = await resTroq.json();
        
        // Procesar y dibujar en pantalla
        aplicarFiltrosYOrden();

    } catch (error) {
        console.error("Error de conexión:", error);
        document.getElementById('lista-troqueles').innerHTML = 
            '<tr><td colspan="8" class="text-center" style="color:red; padding:40px;">Error conectando al servidor.</td></tr>';
    }
}

// ==========================================
// 3. MOTOR DE FILTRADO Y ORDENACIÓN
// ==========================================
window.ordenarPor = function(columna) {
    // Si hace clic en la misma columna, invierte el orden. Si es nueva, ordena de A-Z.
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
    // Efecto visual en los chips
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('activo'));
    btnElement.classList.add('activo');
    aplicarFiltrosYOrden();
}

// Listener para el buscador de texto
document.getElementById('buscador').addEventListener('input', aplicarFiltrosYOrden);

function aplicarFiltrosYOrden() {
    const texto = document.getElementById('buscador').value.toLowerCase();
    
    // 1. Filtrado Cruzado
    let procesados = listaTroquelesCache.filter(t => {
        const catNom = t.categorias?.nombre || '';
        const pasaFam = (familiaActiva === 'TODOS') || (catNom === familiaActiva);
        const pasaTxt = (
            (t.nombre && t.nombre.toLowerCase().includes(texto)) || 
            (t.id_troquel && t.id_troquel.toLowerCase().includes(texto)) ||
            (t.observaciones && t.observaciones.toLowerCase().includes(texto))
        );
        return pasaFam && pasaTxt;
    });

    // 2. Ordenación Dinámica
    procesados.sort((a, b) => {
        let valA, valB;
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

    renderizarTabla(procesados);
}

// ==========================================
// 4. RENDERIZADO VISUAL
// ==========================================
function renderizarTabla(datos) {
    const tbody = document.getElementById('lista-troqueles');
    
    if (datos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding:40px;">No se encontraron resultados.</td></tr>';
        return;
    }

    tbody.innerHTML = datos.map(t => {
        // Construimos el botón del PDF de forma segura
        let pdfLink = '-';
        if (t.enlace_archivo && t.enlace_archivo.trim() !== '') {
            pdfLink = `<a href="${t.enlace_archivo}" target="_blank" class="btn-pdf">📄 Ver PDF</a>`;
        }

        return `
        <tr>
            <td class="fw-bold text-primary">${t.id_troquel}</td>
            <td class="fw-bold">${t.nombre}</td>
            <td><span class="etiqueta-familia">${t.categorias?.nombre || '-'}</span></td>
            <td>📍 ${t.ubicacion || '-'}</td>
            <td>${t.tamano_troquel || '-'}</td>
            <td>${t.tamano_final || '-'}</td>
            <td class="text-center">${pdfLink}</td>
            <td>
                <div style="display:flex; justify-content:center;">
                    <button class="btn-icono" onclick="abrirVistaEditar(${t.id})" title="Editar Troquel">✏️</button>
                    <button class="btn-icono" onclick="generarQR('${t.id_troquel}')" title="Imprimir Etiqueta QR">🖨️</button>
                    <button class="btn-icono peligro" onclick="borrar(${t.id})" title="Dar de Baja (Papelera)">🗑️</button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

// ==========================================
// 5. AUDITORÍA / HISTORIAL
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
                <td class="fw-bold" style="color: var(--text-muted);">${new Date(h.fecha_hora).toLocaleString()}</td>
                <td class="fw-bold">${h.troqueles ? `[${h.troqueles.id_troquel}] ${h.troqueles.nombre}` : 'Troquel Eliminado'}</td>
                <td>${h.accion}</td>
            </tr>
        `).join('');
    } catch (e) {
        console.error("Error cargando historial", e);
    }
}

// ==========================================
// 6. LÓGICA DE FORMULARIO CRUD
// ==========================================
window.abrirVistaEditar = function(id_db) {
    const t = listaTroquelesCache.find(x => x.id === id_db);
    if (!t) return;

    // Rellenamos datos en el formulario
    document.getElementById('input-id-db').value = t.id;
    document.getElementById('input-id').value = t.id_troquel;
    document.getElementById('input-categoria').value = t.categoria_id || "";
    document.getElementById('input-nombre').value = t.nombre;
    document.getElementById('input-ubicacion').value = t.ubicacion;
    document.getElementById('input-tamano-troquel').value = t.tamano_troquel || "";
    document.getElementById('input-tamano-final').value = t.tamano_final || "";
    document.getElementById('input-archivo').value = t.enlace_archivo || "";
    document.getElementById('input-observaciones').value = t.observaciones || "";
    
    document.getElementById('titulo-formulario').innerText = "Editar Ficha de Troquel";
    cambiarVista('vista-formulario');
    
    // Desmarcar menú izquierdo
    document.querySelectorAll('.menu-item').forEach(b => b.classList.remove('activo'));
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
        enlace_archivo: document.getElementById('input-archivo').value,
        observaciones: document.getElementById('input-observaciones').value
    };

    try {
        if (id_db) {
            // Editar existente (PUT)
            await fetch(`/api/troqueles/${id_db}`, { 
                method: 'PUT', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify(datosFormulario) 
            });
        } else {
            // Crear nuevo (POST)
            await fetch('/api/troqueles', { 
                method: 'POST', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify(datosFormulario) 
            });
        }
        
        await cargarDatos();
        
        // Volvemos automáticamente a la lista pulsando el botón del menú
        document.querySelector('.menu-item').click(); 
        
    } catch (error) {
        alert("Ocurrió un error al intentar guardar en la base de datos.");
    }
});

window.borrar = async function(id_db) {
    if(confirm("¿Estás seguro de que quieres dar de baja este troquel?")) {
        await fetch(`/api/borrar/${id_db}`, { method: 'POST' });
        cargarDatos();
    }
}

// ==========================================
// 7. GESTIÓN DE CÓDIGOS QR Y CÁMARA
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
            
            // Forzamos ir a la vista de lista
            document.querySelector('.menu-item').click(); 
            
            // Insertamos el texto en el buscador y filtramos
            document.getElementById('buscador').value = textoScaneado;
            aplicarFiltrosYOrden();
        }, 
        (errorMessage) => { /* Ignorar errores de enfoque de cámara */ }
    ).catch((err) => {
        alert("Error al iniciar cámara. Verifica los permisos del navegador.");
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
// INICIO DE LA APLICACIÓN
// ==========================================
cargarDatos();