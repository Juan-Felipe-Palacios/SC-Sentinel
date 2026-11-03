#!/usr/bin/env node
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Valida ejemplos JSON contra los JSON Schemas del contrato v1 SIN dependencias.
// Schema engine minima inline (draft 2020-12 subset: type, required, properties,
// additionalProperties=false, enum, minimum, maximum, pattern, minLength/maxLength).
// M1+ puede migrar a ajv si la validación se vuelve compleja (YAGNI ahora).

const fs = require("fs");
const path = require("path");

const CONTRACTS = path.join(__dirname, "..", "docs", "contracts");
let failures = 0;

function fail(msg) { console.error(`FAIL: ${msg}`); failures++; }
function load(rel) { return JSON.parse(fs.readFileSync(path.join(CONTRACTS, rel), "utf8")); }

// --- Subset de validación JSON Schema ---
function validate(value, schema, canonical, errors, pathStr) {
  if (schema.type === "object") {
    if (typeof value !== "object" || value === null || Array.isArray(value))
      return errors.push(`${canonical || pathStr}: se esperaba objeto, se recibió ${typeof value}`), false;
    if (schema.required)
      for (const req of schema.required)
        if (!(req in value)) errors.push(`${canonical || pathStr}: falta propiedad requerida "${req}"`);
    for (const [k, sub] of Object.entries(schema.properties || {})) {
      if (k in value) sub && validate(value[k], sub, null, errors, pathStr ? `${pathStr}.${k}` : k);
    }
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(schema.properties || {}));
      for (const k of Object.keys(value))
        if (!allowed.has(k)) errors.push(`${canonical || pathStr}: propiedad adicional "${k}" no permitida`);
    }
    return true;
  }
  if (schema.type === "array") {
    if (!Array.isArray(value)) return errors.push(`${canonical || pathStr}: se esperaba array`), false;
    value.forEach((item, i) => item && schema.items && validate(item, schema.items, null, errors, `${pathStr}[${i}]`));
    return true;
  }
  if (schema.type === "string") {
    if (typeof value !== "string") return errors.push(`${canonical || pathStr}: se esperaba string`), false;
    if (schema.enum && !schema.enum.includes(value)) errors.push(`${pathStr}: "${value}" no está en enum [${schema.enum.join(", ")}]`);
    if (schema.minLength != null && value.length < schema.minLength) errors.push(`${pathStr}: longitud ${value.length} < minLength ${schema.minLength}`);
    if (schema.maxLength != null && value.length > schema.maxLength) errors.push(`${pathStr}: longitud ${value.length} > maxLength ${schema.maxLength}`);
    if (schema.pattern && new RegExp(schema.pattern).test(value) === false) errors.push(`${pathStr}: "${value}" no matchea patrón ${schema.pattern}`);
    return true;
  }
  if (schema.type === "integer" || schema.type === "number") {
    if (typeof value !== "number" || (schema.type === "integer" && !Number.isInteger(value)))
      return errors.push(`${pathStr}: se esperaba ${schema.type}`), false;
    if (schema.minimum != null && value < schema.minimum) errors.push(`${pathStr}: ${value} < minimum ${schema.minimum}`);
    if (schema.maximum != null && value > schema.maximum) errors.push(`${pathStr}: ${value} > maximum ${schema.maximum}`);
    return true;
  }
  if (schema.type === "boolean") {
    if (typeof value !== "boolean") errors.push(`${pathStr}: se esperaba boolean`);
    return true;
  }
  if (schema.type === "null") {
    if (value !== null) errors.push(`${pathStr}: se esperaba null`);
    return true;
  }
  return true;
}

// Snapshot: los ejemplos válidos del doc set deben pasar el schema
// window-snapshot.v1. Los $defs internos del schema se resuelven en línea.
function resolveRefs(schema, root) {
  if (Array.isArray(schema)) return schema.map((s) => resolveRefs(s, root));
  if (schema === null || typeof schema !== "object") return schema;
  if (typeof schema.$ref === "string" && schema.$ref.startsWith("#/$defs/")) {
    const def = root.$defs?.[schema.$ref.slice("#/$defs/".length)];
    return def ? resolveRefs(def, root) : {};
  }
  const out = {};
  for (const [k, v] of Object.entries(schema)) out[k] = resolveRefs(v, root);
  return out;
}

function validateValid(name, schemaFile, exampleFile) {
  const root = load(schemaFile);
  const schema = resolveRefs(root, root);
  const example = load(exampleFile);
  const errors = [];
  validate(example, schema, false, errors, "$");
  if (errors.length) fail(`${name}: ${errors.join("; ")}`);
  else console.log(`OK: ${name} valida contra ${schemaFile}`);
}

function validateInvalid(name, schemaFile, exampleFile) {
  const root = load(schemaFile);
  const schema = resolveRefs(root, root);
  const example = load(exampleFile);
  const errors = [];
  validate(example, schema, false, errors, "$");
  if (!errors.length) fail(`${name} (inválido): no generó ningún error y debería`);
  else console.log(`OK: ${name} rechazado correctamente (${errors.length} errores detectados)`);
}

// --- Casos principales (agregar más cuando aparezcan nuevos contratos) ---
validateValid("snapshot-minimal", "window-snapshot.v1.schema.json", "examples/snapshot-minimal.json");
validateValid("snapshot-with-alerts", "window-snapshot.v1.schema.json", "examples/snapshot-with-alerts.json");
// El envelope completo de /api/ingest (§5.1) se valida desde M2 con ajv.

if (failures > 0) { console.error(`\n${failures} fallos de validación.`); process.exit(1); }
console.log("\nContratos OK.");
// Trigger exerciser: forzar evaluacion del filtro paths del workflow contracts.yml (M0).
