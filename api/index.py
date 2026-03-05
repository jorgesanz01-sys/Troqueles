from fastapi import FastAPI, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Any, Dict
from supabase import create_client, Client
import uuid
from datetime import datetime, timedelta

app = FastAPI()

# --- CREDENCIALES ---
SUPABASE_URL = "https://pkaqgtelkdhxlyjodzbq.supabase.co"
SUPABASE_KEY = "sb_publishable_8F5hCEJTDggd-uus5BKW_Q_891Hr856"

try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
except:
    print("Error conectando a Supabase")

# --- MODELOS ---
class EntidadAux(BaseModel):
    nombre: str

class TroquelData(BaseModel):
    nombre: str
    id_troquel: str
    ubicacion: str
    estado: Optional[str] = "EN ALMACEN"
    codigos_articulo: Optional[str] = ""
    referencias_ot: Optional[str] = ""
    categoria_id: Optional[int] = None
    familia_id: Optional[int] = None
    tamano_troquel: Optional[str] = ""
    tamano_final: Optional[str] = ""
    observaciones: Optional[str] = ""
    archivos: List[Dict[str, Any]] = []

class MovimientoLote(BaseModel):
    ids: List[int]
    accion: str
    ubicacion_destino: Optional[str] = ""

class BulkUpdate(BaseModel):
    ids: List[int]
    valor_id: int

# NUEVO: MODELO PARA BORRADOS MASIVOS
class BulkIds(BaseModel):
    ids: List[int]

# --- GET ---
@app.get("/api/troqueles")
def leer_troqueles(ver_papelera: bool = False):
    query = supabase.table("troqueles").select("*")
    if ver_papelera: query = query.eq("estado_activo", "Eliminado")
    else: query = query.neq("estado_activo", "Eliminado")
    return query.order("id_troquel", desc=True).execute().data

@app.get("/api/categorias")
def leer_cat(): return supabase.table("categorias").select("*").order("nombre").execute().data

@app.get("/api/familias")
def leer_fam(): return supabase.table("familias").select("*").order("nombre").execute().data

@app.get("/api/historial")
def leer_historial(troquel_id: Optional[int] = None):
    query = supabase.table("historial").select("*, troqueles(nombre, id_troquel)")
    if troquel_id: query = query.eq("troquel_id", troquel_id)
    return query.order("fecha_hora", desc=True).limit(50).execute().data

@app.get("/api/siguiente_numero")
def siguiente_numero(categoria_id: int):
    res = supabase.table("troqueles").select("id_troquel").eq("categoria_id", categoria_id).execute().data
    max_num = 0
    for t in res:
        try:
            val = int(t['id_troquel'])
            if val > max_num: max_num = val
        except: pass
    return {"siguiente": max_num + 1}

@app.get("/api/estadisticas/inactivos")
def troqueles_inactivos(meses: int = 12):
    fecha_limite = (datetime.utcnow() - timedelta(days=30*meses)).isoformat()
    troqueles = supabase.table("troqueles").select("*").eq("estado_activo", "Activo").execute().data
    historial = supabase.table("historial").select("troquel_id, fecha_hora").order("fecha_hora", desc=True).execute().data
    
    ultimos_mov = {}
    for h in historial:
        tid = h['troquel_id']
        if tid not in ultimos_mov:
            ultimos_mov[tid] = h['fecha_hora'] 
            
    inactivos = []
    for t in troqueles:
        if t.get('estado') == 'DESCATALOGADO': continue
        tid = t['id']
        ultima_fecha = ultimos_mov.get(tid, "")
        if not ultima_fecha or ultima_fecha < fecha_limite:
            t['ultima_fecha'] = ultima_fecha
            inactivos.append(t)
            
    inactivos.sort(key=lambda x: x['ultima_fecha'] if x['ultima_fecha'] else "")
    return inactivos

# --- POST/PUT ---
@app.post("/api/categorias")
def crear_cat(d: EntidadAux):
    return supabase.table("categorias").insert({"nombre": d.nombre.upper()}).select().execute()

@app.post("/api/familias")
def crear_fam(d: EntidadAux):
    return supabase.table("familias").insert({"nombre": d.nombre.upper()}).select().execute()

@app.post("/api/subir_foto")
async def subir_foto(file: UploadFile = File(...)):
    try:
        ext = file.filename.split('.')[-1]
        id_fichero = str(uuid.uuid4())
        nombre_fichero = f"{id_fichero}.{ext}"
        contenido = await file.read()
        supabase.storage.from_("fotos").upload(nombre_fichero, contenido, {"content-type": file.content_type})
        public_url = f"{SUPABASE_URL}/storage/v1/object/public/fotos/{nombre_fichero}"
        tipo = "pdf" if "pdf" in file.content_type else "img"
        return {"url": public_url, "nombre": file.filename, "tipo": tipo}
    except Exception as e: return {"error": str(e)}

@app.post("/api/troqueles")
def crear_troquel(t: TroquelData):
    d = t.dict()
    d["estado_activo"] = "Activo"
    if not d["ubicacion"]: d["ubicacion"] = d["id_troquel"]
    res = supabase.table("troqueles").insert(d).execute()
    if res.data: registrar_log(res.data[0]['id'], "CREACION", "NUEVO", d["ubicacion"])
    return res

