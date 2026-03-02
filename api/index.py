from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional
from supabase import create_client, Client

app = FastAPI()

# ==========================================
# CONFIGURACIÓN DE BASE DE DATOS
# ==========================================
SUPABASE_URL = "https://pkaqgtelkdhxlyjodzbq.supabase.co"
SUPABASE_KEY = "sb_publishable_8F5hCEJTDggd-uus5BKW_Q_891Hr856"
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ==========================================
# MODELOS DE DATOS
# ==========================================
class TroquelForm(BaseModel):
    id_troquel: str
    nombre: str
    ubicacion: str
    categoria_id: Optional[int] = None
    tamano_troquel: Optional[str] = ""
    tamano_final: Optional[str] = ""
    observaciones: Optional[str] = ""
    enlace_archivo: Optional[str] = ""  # Campo para el plano/PDF

# ==========================================
# RUTAS DE LECTURA (GET)
# ==========================================
@app.get("/api/categorias")
async def listar_categorias():
    """Obtiene la lista de familias para los desplegables y filtros"""
    response = supabase.table("categorias").select("*").order("nombre").execute()
    return response.data

@app.get("/api/troqueles")
async def listar_troqueles():
    """Obtiene todo el inventario activo con el nombre de su familia"""
    response = supabase.table("troqueles")\
        .select("*, categorias(nombre)")\
        .neq("estado_activo", "En Papelera")\
        .order("id_troquel")\
        .execute()
    return response.data

@app.get("/api/historial")
async def listar_historial():
    """Obtiene el log de auditoría (movimientos, altas, bajas)"""
    response = supabase.table("historial")\
        .select("*, troqueles(id_troquel, nombre)")\
        .order("fecha_hora", desc=True)\
        .execute()
    return response.data

# ==========================================
# RUTAS DE ESCRITURA (POST / PUT)
# ==========================================
@app.post("/api/troqueles")
async def crear_troquel(troquel: TroquelForm):
    """Da de alta un nuevo troquel en el sistema"""
    nuevo_dato = troquel.dict()
    nuevo_dato["estado_activo"] = "Activo"
    response = supabase.table("troqueles").insert(nuevo_dato).execute()
    return {"status": "success", "data": response.data}

@app.put("/api/troqueles/{id_db}")
async def editar_troquel(id_db: int, troquel: TroquelForm):
    """Actualiza la información de un troquel existente"""
    datos_actualizados = troquel.dict()
    response = supabase.table("troqueles").update(datos_actualizados).eq("id", id_db).execute()
    return {"status": "success", "data": response.data}

@app.post("/api/borrar/{id_db}")
async def mover_a_papelera(id_db: int):
    """Soft Delete: Mueve el troquel a la papelera sin borrar su historial"""
    response = supabase.table("troqueles").update({"estado_activo": "En Papelera"}).eq("id", id_db).execute()
    return {"status": "success"}

@app.get("/api/health")
def health():
    return {"status": "ok", "sistema": "ERP Packaging"}