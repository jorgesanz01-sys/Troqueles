const App = {
    datos: [],
    seleccionados: new Set(),
    filtroTipo: 'TODOS',
    mapaCat: {},
    mapaFam: {},
    columnaOrden: 'id_troquel',
    ordenAsc: true,
    scanner: null,
    escaneadosTemp: new Set(),

    init: async () => {
        console.log("Iniciando ERP V6.1...");
        await App.cargarTodo();
        App.cargarSelects();
    },

    // --- CARGA DE DATOS ---
    cargarTodo: async () => {
        try {
            const res = await fetch('/api/troqueles');
            if(res.ok) {
                App.datos = await res.json();
                App.renderTabla();
            }
        } catch (e) { console.error(e); }
    },

    cargarSelects: async () => {
        try {
            const [cats, fams] = await Promise.all([
                fetch('/api/categorias').then(r=>r.json()), 
                fetch('/api/familias').then(r=>r.json())
            ]);
            
            // Mapas para nombres
            cats.forEach(c => App.mapaCat[c.id] = c.nombre);
            fams.forEach(f => App.mapaFam[f.id] = f.nombre);

            // 1. Chips Filtro
            const divChips = document.getElementById('chips-tipos');
            divChips.innerHTML = `<button class="chip activo" onclick="App.setFiltroTipo('TODOS', this)">TODOS</button>`;
            cats.forEach(c => {
                divChips.innerHTML += `<button class="chip" onclick="App.setFiltroTipo('${c.nombre}', this)">${c.nombre}</button>`;
            });

            // 2. Selects Formulario
            const selCat = document.getElementById('f-cat');
            const selFam = document.getElementById('f-fam');
            const filtFam = document.getElementById('filtro-familia');
            
            selCat.innerHTML = '<option value="">Selecciona Tipo...</option>';
            selFam.innerHTML = '<option value="">Sin Familia</option>';
            filtFam.innerHTML = '<option value="TODAS">Todas las Familias</option>';
            
            cats.forEach(c => selCat.innerHTML += `<option value="${c.id}">${c.nombre}</option>`);
            fams.forEach(f => {
                selFam.innerHTML += `<option value="${f.id}">${f.nombre}</option>`;
                filtFam.innerHTML += `<option value="${f.nombre}">${f.nombre}</option>`;
            });
        } catch(e) { console.error("Error selects", e); }
    },

    // --- LOGICA MATRÍCULA AUTOMÁTICA ---
    calcularSiguienteId: async () => {
        const idDb = document.getElementById('f-id-db').value;
        if(idDb) return; // Si editamos, no tocar

        const catId = document.getElementById('f-cat').value;
        if(!catId) return;

        try {
            const res = await fetch(`/api/siguiente_numero?categoria_id=${catId}`);
            const data = await res.json();
            document.getElementById('f-matricula').value = data.siguiente;
            document.getElementById('f-ubicacion').value = data.siguiente; // Regla inicial
        } catch(e) { console.error(e); }
    },

    // --- FOTOS ---
    subirFoto: async (input) => {
        if(!input.files[0]) return;
        
        const btn = input.parentElement;
        const txtOriginal = btn.innerText;
        btn.innerText = "⏳ Subiendo...";
        
        const fd = new FormData();
        fd.append('file', input.files[0]);
        
        try {
            const res = await fetch('/api/subir_foto', { method: 'POST', body: fd });
            if(res.ok) {
                const data = await res.json();
                document.getElementById('f-foto-url').value = data.url;
                document.getElementById('preview-foto').src = data.url;
                document.getElementById('preview-foto').style.display = 'block';
            } else { alert("Error subida"); }
        } catch(e) { alert("Error conexión"); }
        
        btn.innerText = txtOriginal;
    },

    // --- FILTROS Y ORDEN ---
    setFiltroTipo: (tipo, btn) => {
        App.filtroTipo = tipo;
        document.querySelectorAll('.chip').forEach(c => c.classList.remove('activo'));
        btn.classList.add('activo');
        App.renderTabla(); // Render inmediato
    },

    filtrar: () => {
        const btnLimp = document.getElementById('btn-limpiar');
        const txt = document.getElementById('buscador').value;
        btnLimp.classList.toggle('oculto', txt === '');
        App.renderTabla();
    },

    limpiarBuscador: () => {
        document.getElementById('buscador').value = '';
        App.filtrar();
    },

    ordenar: (col) => {
        if(App.columnaOrden === col) App.ordenAsc = !App.ordenAsc;
        else { App.columnaOrden = col; App.ordenAsc = true; }
        App.renderTabla();
    },

    renderTabla: () => {
        const tbody = document.getElementById('tabla-body');
        const txt = document.getElementById('buscador').value.toLowerCase();
        const fam = document.getElementById('filtro-familia').value;
        const est = document.getElementById('filtro-estado').value;

        // 1. Filtrar
        let filtrados = App.datos.filter(t => {
            const nCat = App.mapaCat[t.categoria_id] || '';
            const nFam = App.mapaFam[t.familia_id] || '';
            
            const okTipo = App.filtroTipo === 'TODOS' || nCat === App.filtroTipo;
            const okFam = fam === 'TODAS' || nFam === fam;
            const okEst = est === 'TODOS' || t.estado === est;
            const okTxt = (t.nombre+t.id_troquel+t.ubicacion).toLowerCase().includes(txt);
            
            return okTipo && okFam && okEst && okTxt;
        });

        // 2. Ordenar
        filtrados.sort((a, b) => {
            let vA = (a[App.columnaOrden] || "").toString();
            let vB = (b[App.columnaOrden] || "").toString();
            
            // Orden especial nombres
            if(App.columnaOrden === 'categoria') { vA = App.mapaCat[a.categoria_id]||""; vB = App.mapaCat[b.categoria_id]||""; }
            if(App.columnaOrden === 'familia') { vA = App.mapaFam[a.familia_id]||""; vB = App.mapaFam[b.familia_id]||""; }

            const nA = parseFloat(vA); const nB = parseFloat(vB);
            if(!isNaN(nA) && !isNaN(nB) && !vA.match(/[a-z]/i)) {
                return App.ordenAsc ? nA - nB : nB - nA;
            }
            return App.ordenAsc ? vA.localeCompare(vB) : vB.localeCompare(vA);
        });

        if(filtrados.length===0) { tbody.innerHTML = '<tr><td colspan="8" style="padding:20px; text-align:center">No hay coincidencias</td></tr>'; return; }

        // 3. Pintar
        tbody.innerHTML = filtrados.map(t => {
            const checked = App.seleccionados.has(t.id) ? 'checked' : '';
            const bg = App.seleccionados.has(t.id) ? '#eff6ff' : (t.estado === 'EN PRODUCCION' ? '#fff1f2' : '');
            const foto = t.foto_url ? `<a href="${t.foto_url}" target="_blank">📷</a>` : '-';
            
            return `
            <tr style="background:${bg}; cursor:pointer;" onclick="App.editar(${t.id})">
                <td onclick="event.stopPropagation()" style="text-align:center;">
                    <input type="checkbox" value="${t.id}" ${checked} onchange="App.select(this, ${t.id})">
                </td>
                <td style="text-align:center;">${foto}</td>
                <td style="font-weight:900; font-family:monospace; color:#0f766e;">${t.id_troquel}</td>
                <td style="font-weight:800;">${t.ubicacion}</td>
                <td>${t.nombre}</td>
                <td>${App.mapaCat[t.categoria_id] || '-'}</td>
                <td>${App.mapaFam[t.familia_id] || '-'}</td>
                <td onclick="event.stopPropagation()">
                    <button class="btn-icono" onclick="App.editar(${t.id})">✏️</button>
                    <button class="btn-icono" onclick="App.generarQR('${t.id_troquel}', '${t.ubicacion}', '${t.nombre.replace(/'/g, "")}')">🖨️</button>
                </td>
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
        if (!t) return;

        document.getElementById('titulo-form').innerText = "Editar Troquel";
        document.getElementById('f-id-db').value = t.id;
        document.getElementById('f-matricula').value = t.id_troquel;
        document.getElementById('f-ubicacion').value = t.ubicacion;
        document.getElementById('f-nombre').value = t.nombre;
        
        document.getElementById('f-cat').value = t.categoria_id || "";
        document.getElementById('f-fam').value = t.familia_id || "";
        
        document.getElementById('f-medidas-madera').value = t.tamano_troquel || "";
        document.getElementById('f-medidas-corte').value = t.tamano_final || "";
        
        document.getElementById('f-arts').value = t.codigos_articulo || "";
        document.getElementById('f-ot').value = t.referencias_ot || "";
        document.getElementById('f-obs').value = t.observaciones || "";
        document.getElementById('f-foto-url').value = t.foto_url || "";

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
            categoria_id: parseInt(document.getElementById('f-cat').value) || null,
            familia_id: parseInt(document.getElementById('f-fam').value) || null,
            tamano_troquel: document.getElementById('f-medidas-madera').value,
            tamano_final: document.getElementById('f-medidas-corte').value,
            codigos_articulo: document.getElementById('f-arts').value,
            referencias_ot: document.getElementById('f-ot').value,
            observaciones: document.getElementById('f-obs').value,
            foto_url: document.getElementById('f-foto-url').value
        };

        const method = id ? 'PUT' : 'POST';
        const url = id ? `/api/troqueles/${id}` : '/api/troqueles';

        await fetch(url, { method: method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
        App.cargarTodo();
        App.nav('vista-lista');
    },

    // --- SELECCION ---
    select: (chk, id) => {
        if (chk.checked) App.seleccionados.add(id); else App.seleccionados.delete(id);
        App.updatePanel();
    },
    toggleAll: (chk) => {
        const checks = document.querySelectorAll('#tabla-body input[type="checkbox"]');
        checks.forEach(c => { c.checked = chk.checked; if(chk.checked) App.seleccionados.add(parseInt(c.value)); else App.seleccionados.delete(parseInt(c.value)); });
        App.updatePanel();
    },
    updatePanel: () => {
        const p = document.getElementById('panel-acciones');
        if(App.seleccionados.size>0) { p.classList.remove('oculto'); document.getElementById('contador-sel').innerText=App.seleccionados.size; } else p.classList.add('oculto');
    },
    limpiarSeleccion: () => { App.seleccionados.clear(); document.getElementById('check-all').checked=false; App.updatePanel(); App.renderTabla(); },

    moverLote: async (acc) => {
        await fetch('/api/movimientos/lote', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: Array.from(App.seleccionados), accion: acc }) });
        App.limpiarSeleccion(); App.cargarTodo();
    },

    // --- QR ---
    generarQR: (id, ubi, nom) => {
        document.getElementById('modal-qr').classList.remove('oculto');
        document.getElementById('qr-texto-ubi').innerText = ubi || "SIN UBI";
        document.getElementById('qr-texto-id').innerText = id;
        document.getElementById('qr-texto-desc').innerText = nom;
        new QRious({ element: document.getElementById('qr-canvas'), value: id, size: 200, padding: 0, level: 'M' });
    },

    // --- ESCANER ---
    toggleScanner: (show=true) => {
        const el = document.getElementById('modal-scanner');
        if(show) { el.classList.remove('oculto'); App.scanner = new Html5Qrcode("reader"); App.scanner.start({facingMode:"environment"}, {fps:10}, (t) => {
            const f = App.datos.find(x => x.id_troquel === t);
            if(f) { App.seleccionados.add(f.id); document.getElementById('lista-escaneados').innerHTML += `<span class="chip">${t}</span>`; }
        }); } else { el.classList.add('oculto'); if(App.scanner) App.scanner.stop(); }
    },
    procesarEscaneo: (acc) => { App.moverLote(acc); App.toggleScanner(false); },

    cargarHistorial: async () => {
        const res = await fetch('/api/historial');
        const data = await res.json();
        document.getElementById('tabla-historial').innerHTML = data.map(h => `<tr><td>${new Date(h.fecha_hora).toLocaleString()}</td><td>${h.troqueles?.nombre}</td><td>${h.accion}</td><td>${h.ubicacion_anterior||'-'} -> ${h.ubicacion_nueva||'-'}</td></tr>`).join('');
    }
};

window.onload = App.init;