@app.post("/api/troqueles/importar")
def importar_masivo(lista: List[TroquelData]):
    datos = [t.dict() for t in lista]
    for d in datos:
        d["estado_activo"] = "Activo"
        if not d["ubicacion"]: d["ubicacion"] = d["id_troquel"]
    return supabase.table("troqueles").insert(datos).execute()

@app.put("/api/troqueles/{id_db}")
def editar_troquel(id_db: int, t: TroquelData):
    prev = supabase.table("troqueles").select("ubicacion").eq("id", id_db).execute().data
    ubi_old = prev[0]['ubicacion'] if prev else ""
    res = supabase.table("troqueles").update(t.dict()).eq("id", id_db).execute()
    if ubi_old != t.ubicacion: registrar_log(id_db, "CAMBIO UBICACION", ubi_old, t.ubicacion)
    return res

@app.delete("/api/troqueles/{id_db}")
def papelera(id_db: int):
    supabase.table("troqueles").update({"estado_activo": "Eliminado"}).eq("id", id_db).execute()
    return {"ok": True}

@app.post("/api/troqueles/{id_db}/restaurar")
def restaurar(id_db: int):
    supabase.table("troqueles").update({"estado_activo": "Activo"}).eq("id", id_db).execute()
    return {"ok": True}

@app.post("/api/movimientos/lote")
def mover_lote(d: MovimientoLote):
    for id_db in d.ids:
        st = "EN PRODUCCION" if d.accion == 'SALIDA' else "EN ALMACEN"
        ubi = "PRODUCCION" if d.accion == 'SALIDA' else (d.ubicacion_destino or "ALMACEN")
        supabase.table("troqueles").update({"estado": st, "ubicacion": ubi}).eq("id", id_db).execute()
        registrar_log(id_db, d.accion, "?", ubi)
    return {"ok": True}

@app.put("/api/troqueles/bulk/familia")
def bulk_fam(d: BulkUpdate):
    return supabase.table("troqueles").update({"familia_id": d.valor_id}).in_("id", d.ids).execute()

@app.put("/api/troqueles/bulk/categoria")
def bulk_cat(d: BulkUpdate):
    return supabase.table("troqueles").update({"categoria_id": d.valor_id}).in_("id", d.ids).execute()

# --- NUEVOS CONTROLADORES MASIVOS ---
@app.post("/api/troqueles/bulk/papelera")
def bulk_papelera(d: BulkIds):
    return supabase.table("troqueles").update({"estado_activo": "Eliminado"}).in_("id", d.ids).execute()

@app.post("/api/troqueles/bulk/restaurar")
def bulk_restaurar(d: BulkIds):
    return supabase.table("troqueles").update({"estado_activo": "Activo"}).in_("id", d.ids).execute()

@app.post("/api/troqueles/bulk/destruir")
def bulk_destruir(d: BulkIds):
    # Destruye los troqueles de la base de datos permanentemente
    return supabase.table("troqueles").delete().in_("id", d.ids).execute()

def registrar_log(id_t, accion, orig, dest):
    try: supabase.table("historial").insert({"troquel_id": id_t, "accion": accion, "tipo_movimiento": accion, "ubicacion_anterior": orig, "ubicacion_nueva": dest}).execute()
    except: pass

@app.delete("/api/mantenimiento/limpiar_duplicados")
def limpiar_duplicados():
    todos = supabase.table("troqueles").select("*").execute().data
    vistos = set()
    ids_a_borrar = []
    
    for t in todos:
        huella = (
            str(t.get("id_troquel") or "").strip().upper(),
            str(t.get("ubicacion") or "").strip().upper(),
            str(t.get("nombre") or "").strip().upper(),
            t.get("categoria_id"),
            t.get("familia_id"),
            str(t.get("codigos_articulo") or "").strip().upper(),
            str(t.get("referencias_ot") or "").strip().upper(),
            str(t.get("tamano_troquel") or "").strip().upper(),
            str(t.get("tamano_final") or "").strip().upper(),
            str(t.get("observaciones") or "").strip().upper()
        )
        if huella in vistos: 
            ids_a_borrar.append(t["id"])
        else: 
            vistos.add(huella)
            
    # OPTIMIZACIÓN: Borramos todos los duplicados de golpe usando .in_()
    if ids_a_borrar:
        supabase.table("troqueles").delete().in_("id", ids_a_borrar).execute()
        
    return {"borrados": len(ids_a_borrar)}
@app.post("/api/troqueles/backup/restaurar")
def restaurar_backup(datos: List[Dict[str, Any]]):
    # Supabase upsert usa la columna 'id' para decidir si actualiza o inserta.
    # Limpiamos los datos para asegurar que el formato es correcto
    for d in datos:
        # Aseguramos que el estado activo sea correcto
        if "estado_activo" not in d:
            d["estado_activo"] = "Activo"
            
    # La magia del upsert: 
    # Si encuentra el ID, actualiza la fila. Si no lo encuentra, crea una nueva.
    res = supabase.table("troqueles").upsert(datos).execute()
    
    return {"status": "ok", "procesados": len(datos)}