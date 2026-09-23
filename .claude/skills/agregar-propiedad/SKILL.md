---
name: agregar-propiedad
description: Publicar una propiedad nueva en dg-inmobiliaria.mx desde info que pasa el usuario (post de Facebook, página oficial, notas + fotos). Cubre curación de imágenes, mapeo al schema, redacción, commit y deploy a producción. Úsala cada vez que el usuario diga "agrega esta propiedad", "sube este listing", "publica esta preventa" o similar, y también cuando pase un link/screenshot/carpeta de fotos de un desarrollo.
---

# Agregar propiedad a dg-inmobiliaria

Guía maestra para publicar una propiedad nueva en el sitio. Léela completa antes de arrancar cada vez — no es una guía "referencia rápida", es una checklist.

## Contexto del proyecto

- **Repo:** `github.com/ayinger8/dg-inmobiliaria` (rama `master`)
- **Local (esta máquina):** `E:\PROYECTOS\dg-inmobiliaria\`. En otra compu es donde el usuario haya hecho `git clone`.
- **Prod:** `https://dg-inmobiliaria-gamma.vercel.app`
- **Stack:** Astro 5 con `output: 'static'`. Contenido en Astro Content Collections (`src/content/propiedades/*.md`). Imágenes en `src/assets/propiedades/<slug>/`.
- **Schema del listing:** `src/content/config.ts` (Zod). Es la fuente de verdad de los campos permitidos.
- **Integración GitHub → Vercel webhook está rota.** Los push a master **NO** disparan deploy automático. Deploy manual con Vercel CLI (paso final abajo).

## Flujo end-to-end

### 0. Antes de tocar código: sincronizar

Si estás en otra máquina o hace rato no trabajas:

```bash
cd <ruta-al-repo>
git pull
```

Si hay conflictos, resuélvelos antes de seguir.

### 1. Reunir información

Tú (Claude) NO tienes acceso a Facebook (bloquean bots). El usuario debe pasarte:

1. **Texto del post** (copy/paste completo, con emojis y todo).
2. **Fotos** — ubicación en disco local o Drive. **NO** basta el link de FB, necesitas los archivos.
3. Opcional pero útil: URL del post oficial, dirección exacta, lat/long, m² de construcción/terreno si no vienen en el post.

Si falta algo esencial (precio, tipo de propiedad, zona, mínimo 2-3 fotos), **pregunta**. No publiques a medias.

### 2. Curar imágenes — CRÍTICO

**Este paso es donde antes fallé.** Antes de mover cualquier archivo:

**a) Lee TODAS las fotos con el tool Read (soy multimodal, veo el contenido).**

**b) Clasifica cada foto:**

| Categoría | Acción |
|---|---|
| Fachada exterior amplia, ambiente cálido, luz natural buena | **Portada candidata (posición 01-02)** |
| Fachada con detalle arquitectónico o portón con nombre del desarrollo | Posición temprana (02-03) |
| Render 3D interior (planta axonométrica, vista de sala/recámara realista) | Posición media (03-04) |
| Amenidades interesantes (alberca, gym, roof, áreas comunes con vida) | Posición media (04-05) |
| Plano técnico 2D con medidas (útil pero visualmente débil) | Al final (últimas 1-2) |
| Locales comerciales / vista de servicios cercanos | Baja prioridad, al final si es relevante |
| **Flyer promocional con logo, teléfono, precio sobre-impreso** | **DESCARTAR SIEMPRE** |
| **Screenshot de Facebook con UI, comentarios visibles** | **DESCARTAR SIEMPRE** |
| **Fotos con marca de agua de OTRA inmobiliaria** | **DESCARTAR SIEMPRE** |
| Fotos duplicadas, borrosas, mal iluminadas, cortadas | Descartar |
| Fotos verticales/portrait de mala calidad | Descartar salvo que sean únicas fuentes de esa información |

**c) Elige MAX 6-10 fotos para el listing final.** Aunque el post tenga 20-30, curar reduce la fatiga del usuario y aumenta la percepción de calidad. Menos es más cuando es curado.

**d) Ordénalas para máximo impacto:**
   1. Impacto exterior amplio (fachada con vida, luz cálida, plantas)
   2. Otra fachada o vista de calle con contexto urbano
   3. Portón/identidad del desarrollo si tiene nombre
   4. Render interior 3D
   5. Amenidad principal
   6. Planos técnicos / información complementaria

**e) Reporta al usuario tu curación** antes de subir: "Voy a usar N fotos así ordenadas, descarté X por Y razón". Deja que revise. Si dice "elimina las que no te funcionen", tienes su ok para descartar sin preguntar cada una.

### 3. Extraer información completa

Del texto del post + análisis visual de las fotos:

