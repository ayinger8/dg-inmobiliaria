import { defineCollection, z } from 'astro:content';

const ZONA = z.enum([
  'Cerritos',
  'Marina Mazatlán',
  'Zona Dorada',
  'El Cid',
  'Centro Histórico',
  'Lomas del Mar',
  'Brujas',
  'Los Pinos',
]);

const propiedades = defineCollection({
  type: 'content',
  schema: z.object({
    // Obligatorios
    titulo: z.string().min(1),
    tipo: z.enum(['casa', 'departamento', 'terreno', 'desarrollo']),
    estadoVenta: z.enum(['disponible', 'apartado', 'vendido']),
    zona: ZONA,
    precio: z.number().positive(),
    moneda: z.enum(['MXN', 'USD']).default('MXN'),

    // Opcionales de display
    precioDesde: z.boolean().default(false),
    precioPorM2: z.number().positive().optional(),
    estadoPublicacion: z.enum(['preventa', 'destacada']).optional(),
    destacada: z.boolean().default(false),

    // Ubicación
    direccionAprox: z.string().optional(),
    latitud: z.number().min(-90).max(90).optional(),
    longitud: z.number().min(-180).max(180).optional(),

    // Métricas
    metrosTerreno: z.number().positive().optional(),
    metrosConstruccion: z.number().positive().optional(),

    // Listas
    caracteristicas: z.array(z.string()).default([]),
    aceptaCreditos: z.array(z.string()).default([]),

    // Trazabilidad interna
    fuenteOficial: z.string().url().optional(),

    // Imágenes
    portada: z.string().optional(),
    numImagenes: z.number().int().min(0).default(0),
  }),
});

export const collections = { propiedades };
