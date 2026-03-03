from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from supabase import create_client, Client
from datetime import datetime

app = FastAPI()

# CREDENCIALES (Pon las tuyas si se borraron, aqui uso las del contexto anterior)
SUPABASE_URL = "https://pkaqgtelkdhxlyjodzbq.supabase.co"
SUPABASE_KEY = "sb_publishable_8F5hCEJTDggd-uus5BKW_Q_891Hr856"
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# --- MODELOS DE DATOS ---
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
    enlace_archivo: Optional[str] = ""

class MovimientoLote(BaseModel):
    ids: List[int]       # IDs internos de la DB
    accion: str          # 'SALIDA' o 'RETORNO'
    ubicacion_destino: Optional[str] = "" # Solo para retorno

# --- RUTAS DE LECTURA ---
@app.get("/api/troqueles")
def leer_troqueles():
    # Traemos todo ordenado por ubicación para encontrar fácil
    return supabase.table("troqueles")\
        .select("*, categorias(nombre), familias(nombre)")\
        .neq("estado_activo", "Eliminado")\
        .order("ubicacion")\
        .execute().data

@app.get("/api/categorias")
def leer_cat(): return supabase.table("categorias").select("*").execute().data

@app.get("/api/familias")
def leer_fam(): return supabase.table("familias").select("*").execute().data

@app.get("/api/historial")
def leer_historial():
    # Historial enriquecido
    return supabase.table("historial")\
        .select("*, troqueles(nombre, id_troquel)")\
        .order("fecha_hora", desc=True)\
        .limit(100)\
        .execute().data

# --- RUTAS DE ESCRITURA (CRUD) ---
@app.post("/api/troqueles")
def crear_troquel(t: TroquelData):
    datos = t.dict()
    datos["estado_activo"] = "Activo"
    datos["estado"] = "EN ALMACEN"
    res = supabase.table("troqueles").insert(datos).execute()
    # Log Creación
    if res.data:
        registrar_log(res.data[0]['id'], "CREACION", "NUEVO", t.ubicacion)
    return res

@app.put("/api/troqueles/{id_db}")
def editar_troquel(id_db: int, t: TroquelData):
    # Antes de editar, vemos qué había para el log
    prev = supabase.table("troqueles").select("ubicacion").eq("id", id_db).execute().data
    ubi_old = prev[0]['ubicacion'] if prev else ""
    
    res = supabase.table("troqueles").update(t.dict()).eq("id", id_db).execute()
    
    if ubi_old != t.ubicacion:
        registrar_log(id_db, "CAMBIO UBICACION", ubi_old, t.ubicacion)
    else:
        registrar_log(id_db, "EDICION DATOS", "", "")
    return res

@app.delete("/api/troqueles/{id_db}")
def borrar_troquel(id_db: int):
    supabase.table("troqueles").update({"estado_activo": "Eliminado"}).eq("id", id_db).execute()
    registrar_log(id_db, "ELIMINACION", "", "")
    return {"ok": True}

# --- RUTAS DE MOVIMIENTO (PRODUCCION / RETORNO) ---
@app.post("/api/movimientos/lote")
def mover_lote(d: MovimientoLote):
    updates = []
    fecha = datetime.now().isoformat()
    
    for id_db in d.ids:
        # Obtener dato actual
        actual = supabase.table("troqueles").select("ubicacion, estado").eq("id", id_db).execute().data
        if not actual: continue
        
        info = actual[0]
        nuevo_estado = "EN PRODUCCION" if d.accion == 'SALIDA' else "EN ALMACEN"
        nueva_ubi = "PRODUCCION" if d.accion == 'SALIDA' else (d.ubicacion_destino or info['ubicacion']) # Si es retorno y no dan ubi, vuelve a la suya
        
        # Update
        supabase.table("troqueles").update({
            "estado": nuevo_estado,
            "ubicacion": nueva_ubi
        }).eq("id", id_db).execute()
        
        # Log
        registrar_log(id_db, d.accion, info['ubicacion'], nueva_ubi)
        
    return {"ok": True}

# Helper Log
def registrar_log(id_troquel, accion, origen, destino):
    supabase.table("historial").insert({
        "troquel_id": id_troquel,
        "accion": accion,
        "tipo_movimiento": accion,
        "ubicacion_anterior": origen,
        "ubicacion_nueva": destino
    }).execute()