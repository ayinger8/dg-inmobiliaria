# Migración de listings: de Supabase a Astro Content Collections

**Fecha:** 2026-09-23
**Proyecto:** dg-inmobiliaria
**Estado:** aprobado — pendiente de implementación

## Objetivo

Eliminar Supabase del sitio y convertir el catálogo de propiedades en contenido versionado en el repo. Cada listing se define como un archivo Markdown con frontmatter estructurado; el operador (Claude) cura la información desde las páginas oficiales de los desarrollos o las notas/fotos que provea el usuario, y hace commit.

## Motivación

- El flujo Supabase + tabla dinámica no le funciona al usuario en la práctica.
- El catálogo es de bajo volumen (5–15 listings), sin necesidad de multiusuario ni edición desde móvil.
- Preferencia por que la información se construya con curaduría desde fuentes oficiales, no llenando un formulario.
- Eliminar dependencia externa reduce costos, tiempo de build, cold starts en Vercel y superficie de fallo.

## Arquitectura

Astro Content Collections + carpeta de imágenes por propiedad + sitio 100% estático.

```
src/
  content/
    config.ts                      # schema Zod (single source of truth)
    propiedades/
      <slug>.md                    # frontmatter + descripción markdown
  assets/
    propiedades/
      <slug>/                      # 01.webp, 02.webp, ... (Astro las optimiza)
```

- **`getCollection('propiedades')`** reemplaza a `getPropiedades()`.
- **`getEntry('propiedades', slug)`** reemplaza a `getPropiedadBySlug()`.
- **`getStaticPaths()`** obligatorio en `/propiedades/[slug].astro` porque el sitio pasa a `output: 'static'`.
- Astro `<Image>` optimiza automáticamente a WebP responsive con srcset y lazy loading.

## Schema (`src/content/config.ts`)

```ts
import { defineCollection, z } from 'astro:content';

const ZONA = z.enum([
  'Cerritos', 'Marina Mazatlán', 'Zona Dorada', 'El Cid',
  'Centro Histórico', 'Lomas del Mar', 'Brujas', 'Los Pinos',
]);

const propiedades = defineCollection({
  type: 'content',
  schema: z.object({
    // Obligatorios
    titulo: z.string(),
    tipo: z.enum(['casa', 'departamento', 'terreno', 'desarrollo']),
    estadoVenta: z.enum(['disponible', 'apartado', 'vendido']),
    zona: ZONA,
    precio: z.number().positive(),
    moneda: z.enum(['MXN', 'USD']).default('MXN'),

    // Opcionales de display
    precioDesde: z.boolean().default(false),          // "Desde $X"
    precioPorM2: z.number().positive().optional(),
    estadoPublicacion: z.enum(['preventa', 'destacada']).optional(),
    destacada: z.boolean().default(false),            // ordena primero en el listing

    // Ubicación
    direccionAprox: z.string().optional(),
    latitud: z.number().min(-90).max(90).optional(),
    longitud: z.number().min(-180).max(180).optional(),

    // Métricas
    metrosTerreno: z.number().positive().optional(),
    metrosConstruccion: z.number().positive().optional(),

    // Listas
    caracteristicas: z.array(z.string()).default([]), // "3 recámaras", "Alberca", etc.
    aceptaCreditos: z.array(z.string()).default([]),  // "INFONAVIT", "Bancario"

    // Trazabilidad (interno)
    fuenteOficial: z.string().url().optional(),

    // Imágenes
    portada: z.string().optional(),                   // nombre archivo dentro de src/assets/propiedades/<slug>/
    numImagenes: z.number().int().min(0).default(0),  // cuántos archivos 01..NN.webp existen; 0 permite crear listing sin fotos aún
  }),
});

export const collections = { propiedades };
```

