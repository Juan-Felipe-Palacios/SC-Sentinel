// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

// Compatibilidad con imports antiguos; los contratos viven en @/lib/schemas/query y @/lib/query/range.
export { QueryParamsSchema, type QueryParams, type QueryRange } from '@/lib/schemas/query';
export { getRangeBounds, seriesBucketSeconds, type RangeBounds } from './range';
