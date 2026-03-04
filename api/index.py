from fastapi import FastAPI, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Any, Dict
from supabase import create_client, Client
import uuid

app = FastAPI()

# --- CONFIGURACIÓN SUPABASE ---
# SUSTITUYE CON TUS CREDENCIALES REALES SI SON DIFERENTES
SUPABASE_URL = "https://pkaqgtelkdhxlyjodzbq.supabase.co"
SUPABASE_KEY = "sb_publishable_8F5hCEJTDggd-uus5BKW_Q_891Hr856"

try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
except:
    print("Error crítico conectando a Supabase")

# --- MODELOS DE DATOS (Lo que envías desde la web) ---
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
    archivos: List[Dict[str, Any]] = [] # Lista de fotos/pdf

class MovimientoLote(BaseModel):
    ids: List[int]
    accion: str
    ubicacion_destino: Optional[str] = ""

class BulkUpdate(BaseModel):
    ids: List[int]
    valor_id: int

# --- RUTAS DE LECTURA (GET) ---
@app.get("/api/troqueles")
def leer_troqueles(ver_papelera: bool = False):
    # PEDIMOS DATOS CRUDOS. Sin relaciones que fallen.
    query = supabase.table("troqueles").select("*")
    
    if ver_papelera:
        query = query.eq("estado_activo", "Eliminado")
    else:
        query = query.neq("estado_activo", "Eliminado")
        
    return query.order("id_troquel", desc=True).execute().data

@app.get("/api/categorias")
def leer_cat(): return supabase.table("categorias").select("*").order("nombre").execute().data

@app.get("/api/familias")
def leer_fam(): return supabase.table("familias").select("*").order("nombre").execute().data

@app.get("/api/historial")
def leer_historial():
    # El historial sí intenta traer nombres para que sea legible, si falla trae null
    try:
        return supabase.table("historial").select("*, troqueles(nombre, id_troquel)").order("fecha_hora", desc=True).limit(50).execute().data
    except:
        return []

@app.get("/api/siguiente_numero")
def siguiente_numero(categoria_id: int):
    # Busca el número más alto de esa categoría para sugerir el siguiente
    res = supabase.table("troqueles").select("id_troquel").eq("categoria_id", categoria_id).execute().data
    max_num = 0
    for t in res:
        try:
            val = int(t['id_troquel'])
            if val > max_num: max_num = val
        except: pass
    return {"siguiente": max_num + 1}

# --- RUTAS DE ESCRITURA (POST/PUT/DELETE) ---

# Crear Familias/Tipos
@app.post("/api/categorias")
def crear_cat(d: EntidadAux):
    return supabase.table("categorias").insert({"nombre": d.nombre.upper()}).select().execute()

@app.post("/api/familias")
def crear_fam(d: EntidadAux):
    return supabase.table("familias").insert({"nombre": d.nombre.upper()}).select().execute()

# Subir Fotos
@app.post("/api/subir_foto")
async def subir_foto(file: UploadFile = File(...)):
    try:
        ext = file.filename.split('.')[-1]
        nombre_fichero = f"{uuid.uuid4()}.{ext}"
        contenido = await file.read()
        
        supabase.storage.from_("fotos").upload(nombre_fichero, contenido, {"content-type": file.content_type})
        public_url = f"{SUPABASE_URL}/storage/v1/object/public/fotos/{nombre_fichero}"
        
        tipo = "pdf" if "pdf" in file.content_type else "img"
        return {"url": public_url, "nombre": file.filename, "tipo": tipo}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# CRUD Troqueles
@app.post("/api/troqueles")
def crear_troquel(t: TroquelData):
    datos = t.dict()
    datos["estado_activo"] = "Activo"
    if not datos["ubicacion"]: datos["ubicacion"] = datos["id_troquel"]
    
    res = supabase.table("troqueles").insert(datos).execute()
    if res.data: registrar_log(res.data[0]['id'], "CREACION", "NUEVO", datos["ubicacion"])
    return res

@app.put("/api/troqueles/{id_db}")
def editar_troquel(id_db: int, t: TroquelData):
    # Guardamos ubicación anterior para el log
    prev = supabase.table("troqueles").select("ubicacion").eq("id", id_db).execute().data
    ubi_old = prev[0]['ubicacion'] if prev else ""
    
    res = supabase.table("troqueles").update(t.dict()).eq("id", id_db).execute()
    
    if ubi_old != t.ubicacion: 
        registrar_log(id_db, "CAMBIO UBICACION", ubi_old, t.ubicacion)
    return res

@app.delete("/api/troqueles/{id_db}")
def papelera(id_db: int):
    supabase.table("troqueles").update({"estado_activo": "Eliminado"}).eq("id", id_db).execute()
    registrar_log(id_db, "PAPELERA", "", "")
    return {"ok": True}

@app.post("/api/troqueles/{id_db}/restaurar")
def restaurar(id_db: int):
    supabase.table("troqueles").update({"estado_activo": "Activo"}).eq("id", id_db).execute()
    registrar_log(id_db, "RESTAURADO", "PAPELERA", "ACTIVO")
    return {"ok": True}

# Acciones Masivas
@app.post("/api/movimientos/lote")
def mover_lote(d: MovimientoLote):
    for id_db in d.ids:
        actual = supabase.table("troqueles").select("ubicacion, estado").eq("id", id_db).execute().data
        if not actual: continue
        
        nuevo_estado = "EN PRODUCCION" if d.accion == 'SALIDA' else "EN ALMACEN"
        nueva_ubi = "PRODUCCION" if d.accion == 'SALIDA' else (d.ubicacion_destino or actual[0]['ubicacion'])
        
        supabase.table("troqueles").update({"estado": nuevo_estado, "ubicacion": nueva_ubi}).eq("id", id_db).execute()
        registrar_log(id_db, d.accion, actual[0]['ubicacion'], nueva_ubi)
    return {"ok": True}

@app.put("/api/troqueles/bulk/familia")
def bulk_fam(d: BulkUpdate):
    return supabase.table("troqueles").update({"familia_id": d.valor_id}).in_("id", d.ids).execute()

@app.put("/api/troqueles/bulk/categoria")
def bulk_cat(d: BulkUpdate):
    return supabase.table("troqueles").update({"categoria_id": d.valor_id}).in_("id", d.ids).execute()

# Helper
def registrar_log(id_t, accion, orig, dest):
    try:
        supabase.table("historial").insert({
            "troquel_id": id_t, "accion": accion, "tipo_movimiento": accion,
            "ubicacion_anterior": orig, "ubicacion_nueva": dest
        }).execute()
    except: pass