**Notas del schema:**
- `slug` no está: Astro lo deriva del nombre del archivo `<slug>.md`.
- La **descripción larga** va en el cuerpo del `.md`, no como campo.
- `numImagenes` es explícito (más simple que globar filesystem desde `src/assets/`); el operador pone `03` si hay 03 imágenes numeradas `01.webp`, `02.webp`, `03.webp`.
- Campos cortados vs. schema Supabase original: `id`, `activa`, `visitas`, `created_at`, `updated_at`, `carpeta_imagenes`, `servicios`, `escrituras`, `uso_de_suelo`. Los tres últimos nunca aparecieron en la UI; si alguno se necesita puntualmente, se agrega como bullet dentro de la descripción markdown.

## Ejemplo de archivo listing

`src/content/propiedades/residencial-marina-bonita.md`:

```markdown
---
titulo: Residencial Marina Bonita
tipo: desarrollo
estadoVenta: disponible
estadoPublicacion: preventa
zona: Marina Mazatlán
precio: 2850000
precioDesde: true
moneda: MXN
destacada: true
direccionAprox: Av. Sábalo Cerritos km 12, Marina Mazatlán
latitud: 23.2867
longitud: -106.4589
metrosConstruccion: 95
caracteristicas:
  - 2 recámaras
  - 2 baños
  - 1 estacionamiento
  - Alberca
  - Roof garden
  - Seguridad 24/7
aceptaCreditos:
  - Bancario
  - Contado
fuenteOficial: https://marinabonita.mx
numImagenes: 6
---

Residencial de departamentos frente a la marina, con vistas panorámicas
al Pacífico y a la Isla de la Piedra. Amenidades tipo resort incluyen
alberca infinity, roof garden con asadores, gimnasio equipado y coworking.

**Fase 1 en preventa** con entregas estimadas para Q4 2027. Modelos de 2 y 3
recámaras, todos con balcón y estacionamiento techado.
```

## Cambios al código actual

| Archivo | Acción |
|---|---|
| `astro.config.mjs` | `output: 'static'`, remover `adapter: vercel()` y su import |
| `package.json` | Remover `@supabase/supabase-js`, `@astrojs/vercel`. Ejecutar `npm install` para regenerar lock. |
| `src/lib/supabase.ts` | Borrar completo |
| `src/content/config.ts` | Crear con schema Zod |
| `src/pages/propiedades.astro` | Reemplazar import y `getPropiedades()` por `getCollection('propiedades')`. Mapear cada entry al shape que espera el `<script define:vars={{ initialProps }}>` (mismo shape que hoy, adaptando nombres si difieren). UI, CSS y filtros cliente-side sin tocar. |
| `src/pages/propiedades/[slug].astro` | Añadir `getStaticPaths()` que genera una ruta por entry. Reemplazar `getPropiedadBySlug()` por `getEntry()`. Eliminar bloque de Supabase Storage: las imágenes salen de `src/assets/propiedades/<slug>/01..NN.webp` construyendo un array vía `import.meta.glob('/src/assets/propiedades/**/*.webp', { eager: true })` filtrado por slug. Renderizar la descripción con `<Content />` del entry (soporta markdown enriquecido en lugar del `<p>{prop.descripcion}</p>` actual). Reemplazar el fetch de related por un filtro sobre `getCollection('propiedades')` (mismo tipo primero, hasta 3). |
| `.env` | Borrar `PUBLIC_SUPABASE_URL` y `PUBLIC_SUPABASE_ANON_KEY` |
| Vercel dashboard | Usuario borra manualmente las envs `PUBLIC_SUPABASE_*` en producción |
| `supabase/schema.sql` | Borrar (queda en git history si algún día se necesita reconstruir la tabla) |
| `.mcp.json` | Revisar; si tiene entrada de Supabase MCP, quitarla |

**Preservado sin cambios:**
- Todo el CSS y BEM classes existentes.
- El script cliente de filtros/paginación en `/propiedades`.
- La galería/lightbox/swiper del detalle.
- El form de contacto (ya envía por WhatsApp, nunca dependió de Supabase).
- Componentes de UI (`Header`, `Footer`, `Hero`, etc.).

