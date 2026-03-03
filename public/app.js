const App = {
    datos: [],
    seleccionados: new Set(),
    scanner: null,
    escaneadosTemp: new Set(), // Para el modo lote

    init: async () => {
        console.log("Iniciando ERP v5...");
        await App.cargarTodo();
        // Cargar selects
        App.cargarSelects();
    },

    // --- CARGA DE DATOS ---
    cargarTodo: async () => {
        try {
            const res = await fetch('/api/troqueles');
            App.datos = await res.json();
            App.renderTabla();
        } catch (e) { alert("Error de conexión"); }
    },

    cargarSelects: async () => {
        const [cats, fams] = await Promise.all([
            fetch('/api/categorias').then(r=>r.json()), 
            fetch('/api/familias').then(r=>r.json())
        ]);
        
        const selCat = document.getElementById('f-cat');
        const selFam = document.getElementById('f-fam');
        
        selCat.innerHTML = '<option value="">Sin Categoría</option>';
        selFam.innerHTML = '<option value="">Sin Familia</option>';
        
        cats.forEach(c => selCat.innerHTML += `<option value="${c.id}">${c.nombre}</option>`);
        fams.forEach(f => selFam.innerHTML += `<option value="${f.id}">${f.nombre}</option>`);
    },

    // --- RENDERIZADO ---
    renderTabla: () => {
        const tbody = document.getElementById('tabla-body');
        const texto = document.getElementById('buscador').value.toLowerCase();
        const estado = document.getElementById('filtro-estado').value;

        // Filtrado
        const filtrados = App.datos.filter(t => {
            const matchTexto = 
                (t.nombre||"").toLowerCase().includes(texto) || 
                (t.id_troquel||"").toLowerCase().includes(texto) ||
                (t.ubicacion||"").toLowerCase().includes(texto);
            const matchEstado = estado === "TODOS" || (t.estado === estado);
            return matchTexto && matchEstado;
        });

        if (filtrados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="padding:20px; text-align:center">No hay coincidencias</td></tr>';
            return;
        }

        tbody.innerHTML = filtrados.map(t => {
            const checked = App.seleccionados.has(t.id) ? 'checked' : '';
            const bg = App.seleccionados.has(t.id) ? '#eff6ff' : (t.estado === 'EN PRODUCCION' ? '#fff1f2' : '');
            const badge = t.estado === 'EN PRODUCCION' 
                ? '<span style="background:#e11d48; color:white; padding:2px 6px; border-radius:4px; font-size:10px;">EN PROD.</span>' 
                : '<span style="background:#22c55e; color:white; padding:2px 6px; border-radius:4px; font-size:10px;">ALMACEN</span>';

            return `
            <tr style="background:${bg}; cursor:pointer;" onclick="App.editar(${t.id})">
                <td onclick="event.stopPropagation()" style="text-align:center;">
                    <input type="checkbox" value="${t.id}" ${checked} onchange="App.select(this, ${t.id})">
                </td>
                <td>${badge}</td>
                <td style="font-weight:900; font-family:monospace; color:#0f766e;">${t.id_troquel}</td>
                <td style="font-weight:800;">${t.ubicacion}</td>
                <td>${t.nombre}</td>
                <td style="font-size:12px;">${t.categorias?.nombre || '-'}<br><span style="color:#64748b">${t.familias?.nombre || '-'}</span></td>
                <td onclick="event.stopPropagation()">
                    <button class="btn-icono" onclick="App.editar(${t.id})">✏️</button>
                </td>
            </tr>`;
        }).join('');
    },

    // --- SELECCIÓN Y MOVIMIENTOS ---
    select: (chk, id) => {
        if (chk.checked) App.seleccionados.add(id); else App.seleccionados.delete(id);
        App.updatePanel();
    },

    toggleAll: (chk) => {
        const checks = document.querySelectorAll('#tabla-body input[type="checkbox"]');
        checks.forEach(c => {
            c.checked = chk.checked;
            const id = parseInt(c.value);
            if(chk.checked) App.seleccionados.add(id); else App.seleccionados.delete(id);
        });
        App.updatePanel();
    },

    updatePanel: () => {
        const panel = document.getElementById('panel-acciones');
        document.getElementById('contador-sel').innerText = App.seleccionados.size;
        if(App.seleccionados.size > 0) {
            panel.classList.remove('oculto'); 
            App.renderTabla(); // Para pintar filas seleccionadas
        } else {
            panel.classList.add('oculto');
            App.renderTabla();
        }
    },

    limpiarSeleccion: () => {
        App.seleccionados.clear();
        document.getElementById('check-all').checked = false;
        App.updatePanel();
    },

    moverLote: async (accion) => {
        if(!confirm(`¿Vas a marcar ${App.seleccionados.size} troqueles como ${accion}?`)) return;
        
        // Si es retorno, preguntamos ubicación por si acaso quieren cambiarla en bloque (opcional)
        let destino = "";
        if (accion === 'RETORNO') {
            const change = confirm("¿Vuelven a su ubicación original? Cancelar para definir una nueva.");
            if (!change) destino = prompt("Nueva ubicación para todo el lote:");
        }

        await fetch('/api/movimientos/lote', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                ids: Array.from(App.seleccionados),
                accion: accion,
                ubicacion_destino: destino
            })
        });

        App.limpiarSeleccion();
        App.cargarTodo();
    },

    // --- CRUD ---
    nav: (vista, btn) => {
        document.querySelectorAll('.vista').forEach(v => v.classList.add('oculto'));
        document.getElementById(vista).classList.remove('oculto');
        if(btn) {
            document.querySelectorAll('.menu-item').forEach(b => b.classList.remove('activo'));
            btn.classList.add('activo');
        }
    },

    nuevoTroquel: () => {
        document.getElementById('titulo-form').innerText = "Nuevo Troquel";
        document.querySelector('form').reset();
        document.getElementById('f-id-db').value = "";
        App.nav('vista-formulario');
    },

    editar: (id) => {
        const t = App.datos.find(x => x.id === id);
        if (!t) return alert("Error datos");

        document.getElementById('titulo-form').innerText = "Editar Troquel";
        document.getElementById('f-id-db').value = t.id;
        document.getElementById('f-matricula').value = t.id_troquel;
        document.getElementById('f-ubicacion').value = t.ubicacion;
        document.getElementById('f-nombre').value = t.nombre;
        document.getElementById('f-cat').value = t.categoria_id || "";
        document.getElementById('f-fam').value = t.familia_id || "";
        document.getElementById('f-arts').value = t.codigos_articulo || "";
        document.getElementById('f-ot').value = t.referencias_ot || "";
        document.getElementById('f-medidas').value = t.tamano_troquel || "";
        document.getElementById('f-obs').value = t.observaciones || "";

        App.nav('vista-formulario');
    },

    guardarFicha: async (e) => {
        e.preventDefault();
        const id = document.getElementById('f-id-db').value;
        const data = {
            id_troquel: document.getElementById('f-matricula').value,
            ubicacion: document.getElementById('f-ubicacion').value,
            nombre: document.getElementById('f-nombre').value,
            categoria_id: parseInt(document.getElementById('f-cat').value) || null,
            familia_id: parseInt(document.getElementById('f-fam').value) || null,
            codigos_articulo: document.getElementById('f-arts').value,
            referencias_ot: document.getElementById('f-ot').value,
            tamano_troquel: document.getElementById('f-medidas').value,
            observaciones: document.getElementById('f-obs').value
        };

        const method = id ? 'PUT' : 'POST';
        const url = id ? `/api/troqueles/${id}` : '/api/troqueles';

        await fetch(url, {
            method: method,
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });

        App.cargarTodo();
        App.nav('vista-lista');
    },

    filtrar: () => App.renderTabla(),

    // --- HISTORIAL ---
    cargarHistorial: async () => {
        const res = await fetch('/api/historial');
        const data = await res.json();
        const html = data.map(h => `
            <tr>
                <td>${new Date(h.fecha_hora).toLocaleString()}</td>
                <td><b>${h.troqueles?.nombre || '???'}</b> (${h.troqueles?.id_troquel})</td>
                <td><span class="obs-pildora">${h.accion}</span></td>
                <td>${h.ubicacion_anterior || '-'} ➝ ${h.ubicacion_nueva || '-'}</td>
            </tr>
        `).join('');
        document.getElementById('tabla-historial').innerHTML = html;
    },

    // --- ESCANER ---
    toggleScanner: (show = true) => {
        const el = document.getElementById('modal-scanner');
        if(show) {
            el.classList.remove('oculto');
            App.escaneadosTemp.clear();
            document.getElementById('lista-escaneados').innerHTML = "";
            
            App.scanner = new Html5Qrcode("reader");
            App.scanner.start({facingMode:"environment"}, {fps:10}, (txt) => {
                // Lógica Lote: Si lee algo, lo busca y lo añade al lote temporal
                const troquel = App.datos.find(t => t.id_troquel === txt);
                if (troquel && !App.escaneadosTemp.has(troquel.id)) {
                    App.escaneadosTemp.add(troquel.id);
                    // Feedback visual
                    const div = document.createElement('div');
                    div.className = "chip activo";
                    div.innerText = `${troquel.id_troquel} - ${troquel.nombre}`;
                    document.getElementById('lista-escaneados').appendChild(div);
                }
            });
        } else {
            el.classList.add('oculto');
            if(App.scanner) App.scanner.stop().then(() => App.scanner.clear());
        }
    },

    procesarEscaneo: (accion) => {
        if(App.escaneadosTemp.size === 0) return alert("Escanea algo primero");
        App.seleccionados = new Set(App.escaneadosTemp); // Pasamos lo escaneado a selección
        App.moverLote(accion); // Ejecutamos movimiento
        App.toggleScanner(false); // Cerramos
    }
};

window.onload = App.init;