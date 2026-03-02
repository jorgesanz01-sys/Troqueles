from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional
from supabase import create_client, Client

app = FastAPI()

SUPABASE_URL = "https://pkaqgtelkdhxlyjodzbq.supabase.co"
SUPABASE_KEY = "sb_publishable_8F5hCEJTDggd-uus5BKW_Q_891Hr856"
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Modelo de datos unificado para Crear y Editar
class TroquelForm(BaseModel):
    id_troquel: str
    nombre: str
    ubicacion: str
    categoria_id: Optional[int] = None
    tamano_troquel: Optional[str] = ""
    tamano_final: Optional[str] = ""
    observaciones: Optional[str] = ""

@app.get("/api/categorias")
async def listar_categorias():
    response = supabase.table("categorias").select("*").order("nombre").execute()
    return response.data

@app.get("/api/troqueles")
async def listar_troqueles():
    response = supabase.table("troqueles")\
        .select("*, categorias(nombre)")\
        .neq("estado_activo", "En Papelera")\
        .order("nombre")\
        .execute()
    return response.data

@app.post("/api/troqueles")
async def crear_troquel(troquel: TroquelForm):
    nuevo_dato = troquel.dict()
    nuevo_dato["estado_activo"] = "Activo"
    response = supabase.table("troqueles").insert(nuevo_dato).execute()
    return {"status": "success", "data": response.data}

# ¡NUEVA RUTA! Para editar troqueles existentes
@app.put("/api/troqueles/{id_db}")
async def editar_troquel(id_db: int, troquel: TroquelForm):
    datos_actualizados = troquel.dict()
    response = supabase.table("troqueles").update(datos_actualizados).eq("id", id_db).execute()
    return {"status": "success", "data": response.data}

@app.post("/api/borrar/{id_db}")
async def mover_a_papelera(id_db: int):
    response = supabase.table("troqueles").update({"estado_activo": "En Papelera"}).eq("id", id_db).execute()
    return {"status": "success"}

@app.get("/api/health")
def health():
    return {"status": "ok"}