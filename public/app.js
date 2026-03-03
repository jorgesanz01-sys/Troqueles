const App = {
    datos: [],
    seleccionados: new Set(),
    filtroTipo: 'TODOS',
    mapaCat: {},
    mapaFam: {},

    init: async () => {
        console.log("Iniciando V6...");
        await App.cargarTodo();
        App.cargarSelects();
    },

    cargarTodo: async () => {
        try {
            const res = await fetch('/api/troqueles');
            App.datos = await res.json();
            App.renderTabla();
        } catch(e) { console.error(e); }
    },

    cargarSelects: async () => {
        const [cats, fams] = await Promise.all([
            fetch('/api/categorias').then(r=>r.json()), 
            fetch('/api/familias').then(r=>r.json())
        ]);
        
        // Guardar mapas para mostrar nombres en tabla
        cats.forEach(c => App.mapaCat[c.id] = c.nombre);
        fams.forEach(f => App.mapaFam[f.id] = f.nombre);

        // 1. Rellenar Chips de Tipos (Filtro)
        const divChips = document.getElementById('chips-tipos');
        divChips.innerHTML = `<button class="chip activo" onclick="App.setFiltroTipo('TODOS', this)">TODOS</button>`;
        cats.forEach(c => {
            divChips.innerHTML += `<button class="chip" onclick="App.setFiltroTipo('${c.nombre}', this)">${c.nombre}</button>`;
        });

        // 2. Rellenar Selects del Formulario
        const selCat = document.getElementById('f-cat');
        const selFam = document.getElementById('f-fam');
        const filtFam = document.getElementById('filtro-familia');
        
        selCat.innerHTML = '<option value="">Selecciona Tipo...</option>';
        selFam.innerHTML = '<option value="">Sin Familia</option>';
        
        cats.forEach(c => selCat.innerHTML += `<option value="${c.id}">${c.nombre}</option>`);
        fams.forEach(f => {
            selFam.innerHTML += `<option value="${f.id}">${f.nombre}</option>`;
            filtFam.innerHTML += `<option value="${f.nombre}">${f.nombre}</option>`;
        });
    },

    // --- LOGICA MATRÍCULA AUTOMÁTICA ---
    calcularSiguienteId: async () => {
        const idDb = document.getElementById('f-id-db').value;
        if(idDb) return; // Si estamos editando, no recalculamos

        const catId = document.getElementById('f-cat').value;
        if(!catId) return;

        // Llamada al backend para saber el último número de este tipo
        const res = await fetch(`/api/siguiente_numero?categoria_id=${catId}`);
        const data = await res.json();
        
        // Regla: Matrícula = Ubicación si es nuevo
        document.getElementById('f-matricula').value = data.siguiente;
        document.getElementById('f-ubicacion').value = data.siguiente;
    },

    // --- FOTOS ---
    subirFoto: async (input) => {
        if(!input.files[0]) return;
        
        const fd = new FormData();
        fd.append('file', input.files[0]);
        
        const btn = input.parentElement;
        const txtOriginal = btn.innerText;
        btn.innerText = "Subiendo...";
        
        try {
            const res = await fetch('/api/subir_foto', { method: 'POST', body: fd });
            const data = await res.json();
            
            document.getElementById('f-foto-url').value = data.url;
            document.getElementById('preview-foto').src = data.url;
            document.getElementById('preview-foto').style.display = 'block';
        } catch(e) { alert("Error subiendo foto"); }
        
        btn.innerText = txtOriginal;
    },

    // --- FILTROS ---
    setFiltroTipo: (tipo, btn) => {
        App.filtroTipo = tipo;
        document.querySelectorAll('.chip').forEach(c => c.classList.remove('activo'));
        btn.classList.add('activo');
        App.renderTabla();
    },

    renderTabla: () => {
        const tbody = document.getElementById('tabla-body');
        const txt = document.getElementById('buscador').value.toLowerCase();
        const fam = document.getElementById('filtro-familia').value;
        const est = document.getElementById('filtro-estado').value;

        const filtrados = App.datos.filter(t => {
            const nCat = App.mapaCat[t.categoria_id] || '';
            const nFam = App.mapaFam[t.familia_id] || '';
            
            const okTipo = App.filtroTipo === 'TODOS' || nCat === App.filtroTipo;
            const okFam = fam === 'TODAS' || nFam === fam;
            const okEst = est === 'TODOS' || t.estado === est;
            const okTxt = (t.nombre+t.id_troquel+t.ubicacion).toLowerCase().includes(txt);
            
            return okTipo && okFam && okEst && okTxt;
        });

        if(filtrados.length===0) { tbody.innerHTML = '<tr><td colspan="7">Nada encontrado</td></tr>'; return; }

        tbody.innerHTML = filtrados.map(t => {
            const checked = App.seleccionados.has(t.id) ? 'checked' : '';
            const bg = t.estado==='EN PRODUCCION' ? '#fee2e2' : '';
            const foto = t.foto_url ? '📷' : '-';
            
            return `<tr style="background:${bg}" onclick="App.editar(${t.id})">
                <td onclick="event.stopPropagation()"><input type="checkbox" value="${t.id}" ${checked} onchange="App.select(this, ${t.id})"></td>
                <td>${foto}</td>
                <td style="font-weight:900; font-family:monospace;">${t.id_troquel}</td>
                <td>${t.ubicacion}</td>
                <td>${t.nombre}</td>
                <td>${App.mapaCat[t.categoria_id]||''}<br><small>${App.mapaFam[t.familia_id]||''}</small></td>
                <td onclick="event.stopPropagation()"><button class="btn-icono" onclick="App.editar(${t.id})">✏️</button></td>
            </tr>`;
        }).join('');
    },

    // --- CRUD ---
    nav: (v) => {
        document.querySelectorAll('.vista').forEach(x => x.classList.add('oculto'));
        document.getElementById(v).classList.remove('oculto');
    },

    nuevoTroquel: () => {
        document.getElementById('titulo-form').innerText = "Nuevo Troquel";
        document.querySelector('form').reset();
        document.getElementById('f-id-db').value = "";
        document.getElementById('preview-foto').style.display = 'none';
        App.nav('vista-formulario');
    },

    editar: (id) => {
        const t = App.datos.find(x => x.id === id);
        if(!t) return;
        
        document.getElementById('titulo-form').innerText = "Editar";
        document.getElementById('f-id-db').value = t.id;
        document.getElementById('f-matricula').value = t.id_troquel;
        document.getElementById('f-ubicacion').value = t.ubicacion;
        document.getElementById('f-nombre').value = t.nombre;
        document.getElementById('f-cat').value = t.categoria_id||"";
        document.getElementById('f-fam').value = t.familia_id||"";
        document.getElementById('f-arts').value = t.codigos_articulo||"";
        document.getElementById('f-ot').value = t.referencias_ot||"";
        document.getElementById('f-obs').value = t.observaciones||"";
        document.getElementById('f-foto-url').value = t.foto_url||"";
        
        const img = document.getElementById('preview-foto');
        if(t.foto_url) { img.src = t.foto_url; img.style.display = 'block'; }
        else img.style.display = 'none';

        App.nav('vista-formulario');
    },

    guardarFicha: async (e) => {
        e.preventDefault();
        const id = document.getElementById('f-id-db').value;
        const data = {
            id_troquel: document.getElementById('f-matricula').value,
            ubicacion: document.getElementById('f-ubicacion').value,
            nombre: document.getElementById('f-nombre').value,
            categoria_id: parseInt(document.getElementById('f-cat').value)||null,
            familia_id: parseInt(document.getElementById('f-fam').value)||null,
            codigos_articulo: document.getElementById('f-arts').value,
            referencias_ot: document.getElementById('f-ot').value,
            observaciones: document.getElementById('f-obs').value,
            foto_url: document.getElementById('f-foto-url').value
        };

        const url = id ? `/api/troqueles/${id}` : '/api/troqueles';
        const method = id ? 'PUT' : 'POST';
        
        await fetch(url, { method: method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
        App.cargarTodo();
        App.nav('vista-lista');
    },

    // --- SELECCION ---
    select: (chk, id) => {
        if(chk.checked) App.seleccionados.add(id); else App.seleccionados.delete(id);
        const p = document.getElementById('panel-acciones');
        if(App.seleccionados.size>0) { p.classList.remove('oculto'); document.getElementById('contador-sel').innerText=App.seleccionados.size; }
        else p.classList.add('oculto');
    },
    
    limpiarSeleccion: () => { App.seleccionados.clear(); App.renderTabla(); document.getElementById('panel-acciones').classList.add('oculto'); },

    moverLote: async (acc) => {
        await fetch('/api/movimientos/lote', {
            method: 'POST', 
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ ids: Array.from(App.seleccionados), accion: acc })
        });
        App.limpiarSeleccion();
        App.cargarTodo();
    },
    
    // --- ESCANER ---
    toggleScanner: (show=true) => {
        const el = document.getElementById('modal-scanner');
        if(show) { el.classList.remove('oculto'); App.scanner = new Html5Qrcode("reader"); App.scanner.start({facingMode:"environment"}, {fps:10}, (t) => {
            // Logica simple: Buscar y añadir a seleccion
            const f = App.datos.find(x => x.id_troquel === t);
            if(f) { App.select({checked:true}, f.id); document.getElementById('lista-escaneados').innerHTML += ` <span class="chip">${t}</span>`; }
        }); }
        else { el.classList.add('oculto'); if(App.scanner) App.scanner.stop(); }
    },
    procesarEscaneo: (acc) => { App.moverLote(acc); App.toggleScanner(false); },
    
    cargarHistorial: async () => {
        const res = await fetch('/api/historial');
        const data = await res.json();
        document.getElementById('tabla-historial').innerHTML = data.map(h => `<tr><td>${new Date(h.fecha_hora).toLocaleString()}</td><td>${h.troqueles?.nombre}</td><td>${h.accion}</td><td>${h.ubicacion_anterior}->${h.ubicacion_nueva}</td></tr>`).join('');
    }
};

window.onload = App.init;