- **Nombre real del desarrollo** — muchas veces está en el portón, letreros, flyers dentro de las fotos, aunque el post no lo diga. **Es CRÍTICO** para el título. Si el post dice "Preventa en Alarcón" pero el portón dice "Isla Venados Residencial", el título es *"Isla Venados Residencial — Preventa en Alarcón"*.
- **Superficie total (m²)** — el plano técnico suele tener esto, no siempre está en el post.
- **Estacionamientos** — el plano puede mostrar cajones.
- **Amenidades no mencionadas** — a veces los renders muestran alberca/gym que el post olvidó.
- **Precio** — usar el del post (más específico). Si hay discrepancia con el flyer, quedarte con el más reciente. **Nunca inventar.**
- **Colonia/zona** — mapear al enum en `src/content/config.ts`. Si no existe, hay que ampliar el enum (ver paso 4b).

### 4. Escribir el `.md`

**a) Slug (nombre del archivo):**
- Formato: kebab-case, corto, descriptivo.
- Preferencia: `<nombre-desarrollo>-<colonia-corta>` (ej: `isla-venados-alarcon`).
- Si no hay nombre de desarrollo: `<tipo>-<colonia>-<característica>` (ej: `casa-cerritos-vista-mar`).
- NO cambies un slug ya publicado sin migración — rompe URLs.

**b) Zona: mapear al enum del schema.**

Enum actual (verificar en `src/content/config.ts`):
`Cerritos`, `Marina Mazatlán`, `Zona Dorada`, `El Cid`, `Centro Histórico`, `Lomas del Mar`, `Brujas`, `Los Pinos`, `Alarcón`.

Si la zona no está: **abrir `src/content/config.ts`**, agregar el string al array `ZONA`, guardar. Es una modificación válida y esperada.

**c) Frontmatter (todos los campos aplicables):**

```yaml
---
titulo: "<Desarrollo — Modalidad + zona>"   # ej: "Isla Venados Residencial — Preventa en Alarcón"
tipo: casa | departamento | terreno | desarrollo
estadoVenta: disponible | apartado | vendido    # default: disponible
estadoPublicacion: preventa | destacada          # opcional; deja fuera si es venta normal
zona: <valor exacto del enum>
precio: <número sin comas ni símbolos>            # ej: 1247810
precioDesde: true                                 # true si preventa con "desde $X"
moneda: MXN | USD                                 # default MXN
destacada: true                                   # true para lanzamientos importantes
direccionAprox: "<colonia, ciudad, estado>"
latitud: <-90..90>                               # opcional; solo si tienes coords exactas
longitud: <-180..180>                            # opcional
metrosTerreno: <número>                          # opcional
metrosConstruccion: <número>                     # opcional
caracteristicas:                                  # lista de bullets con iconos auto-detectados
  - N recámaras
  - N baños
  - N estacionamientos
  - Alberca
  - Roof garden
  - ...
aceptaCreditos:
  - INFONAVIT
  - FOVISSSTE
  - Crédito hipotecario bancario
  - Contado
fuenteOficial: "<URL de la fuente>"              # opcional pero recomendado (post FB, sitio oficial)
numImagenes: <cantidad final después de curar>
---
```

**Notas críticas:**
- El schema Zod valida al build. Si un campo está mal (zona no existe, número negativo, string donde va número), `astro sync` te grita.
- No incluyas `precioDesde: false` innecesariamente — el default es false.
- No incluyas campos vacíos (`descripcion: ""`, `caracteristicas: []`) — el schema tiene defaults.

**d) Cuerpo del `.md` (descripción larga en markdown):**

**No copies el texto crudo del post.** Reescribe con estructura:

```markdown
**<Nombre del desarrollo o gancho corto>** presenta <hook narrativo de 2-3
frases que combina desarrollo + zona + target del cliente>.

## Distribución interior

- <items>

**Superficie total: X m²** (si aplica y hay dato).

## Amenidades

- <si aplica>

## Ubicación

<descripción de la colonia con referencias reales cerca: playa, avenida
principal, centro comercial. No inventes.>

## Opciones de compra

- **INFONAVIT**
- **FOVISSSTE**
- **Crédito hipotecario bancario**
- **Compra directa (contado)**

Precio desde **$X,XXX,XXX MXN**.

_<CTA suave: "Agenda tu visita para conocer los modelos" — sin duplicar
el form/WhatsApp del sidebar>._
```

**Reglas de estilo:**
- **Sin emojis** — el sitio ya tiene diseño limpio, los emojis del post rompen el estilo.
- **Sin números de teléfono en el cuerpo** — todos los CTAs van al WhatsApp global del sitio (`526699334134`).
- **Sin logos ni marcas de terceros** en la descripción.
- **Sin ALL CAPS gritado** — el post usa mayúsculas para dramatizar; nosotros usamos jerarquía markdown (negritas, headings) para lo mismo con mejor gusto.
- Tono: informativo, cálido, sin adjetivos vacíos ("increíble", "espectacular"). Datos concretos venden mejor.

