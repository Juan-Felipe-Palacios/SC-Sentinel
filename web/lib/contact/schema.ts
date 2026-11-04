// SC-Sentinel — schema compartido del formulario de contacto (cliente + servidor).
// El mensaje se loguea en la plataforma; no se persiste en la base de datos.
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
import { z } from 'zod';

export const MAX_MESSAGE_LENGTH = 4000;
export const RATE_LIMIT_PER_HOUR = 10;

export const ContactSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre es demasiado corto.').max(80, 'El nombre es demasiado largo.'),
  email: z.string().trim().email('Ingresa un email válido.').max(254, 'El email es demasiado largo.'),
  asunto: z.string().trim().min(2, 'El asunto es demasiado corto.').max(120, 'El asunto es demasiado largo.'),
  mensaje: z
    .string()
    .trim()
    .min(10, 'El mensaje es demasiado corto (mínimo 10 caracteres).')
    .max(MAX_MESSAGE_LENGTH, `El mensaje es demasiado largo (máximo ${MAX_MESSAGE_LENGTH} caracteres).`),
  // Honeypot anti-spam: si trae contenido se descarta en silencio (debe aceptar texto para distinguirlo).
  website: z.string().max(512).optional(),
});

export type ContactInput = z.infer<typeof ContactSchema>;
