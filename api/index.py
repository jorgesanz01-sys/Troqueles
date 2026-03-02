from fastapi import FastAPI
from pydantic import BaseModel
from supabase import create_client, Client
import os

app = FastAPI()

SUPABASE_URL = "https://pkaqgtelkdhxlyjodzbq.supabase.co"
SUPABASE_KEY = "sb_publishable_8F5hCEJTDggd-uus5BKW_Q_891Hr856"
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Modelo de seguridad para recibir los datos del formulario
class NuevoTroquel(BaseModel):
    id_troquel: str
    nombre: str
    ubicacion: str

@app.get("/api/troqueles")
async def listar_troqueles():
    response = supabase.table("troqueles").select("*").neq("estado_activo", "En Papelera").order("nombre").execute()
    return response.data

@app.get("/api/troqueles/{id_buscado}")
async def detalle_troquel(id_buscado: str):
    response = supabase.table("troqueles").select("*").eq("id_troquel", id_buscado).execute()
    return response.data

@app.post("/api/troqueles")
async def crear_troquel(troquel: NuevoTroquel):
    # Insertamos el nuevo registro en la base de datos
    nuevo_dato = {
        "id_troquel": troquel.id_troquel,
        "nombre": troquel.nombre,
        "ubicacion": troquel.ubicacion,
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