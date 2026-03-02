from fastapi import FastAPI
from supabase import create_client, Client
import os

app = FastAPI()

# Configuración de Supabase
SUPABASE_URL = "https://pkaqgtelkdhxlyjodzbq.supabase.co"
SUPABASE_KEY = "sb_publishable_8F5hCEJTDggd-uus5BKW_Q_891Hr856"
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

@app.get("/api/troqueles")
async def listar_troqueles():
    # Solo traemos los que no están en la papelera
    response = supabase.table("troqueles")\
        .select("*")\
        .neq("estado_activo", "En Papelera")\
        .execute()
    return response.data

@app.get("/api/troqueles/{id_buscado}")
async def detalle_troquel(id_buscado: str):
    response = supabase.table("troqueles")\
        .select("*")\
        .eq("id_troquel", id_buscado)\
        .single()\
        .execute()
    return response.data