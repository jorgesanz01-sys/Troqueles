from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from supabase import create_client, Client
from datetime import datetime
import uuid

app = FastAPI()

# CREDENCIALES
SUPABASE_URL = "https://pkaqgtelkdhxlyjodzbq.supabase.co"
SUPABASE_KEY = "sb_publishable_8F5hCEJTDggd-uus5BKW_Q_891Hr856"
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# --- MODELOS ---
class TroquelData(BaseModel):
    nombre: str
    id_troquel: str       # Matrícula
    ubicacion: str        # Estantería
    estado: Optional[str] = "EN ALMACEN"
    codigos_articulo: Optional[str] = ""
    referencias_ot: Optional[str] = ""
    categoria_id: Optional[int] = None
    familia_id: Optional[int] = None
    tamano_troquel: Optional[str] = ""
    tamano_final: Optional[str] = ""
    observaciones: Optional[str] = ""
    foto_url: Optional[str] = "" 

class MovimientoLote(BaseModel):
    ids: List[int]
    accion: str
    ubicacion_destino: Optional[str] = ""

# --- RUTAS GET ---
@app.get("/api/troqueles")
def leer_troqueles():
    return supabase.table("troqueles")\
        .select("*, categorias(nombre), familias(nombre)")\
        .neq("estado_activo", "Eliminado")\
        .order("id_troquel", desc=True)\
        .execute().data

@app.get("/api/categorias")
def leer_cat(): return supabase.table("categorias").select("*").order("nombre").execute().data

@app.get("/api/familias")
def leer_fam(): return supabase.table("familias").select("*").order("nombre").execute().data

@app.get("/api/historial")
def leer_historial():
    return supabase.table("historial")\
        .select("*, troqueles(nombre, id_troquel)")\
        .order("fecha_hora", desc=True)\
        .limit(100)\
        .execute().data

# --- NUEVO: CALCULAR SIGUIENTE NÚMERO ---
@app.get("/api/siguiente_numero")
def siguiente_numero(categoria_id: int):
    # Buscamos los troqueles de esa categoría
    res = supabase.table("troqueles")\
        .select("id_troquel")\
        .eq("categoria_id", categoria_id)\
        .execute().data
    
    max_num = 0
    for t in res:
        # Intentamos extraer número. Si es "1050" -> 1050. Si es "A-10" -> Ignorar o tratar
        try:
            val = int(t['id_troquel'])
            if val > max_num: max_num = val
        except:
            pass # Si tiene letras, lo ignoramos para el cálculo automático
            
    return {"siguiente": max_num + 1}

# --- NUEVO: SUBIR FOTO ---
@app.post("/api/subir_foto")
async def subir_foto(file: UploadFile = File(...)):
    try:
        ext = file.filename.split('.')[-1]
        nombre_fichero = f"{uuid.uuid4()}.{ext}"
        contenido = await file.read()
        
        # Subir a Supabase Storage (Bucket 'fotos')
        res = supabase.storage.from_("fotos").upload(nombre_fichero, contenido, {"content-type": file.content_type})
        
        # Construir URL pública
        public_url = f"{SUPABASE_URL}/storage/v1/object/public/fotos/{nombre_fichero}"
        return {"url": public_url}
    except Exception as e:
        print(f"Error subida: {e}")
        raise HTTPException(status_code=500, detail="Error subiendo imagen")

# --- RUTAS CRUD ---
@app.post("/api/troqueles")
def crear_troquel(t: TroquelData):
    datos = t.dict()
    datos["estado_activo"] = "Activo"
    # Si es nuevo, la matrícula también es la ubicación inicial (Regla de negocio)
    if not datos["ubicacion"]: 
        datos["ubicacion"] = datos["id_troquel"]
        
    res = supabase.table("troqueles").insert(datos).execute()
    if res.data:
        registrar_log(res.data[0]['id'], "CREACION", "NUEVO", datos["ubicacion"])
    return res

@app.put("/api/troqueles/{id_db}")
def editar_troquel(id_db: int, t: TroquelData):
    prev = supabase.table("troqueles").select("ubicacion").eq("id", id_db).execute().data
    ubi_old = prev[0]['ubicacion'] if prev else ""
    
    res = supabase.table("troqueles").update(t.dict()).eq("id", id_db).execute()
    
    if ubi_old != t.ubicacion:
        registrar_log(id_db, "CAMBIO UBICACION", ubi_old, t.ubicacion)
    return res

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

@app.delete("/api/troqueles/{id_db}")
def borrar(id_db: int):
    supabase.table("troqueles").update({"estado_activo": "Eliminado"}).eq("id", id_db).execute()
    return {"ok": True}

def registrar_log(id_t, accion, orig, dest):
    supabase.table("historial").insert({
        "troquel_id": id_t, "accion": accion, "tipo_movimiento": accion,
        "ubicacion_anterior": orig, "ubicacion_nueva": dest
    }).execute()