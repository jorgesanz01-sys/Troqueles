const inputBuscador = document.getElementById('buscador');
const btnLimpiar = document.getElementById('btn-limpiar');
const contenedor = document.getElementById('grid-troqueles');

// 1. Mostrar/Ocultar la "X" y filtrar
inputBuscador.addEventListener('input', () => {
    if (inputBuscador.value.length > 0) {
        btnLimpiar.classList.remove('oculto');
    } else {
        btnLimpiar.classList.add('oculto');
    }
    // Aquí podrías filtrar localmente para que sea instantáneo
});

// 2. Limpiar buscador
btnLimpiar.addEventListener('click', () => {
    inputBuscador.value = '';
    btnLimpiar.classList.add('oculto');
    cargarTroqueles(); // Recarga la lista completa
});

// 3. Cargar datos desde nuestra API de Python en Vercel
async function cargarTroqueles() {
    try {
        const respuesta = await fetch('/api/troqueles');
        const datos = await respuesta.json();
        
        contenedor.innerHTML = ''; // Limpiar pantalla
        
        datos.forEach(t => {
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <h3>${t.nombre}</h3>
                <p><strong>Ubicación:</strong> ${t.ubicacion}</p>
                <p><small>ID: ${t.id_troquel}</small></p>
            `;
            contenedor.appendChild(card);
        });
    } catch (error) {
        console.error("Error cargando troqueles:", error);
    }
}

// Iniciar carga al abrir la web
cargarTroqueles();