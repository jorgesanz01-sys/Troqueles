from fastapi import FastAPI
from supabase import create_client, Client
import os

app = FastAPI()

# Configuración de Supabase con tus credenciales
# Nota: Funciona perfectamente así, pero a futuro te enseñaré a ocultarlas por seguridad.
SUPABASE_URL = "https://pkaqgtelkdhxlyjodzbq.supabase.co"
SUPABASE_KEY = "sb_publishable_8F5hCEJTDggd-uus5BKW_Q_891Hr856"
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

@app.get("/api/troqueles")
async def listar_troqueles():
    # Solo traemos los que no están en la papelera (Regla de Oro)
    response = supabase.table("troqueles")\
        .select("*")\
        .neq("estado_activo", "En Papelera")\
        .order("nombre")\
        .execute()
    return response.data

@app.get("/api/troqueles/{id_buscado}")
async def detalle_troquel(id_buscado: str):
    # Buscador exacto para cuando el Escáner QR lea un código
    response = supabase.table("troqueles")\
        .select("*")\
        .eq("id_troquel", id_buscado)\
        .execute()
    return response.data

@app.post("/api/borrar/{id_db}")
async def mover_a_papelera(id_db: int):
    # Regla de Oro: Borrado Lógico (Soft Delete)
    response = supabase.table("troqueles")\
        .update({"estado_activo": "En Papelera"})\
        .eq("id", id_db)\
        .execute()
    return {"status": "success", "message": "Troquel movido a papelera"}

@app.get("/api/health")
def health():
    return {"status": "ok", "message": "API funcionando correctamente"}