## Migración de las 9 propiedades semilla

Script one-shot `scripts/migrate-from-supabase.mjs`:

1. Lee `PUBLIC_SUPABASE_URL` y `PUBLIC_SUPABASE_ANON_KEY` del `.env` local (usando Node 20+ `node --env-file=.env` o el paquete `dotenv`).
2. `SELECT * FROM propiedades WHERE activa = true`.
3. Para cada registro:
   - Genera `src/content/propiedades/<slug>.md` con frontmatter mapeado del schema Supabase al schema nuevo (dropea `id`, `activa`, `visitas`, timestamps, `uso_de_suelo`, `servicios`, `escrituras`).
   - La columna `descripcion` de Supabase se convierte en el body markdown.
   - Descarga imágenes del bucket `propiedades-imagenes/<carpeta_imagenes>/` con `supabase.storage.list()` + `download()`, y las guarda en `src/assets/propiedades/<slug>/01.webp`, `02.webp`, ... renombradas secuencialmente.
   - Setea `numImagenes` según cuántas bajó.
4. Log final: X archivos MD creados, Y imágenes descargadas.

El script se corre **una sola vez** y luego se puede borrar (queda en git history). Requiere que Supabase siga accesible en el momento de la migración; hay que correrlo **antes** de borrar el cliente y las envs.

## Orden de ejecución sugerido (para el plan)

1. Crear `src/content/config.ts` con el schema.
2. Escribir y ejecutar `scripts/migrate-from-supabase.mjs` una vez → verificar que los 9 `.md` y las carpetas de imágenes se generaron bien.
3. Refactorizar `/propiedades.astro` para leer de la collection. Verificar con `astro dev` que el listing renderiza los 9.
4. Refactorizar `/propiedades/[slug].astro` (getStaticPaths + imágenes locales + Content markdown). Verificar cada una de las 9 rutas en dev.
5. Cambiar `astro.config.mjs` a `static` y limpiar deps + envs.
6. `astro build` verde. `astro preview` verifica el sitio estático.
7. Commit y push. Vercel autodetecta y despliega.
8. Usuario borra envs `PUBLIC_SUPABASE_*` del dashboard Vercel.
9. Borrar `scripts/migrate-from-supabase.mjs`, `src/lib/supabase.ts`, `supabase/schema.sql`.

## No incluido (YAGNI)

- **CMS visual** (Decap/Tina). Para 5–15 listings y flujo "yo curo desde fuente oficial", overkill.
- **Schema polimórfico** desarrollos vs. propiedades individuales. Se maneja con `tipo: 'desarrollo'` y notas en la descripción. Si algún desarrollo necesita mostrar múltiples modelos con precios distintos, se agrega un campo opcional `modelos: []` después.
- **Preservar histórico de leads/visitas de Supabase.** El sitio actual no los usaba de forma visible; si el usuario los quiere para BI, se exportan a CSV antes de eliminar el proyecto Supabase y quedan en un archivo aparte.
- **Video tour, 3D, PDF descargable.** Ningún listing lo pide hoy. Se añade cuando aparezca el caso real.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Supabase se cae/pierde acceso antes de correr el script de migración | Correr el script como PRIMER paso, con Supabase todavía activo |
| Alguna propiedad tiene datos que no encajan en el enum de `zona` | El script logea warnings y deja el campo vacío; el usuario corrige a mano en el `.md` |
| Astro `<Image>` no acepta rutas dinámicas por variable en algunos casos | Alternativa: dejar imágenes en `public/propiedades/<slug>/` y renunciar a optimización automática (más simple, menos performante). Decidir en implementación si aparece el problema. |
| Vercel sigue haciendo build como serverless por el adapter | Verificar que tras remover el adapter, Vercel autodetecta como sitio estático (lo hace) |

## Aprobaciones

- Arquitectura: ✅ (sección 1)
- Schema: ✅ (sección 2)
- Plan de cambios + migración: ✅ (sección 3)
