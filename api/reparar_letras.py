from supabase import create_client, Client

# Tus credenciales exactas
SUPABASE_URL = "https://pkaqgtelkdhxlyjodzbq.supabase.co"
SUPABASE_KEY = "sb_publishable_8F5hCEJTDggd-uus5BKW_Q_891Hr856"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Diccionario con los errores más comunes de codificación y su letra correcta
reemplazos = {
    "Ã‘": "Ñ",
    "Ã±": "ñ",
    "Ã¡": "á", "Ã©": "é", "Ã­": "í", "Ã³": "ó", "Ãº": "ú",
    "Ã ": "Á", "Ã‰": "É", "Ã\x8d": "Í", "Ã“": "Ó", "Ãš": "Ú",
    "": "Ñ"  # Este rombo suele ser casi siempre la Ñ en España
}

def limpiar_texto(texto):
    if not texto:
        return texto
    texto_limpio = str(texto)
    for error, correcto in reemplazos.items():
        texto_limpio = texto_limpio.replace(error, correcto)
    return texto_limpio

print("Iniciando escáner de limpieza de texto...")

# 1. Traer todos los troqueles
troqueles = supabase.table("troqueles").select("*").execute().data
arreglados = 0

# 2. Revisar uno por uno
for t in troqueles:
    nombre_actual = t.get('nombre', '')
    obs_actual = t.get('observaciones', '')
    arts_actual = t.get('codigos_articulo', '')
    
    nombre_limpio = limpiar_texto(nombre_actual)
    obs_limpio = limpiar_texto(obs_actual)
    arts_limpio = limpiar_texto(arts_actual)
    
    # Si hay alguna diferencia, significa que había símbolos raros y hay que actualizar
    if nombre_actual != nombre_limpio or obs_actual != obs_limpio or arts_actual != arts_limpio:
        supabase.table("troqueles").update({
            "nombre": nombre_limpio,
            "observaciones": obs_limpio,
            "codigos_articulo": arts_limpio
        }).eq("id", t["id"]).execute()
        
        arreglados += 1
        print(f"✅ Arreglado Troquel: {t.get('id_troquel')} - Nuevo nombre: {nombre_limpio}")

print(f"🎉 ¡Limpieza terminada! Se han reparado {arreglados} troqueles.")