### 5. Instalar imágenes en el filesystem

Renombrar y mover a `src/assets/propiedades/<slug>/`:

```bash
mkdir -p "src/assets/propiedades/<slug>"
# Copiar/mover fotos curadas en el orden decidido, renombrando 01, 02, ...
cp "<ruta-origen>/<archivo1>" "src/assets/propiedades/<slug>/01.jpg"
cp "<ruta-origen>/<archivo2>" "src/assets/propiedades/<slug>/02.jpg"
# ...
```

Nombres: `01`, `02`, `03`, ..., con padding de 2 dígitos. Extensión: mantén la original (`.jpg`, `.webp`, `.png`). Astro Image se encarga de optimizar todo.

Si vienen de una carpeta con nombres feos (Facebook), no importa el nombre original — renumeramos.

**IMPORTANTE:** Asegúrate de que `numImagenes` en el frontmatter coincida con la cantidad real.

### 6. Validar

```bash
npx astro sync         # regenera tipos, valida schema Zod contra todos los .md
npm run build          # build completo, valida rutas dinámicas y assets
```

- Si `astro sync` falla: revisa el `.md`, es un problema de schema (nombre de campo mal, tipo incorrecto, zona no en el enum).
- Si `npm run build` falla: puede ser assets faltantes (`numImagenes: 7` pero solo hay 5 archivos), o algún import roto.

Corrige y vuelve a correr hasta verde.

### 7. Commit

```bash
git add src/content/propiedades/<slug>.md src/assets/propiedades/<slug>/
# Si modificaste el enum de zonas:
git add src/content/config.ts
git status    # verifica que no incluyes archivos accidentales

git commit -m "feat(content): agregar <nombre del desarrollo> en <zona>"
```

Mensaje corto pero descriptivo. Ejemplo real:
`feat(content): agregar Isla Venados Residencial en Alarcón`

### 8. Push

```bash
git push origin master
```

**Recordatorio:** el push NO dispara deploy en Vercel (webhook roto). Sigue paso 9.

### 9. Deploy a producción

Primera vez en la máquina, autenticarse:
```bash
vercel login                                      # abre browser, autoriza
vercel link --yes --project dg-inmobiliaria --scope dg-solutionsmx-projects
```

Luego (esto se corre siempre):
```bash
vercel deploy --prod --yes
```

Toma ~15-30 segundos. Al final imprime la URL nueva. Verificar:

```bash
curl -sI https://dg-inmobiliaria-gamma.vercel.app/propiedades/<slug> | head -3
```

Esperado: `HTTP/1.1 200 OK`. Si 404, el build no incluyó la nueva ruta — revisar `numImagenes`, slug, y volver.

### 10. Reportar al usuario

Mensaje final con:
- URL directa del listing nuevo (`/propiedades/<slug>`).
- URL del listing general (`/propiedades`) para ver cómo se ve la card.
- Resumen de curaduría: cuántas fotos usaste vs descartadas, título elegido, ampliaciones al schema si hubo.
- Preguntas abiertas si algo quedó ambiguo (dirección exacta, coordenadas para el mapa, video tour, etc.).

## Errores comunes a evitar

- **Publicar sin ver las fotos.** Nunca. Siempre `Read` cada imagen antes de subirla.
- **Copiar el texto del post literalmente** con emojis y ALL CAPS. Feo.
- **Meter el flyer promocional en la galería.** Nunca. Es material publicitario, no fotos del producto.
- **Poner primero la foto que resulta primera alfabéticamente** en el nombre original. Siempre curar orden por impacto.
- **Olvidar `numImagenes`** o dejarlo desalineado con la realidad. Build falla o galería queda rota.
- **Titulo genérico** ("Departamento en Mazatlán") cuando hay un nombre de desarrollo real. El nombre vende.
- **Inventar amenidades o m²** que no aparecen ni en el post ni en las fotos. Solo escribes lo que puedes sustentar.
- **Push directo a master sin `astro build` local previo.** Rompe producción.

## Comandos útiles de reversión

Si publicaste algo mal:

```bash
# Revertir un listing específico
git rm src/content/propiedades/<slug>.md
git rm -r src/assets/propiedades/<slug>
git commit -m "revert(content): quitar <slug>"
git push
vercel deploy --prod --yes

# O revertir el último commit completo
git revert HEAD
git push
vercel deploy --prod --yes
```

## Cuando trabajas desde OTRA compu

Setup previo (una sola vez por máquina):
1. Instalar Git, Node.js LTS, VS Code.
2. `gh auth login` para GitHub.
3. `git clone https://github.com/ayinger8/dg-inmobiliaria.git`
4. `npm install`
5. `vercel login` + `vercel link --yes --project dg-inmobiliaria --scope dg-solutionsmx-projects`

Después, cada sesión: `git pull` al empezar, `git push` + `vercel deploy --prod --yes` al terminar.
