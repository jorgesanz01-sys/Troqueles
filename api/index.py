from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional
from supabase import create_client, Client

app = FastAPI()

SUPABASE_URL = "https://pkaqgtelkdhxlyjodzbq.supabase.co"
SUPABASE_KEY = "sb_publishable_8F5hCEJTDggd-uus5BKW_Q_891Hr856"
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Modelo de datos actualizado con los nuevos campos
class NuevoTroquel(BaseModel):
    id_troquel: str
    nombre: str
    ubicacion: str
    categoria_id: Optional[int] = None
    tamano_troquel: Optional[str] = ""
    tamano_final: Optional[str] = ""
    observaciones: Optional[str] = ""

@app.get("/api/categorias")
async def listar_categorias():
    # Traemos las familias disponibles para el desplegable
    response = supabase.table("categorias").select("*").order("nombre").execute()
    return response.data

@app.get("/api/troqueles")
async def listar_troqueles():
    # Magia relacional: Traemos los troqueles y también el nombre de su categoría unida
    response = supabase.table("troqueles")\
        .select("*, categorias(nombre)")\
        .neq("estado_activo", "En Papelera")\
        .order("nombre")\
        .execute()
    return response.data

@app.get("/api/troqueles/{id_buscado}")
async def detalle_troquel(id_buscado: str):
    response = supabase.table("troqueles").select("*, categorias(nombre)").eq("id_troquel", id_buscado).execute()
    return response.data

@app.post("/api/troqueles")
async def crear_troquel(troquel: NuevoTroquel):
    nuevo_dato = {
        "id_troquel": troquel.id_troquel,
        "nombre": troquel.nombre,
        "ubicacion": troquel.ubicacion,
        "categoria_id": troquel.categoria_id,
        "tamano_troquel": troquel.tamano_troquel,
        "tamano_final": troquel.tamano_final,
        "observaciones": troquel.observaciones,
        "estado_activo": "Activo"
    }
    response = supabase.table("troqueles").insert(nuevo_dato).execute()
    return {"status": "success", "data": response.data}

@app.post("/api/borrar/{id_db}")
async def mover_a_papelera(id_db: int):
    response = supabase.table("troqueles").update({"estado_activo": "En Papelera"}).eq("id", id_db).execute()
    return {"status": "success"}

@app.get("/api/health")
def health():
    return {"status": "ok"}