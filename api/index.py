from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional, List
from supabase import create_client, Client

app = FastAPI()

# ==========================================
# CONFIGURACIÓN DE BASE DE DATOS
# ==========================================
SUPABASE_URL = "https://pkaqgtelkdhxlyjodzbq.supabase.co"
SUPABASE_KEY = "sb_publishable_8F5hCEJTDggd-uus5BKW_Q_891Hr856"
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ==========================================
# MODELOS DE DATOS (ESTRUCTURA)
# ==========================================
class TroquelForm(BaseModel):
    id_troquel: str
    codigos_articulo: Optional[str] = ""  # Admite múltiples artículos
    referencias_ot: Optional[str] = ""    # Opcional histórico
    componente: Optional[str] = ""        # Carpeta, lámina, etc.
    nombre: str
    ubicacion: str
    categoria_id: Optional[int] = None
    tamano_troquel: Optional[str] = ""
    tamano_final: Optional[str] = ""
    observaciones: Optional[str] = ""
    enlace_archivo: Optional[str] = ""

class NuevaCategoria(BaseModel):
    nombre: str

class BulkCategoria(BaseModel):
    ids: List[int]
    categoria_id: int

class BulkBorrar(BaseModel):
    ids: List[int]

# ==========================================
# RUTAS DE LECTURA (GET)
# ==========================================
@app.get("/api/categorias")
async def listar_categorias():
    response = supabase.table("categorias").select("*").order("nombre").execute()
    return response.data

@app.get("/api/troqueles")
async def listar_troqueles():
    response = supabase.table("troqueles")\
        .select("*, categorias(nombre)")\
        .neq("estado_activo", "En Papelera")\
        .order("id_troquel")\
        .execute()
    return response.data

@app.get("/api/historial")
async def listar_historial():
    response = supabase.table("historial")\
        .select("*, troqueles(id_troquel, nombre)")\
        .order("fecha_hora", desc=True)\
        .execute()
    return response.data

# ==========================================
# RUTAS DE ESCRITURA INDIVIDUAL (POST/PUT)
# ==========================================
@app.post("/api/categorias")
async def crear_categoria(cat: NuevaCategoria):
    response = supabase.table("categorias").insert({"nombre": cat.nombre.upper()}).execute()
    return {"status": "success", "data": response.data}

@app.post("/api/troqueles")
async def crear_troquel(troquel: TroquelForm):
    nuevo_dato = troquel.dict()
    nuevo_dato["estado_activo"] = "Activo"
    response = supabase.table("troqueles").insert(nuevo_dato).execute()
    return {"status": "success", "data": response.data}

@app.put("/api/troqueles/{id_db}")
async def editar_troquel(id_db: int, troquel: TroquelForm):
    datos_actualizados = troquel.dict()
    response = supabase.table("troqueles").update(datos_actualizados).eq("id", id_db).execute()
    return {"status": "success", "data": response.data}

@app.post("/api/borrar/{id_db}")
async def mover_a_papelera(id_db: int):
    response = supabase.table("troqueles").update({"estado_activo": "En Papelera"}).eq("id", id_db).execute()
    return {"status": "success"}

# ==========================================
# RUTAS DE ACCIONES MASIVAS (BULK)
# ==========================================
@app.put("/api/troqueles/bulk/categoria")
async def bulk_update_categoria(data: BulkCategoria):
    response = supabase.table("troqueles").update({"categoria_id": data.categoria_id}).in_("id", data.ids).execute()
    return {"status": "success"}

@app.post("/api/troqueles/bulk/borrar")
async def bulk_borrar(data: BulkBorrar):
    response = supabase.table("troqueles").update({"estado_activo": "En Papelera"}).in_("id", data.ids).execute()
    return {"status": "success"}

# ==========================================
# HEALTH CHECK
# ==========================================
@app.get("/api/health")
def health():
    return {"status": "ok", "sistema": "ERP Packaging"}