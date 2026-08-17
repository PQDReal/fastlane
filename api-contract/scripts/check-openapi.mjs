#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { parseDocument } from "yaml";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_SPEC = path.join(REPO_ROOT, "openapi.yaml");
const ACTIVE_TEMP_PATHS = new Set();
const CHECK_ORDER = ["lint", "refs", "contract", "schemas", "codegen"];
const HTTP_METHODS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
  "trace",
]);
const PUBLIC_OPERATIONS = new Set([
  "GET /health",
  "GET /categories",
  "GET /products",
  "GET /products/{slug}",
  "GET /test-drive/availability",
  "POST /test-drive/requests",
  "POST /consultation-requests",
  "POST /estimates/on-road",
  "POST /estimates/installment",
]);
const REQUIRED_OPERATIONS = new Map([
  ["/health", ["get"]],
  ["/categories", ["get"]],
  ["/products", ["get"]],
  ["/products/{slug}", ["get"]],
  ["/test-drive/availability", ["get"]],
  ["/test-drive/requests", ["post"]],
  ["/consultation-requests", ["post"]],
  ["/estimates/on-road", ["post"]],
  ["/estimates/installment", ["post"]],
  ["/users/me", ["get", "patch"]],
  ["/cart", ["get"]],
  ["/cart/items", ["post"]],
  ["/cart/items/{itemId}", ["patch", "delete"]],
  ["/cart/promotion", ["put", "delete"]],
  ["/checkout", ["post"]],
  ["/orders", ["get"]],
  ["/orders/{orderId}", ["get"]],
  ["/orders/{orderId}/cancellation", ["post"]],
  ["/orders/{orderId}/mock-payment", ["post"]],
  ["/orders/{orderId}/mock-refund", ["post"]],
  ["/admin/dashboard/summary", ["get"]],
  ["/admin/inventory/query", ["get"]],
  ["/admin/inventory/filter-options", ["get"]],
  ["/admin/categories", ["get", "post"]],
  ["/admin/categories/{categoryId}", ["patch", "delete"]],
  ["/admin/products", ["get", "post"]],
  ["/admin/products/{productId}", ["get", "patch", "delete"]],
  ["/admin/products/{productId}/variants", ["post"]],
  ["/admin/variants/{variantId}", ["patch", "delete"]],
  ["/admin/products/{productId}/images", ["post"]],
  ["/admin/product-images/{imageId}", ["patch", "delete"]],
  ["/admin/variants/{variantId}/inventory", ["put"]],
  ["/admin/promotions", ["get", "post"]],
  ["/admin/promotions/{promotionId}", ["get", "patch", "delete"]],
  ["/admin/orders", ["get"]],
  ["/admin/orders/{orderId}", ["get"]],
  ["/admin/orders/{orderId}/transitions", ["post"]],
  ["/admin/test-drive/requests", ["get"]],
  ["/admin/test-drive/requests/{requestId}", ["get"]],
  ["/admin/test-drive/requests/{requestId}/transitions", ["post"]],
  ["/admin/test-drive/settings", ["get", "patch"]],
  ["/admin/consultation-requests", ["get"]],
  ["/admin/consultation-requests/{requestId}/transitions", ["post"]],
  ["/admin/fee-policies", ["get", "post"]],
  ["/admin/fee-policies/{feePolicyId}", ["patch"]],
  ["/admin/loan-packages", ["get", "post"]],
  ["/admin/loan-packages/{loanPackageId}", ["patch"]],
]);

class CheckFailure extends Error {}

function requireCondition(condition, message) {
  if (!condition) throw new CheckFailure(message);
}

function usage() {
  return `Usage:
  npm run check:openapi -- [all|lint|refs|contract|schemas|codegen ...] [--spec PATH]

Examples:
  npm run check:openapi
  npm run check:openapi -- lint
  npm run check:openapi -- refs contract schemas
  npm run check:openapi -- codegen --spec openapi.yaml

Options:
  --list       List check groups and exit
  --spec PATH  OpenAPI YAML path (default: openapi.yaml)
  --help       Show this help
`;
}

function parseArgs(argv) {
  const checks = [];
  let specPath = DEFAULT_SPEC;
  let list = false;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--list") {
      list = true;
    } else if (arg === "--spec") {
      index += 1;
      if (index >= argv.length) throw new CheckFailure("--spec requires a path");
      specPath = path.resolve(process.cwd(), argv[index]);
    } else if (arg.startsWith("--")) {
      throw new CheckFailure(`Unknown option: ${arg}`);
    } else if (arg === "all" || CHECK_ORDER.includes(arg)) {
      checks.push(arg);
    } else {
      throw new CheckFailure(`Unknown check: ${arg}`);
    }
  }

  const selected = checks.length === 0 || checks.includes("all")
    ? [...CHECK_ORDER]
    : CHECK_ORDER.filter((name) => checks.includes(name));
  return { selected, specPath: path.resolve(specPath), list, help };
}

const SPEC_CACHE = new Map();

function bundleToTemp(specPath) {
  const redocly = localBin(["@redocly", "cli", "bin", "cli.js"]);
  const tempPath = mkdtempSync(path.join(tmpdir(), "fastlane-openapi-bundle-"));
  ACTIVE_TEMP_PATHS.add(tempPath);
  const outputPath = path.join(tempPath, "bundled.yaml");
  try {
    runNodeTool(redocly, ["bundle", specPath, "-o", outputPath, "--lint-config=off"], REPO_ROOT, true);
    return readFileSync(outputPath, "utf8");
  } finally {
    safeRemoveTemp(tempPath);
    ACTIVE_TEMP_PATHS.delete(tempPath);
  }
}

function loadSpec(specPath) {
  if (SPEC_CACHE.has(specPath)) return SPEC_CACHE.get(specPath);
  let raw;
  try {
    const bytes = readFileSync(specPath);
    raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new CheckFailure(`Cannot read UTF-8 spec ${specPath}: ${error.message}`);
  }

  if (/\$ref:\s*['"]?(?!\s*#)/.test(raw)) {
    raw = bundleToTemp(specPath);
  }

  const parsed = parseDocument(raw, {
    prettyErrors: true,
    strict: true,
    uniqueKeys: true,
  });
  if (parsed.errors.length > 0) {
    throw new CheckFailure(
      `YAML parse failed:\n${parsed.errors.map((error) => ` - ${error.message}`).join("\n")}`,
    );
  }
  const document = parsed.toJS({ maxAliasCount: 100 });
  requireCondition(document && typeof document === "object" && !Array.isArray(document), "OpenAPI root must be an object");
  SPEC_CACHE.set(specPath, document);
  return document;
}

function* walk(node) {
  if (node && typeof node === "object" && !Array.isArray(node)) {
    yield node;
    for (const value of Object.values(node)) yield* walk(value);
  } else if (Array.isArray(node)) {
    for (const value of node) yield* walk(value);
  }
}

function resolvePointer(document, reference) {
  requireCondition(
    typeof reference === "string" && reference.startsWith("#/"),
    `Only local refs are allowed, found: ${reference}`,
  );
  let current = document;
  for (const rawSegment of reference.slice(2).split("/")) {
    const segment = rawSegment.replaceAll("~1", "/").replaceAll("~0", "~");
    requireCondition(
      current && typeof current === "object" && Object.hasOwn(current, segment),
      `Unresolved ref: ${reference}`,
    );
    current = current[segment];
  }
  return current;
}

function dereference(document, node) {
  if (!node || typeof node !== "object" || !("$ref" in node)) return node;
  const resolved = resolvePointer(document, node.$ref);
  requireCondition(resolved && typeof resolved === "object", `Reference target is not an object: ${node.$ref}`);
  return resolved;
}

function operations(document) {
  const result = [];
  for (const [route, pathItem] of Object.entries(document.paths ?? {})) {
    if (!pathItem || typeof pathItem !== "object") continue;
    for (const [method, operation] of Object.entries(pathItem)) {
      if (HTTP_METHODS.has(method) && operation && typeof operation === "object") {
        result.push({ route, method, operation, pathItem });
      }
    }
  }
  return result;
}

function operationParameters(document, route, operation) {
  const pathParameters = document.paths[route].parameters ?? [];
  return [...pathParameters, ...(operation.parameters ?? [])].map((parameter) =>
    dereference(document, parameter),
  );
}

function localBin(packageSegments) {
  const executable = path.join(REPO_ROOT, "node_modules", ...packageSegments);
  requireCondition(
    existsSync(executable),
    `Missing local tool ${executable}. Run npm ci first.`,
  );
  return executable;
}

function runNodeTool(scriptPath, args, cwd, quiet = false) {
  if (!quiet) console.log(`       $ node ${path.relative(REPO_ROOT, scriptPath)} ${args.join(" ")}`);
  const childEnvironment = { ...process.env };
  if (process.stdout.isTTY) {
    childEnvironment.FORCE_COLOR = "1";
    delete childEnvironment.NO_COLOR;
  } else {
    childEnvironment.NO_COLOR = "1";
    delete childEnvironment.FORCE_COLOR;
  }
  const completed = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd,
    encoding: "utf8",
    env: childEnvironment,
    stdio: "pipe",
  });
  if (!quiet && completed.stdout) process.stdout.write(completed.stdout);
  if (!quiet && completed.stderr) process.stdout.write(completed.stderr);
  if (completed.error) throw new CheckFailure(`Cannot execute tool: ${completed.error.message}`);
  if (completed.status !== 0) {
    if (quiet) {
      if (completed.stdout) process.stdout.write(completed.stdout);
      if (completed.stderr) process.stdout.write(completed.stderr);
    }
    throw new CheckFailure(`Command exited with code ${completed.status}`);
  }
}

function checkLint(specPath) {
  const redocly = localBin(["@redocly", "cli", "bin", "cli.js"]);
  runNodeTool(
    redocly,
    ["lint", specPath, "--config", path.join(REPO_ROOT, "redocly.yaml"), "--format=stylish"],
    REPO_ROOT,
  );
  return "Redocly 2.39.0 recommended lint passed";
}

function checkRefs(specPath) {
  const document = loadSpec(specPath);
  const references = [];
  for (const node of walk(document)) {
    if (Object.hasOwn(node, "$ref")) references.push(node.$ref);
  }
  for (const reference of references) resolvePointer(document, reference);

  const allOperations = operations(document);
  const operationIds = allOperations.map(({ operation }) => operation.operationId);
  const missingIds = allOperations
    .filter(({ operation }) => !operation.operationId)
    .map(({ route, method }) => `${method.toUpperCase()} ${route}`);
  const duplicateIds = [...new Set(operationIds.filter(
    (value, index) => value && operationIds.indexOf(value) !== index,
  ))];
  requireCondition(missingIds.length === 0, `Missing operationId: ${missingIds.join(", ")}`);
  requireCondition(duplicateIds.length === 0, `Duplicate operationId: ${duplicateIds.join(", ")}`);

  const parameterMismatches = [];
  for (const { route, method, operation } of allOperations) {
    const expected = new Set([...route.matchAll(/{([^}]+)}/g)].map((match) => match[1]));
    const actual = new Set();
    for (const parameter of operationParameters(document, route, operation)) {
      if (parameter.in === "path") {
        actual.add(parameter.name);
        if (parameter.required !== true) {
          parameterMismatches.push(`${method.toUpperCase()} ${route}: path parameter ${parameter.name} is not required`);
        }
      }
    }
    if ([...expected].sort().join("|") !== [...actual].sort().join("|")) {
      parameterMismatches.push(
        `${method.toUpperCase()} ${route}: template=${[...expected]} declared=${[...actual]}`,
      );
    }
  }
  requireCondition(
    parameterMismatches.length === 0,
    `Path parameter mismatch:\n - ${parameterMismatches.join("\n - ")}`,
  );

  const referencedComponents = new Set();
  for (const reference of references) {
    const match = reference.match(/^#\/components\/([^/]+)\/([^/]+)$/);
    if (match) referencedComponents.add(`${match[1]}/${match[2]}`);
  }
  const unused = [];
  for (const kind of ["schemas", "parameters", "responses"]) {
    for (const name of Object.keys(document.components?.[kind] ?? {})) {
      if (!referencedComponents.has(`${kind}/${name}`)) unused.push(`${kind}/${name}`);
    }
  }
  requireCondition(unused.length === 0, `Unused components: ${unused.join(", ")}`);
  return `${Object.keys(document.paths).length} paths, ${allOperations.length} operations, ${references.length} resolved refs`;
}

function isBearerOnlySecurity(security) {
  return Array.isArray(security)
    && security.length > 0
    && security.every((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
      const keys = Object.keys(entry);
      return keys.length === 1
        && keys[0] === "bearerAuth"
        && Array.isArray(entry.bearerAuth)
        && entry.bearerAuth.length === 0;
    });
}

function responseExampleCodes(response) {
  const codes = [];
  for (const media of Object.values(response.content ?? {})) {
    const examples = [];
    if (media.example) examples.push(media.example);
    for (const entry of Object.values(media.examples ?? {})) {
      if (entry?.value) examples.push(entry.value);
    }
    for (const example of examples) {
      if (example?.error?.code) codes.push(example.error.code);
    }
  }
  return codes;
}

function collectSchemaPropertyNames(document, schema, seenReferences = new Set()) {
  const names = new Set();
  if (!schema || typeof schema !== "object") return names;
  if (schema.$ref) {
    if (seenReferences.has(schema.$ref)) return names;
    seenReferences.add(schema.$ref);
    const resolved = resolvePointer(document, schema.$ref);
    for (const name of collectSchemaPropertyNames(document, resolved, seenReferences)) names.add(name);
    return names;
  }
  for (const [name, child] of Object.entries(schema.properties ?? {})) {
    names.add(name);
    for (const nestedName of collectSchemaPropertyNames(document, child, seenReferences)) names.add(nestedName);
  }
  for (const keyword of [
    "allOf",
    "anyOf",
    "oneOf",
    "prefixItems",
  ]) {
    for (const child of schema[keyword] ?? []) {
      for (const name of collectSchemaPropertyNames(document, child, seenReferences)) names.add(name);
    }
  }
  for (const keyword of [
    "items",
    "contains",
    "if",
    "then",
    "else",
    "additionalProperties",
    "propertyNames",
  ]) {
    const child = schema[keyword];
    if (child && typeof child === "object") {
      for (const name of collectSchemaPropertyNames(document, child, seenReferences)) names.add(name);
    }
  }
  for (const child of Object.values(schema.dependentSchemas ?? {})) {
    for (const name of collectSchemaPropertyNames(document, child, seenReferences)) names.add(name);
  }
  return names;
}

function checkContract(specPath) {
  const document = loadSpec(specPath);
  const allOperations = operations(document);
  const errors = [];
  const errorCodes = new Set(document.components?.schemas?.ErrorCode?.enum ?? []);

  if (!String(document.openapi ?? "").startsWith("3.1.")) errors.push("openapi must be 3.1.x");
  if (!(document.servers ?? []).some((server) => String(server.url ?? "").endsWith("/api/v1"))) {
    errors.push("at least one server URL must be versioned with /api/v1");
  }
  if (Object.keys(document.paths ?? {}).some((route) => route === "/auth" || route.startsWith("/auth/"))) {
    errors.push("Auth0 Universal Login is external; backend /auth or /auth/** paths must not be added");
  }

  for (const [route, requiredMethods] of REQUIRED_OPERATIONS) {
    if (!document.paths?.[route]) {
      errors.push(`missing PRD path ${route}`);
      continue;
    }
    for (const method of requiredMethods) {
      if (!document.paths[route][method]) errors.push(`missing ${method.toUpperCase()} ${route}`);
    }
  }

  for (const { route, method, operation } of allOperations) {
    const label = `${method.toUpperCase()} ${route}`;
    const responses = operation.responses ?? {};
    const isPublic = PUBLIC_OPERATIONS.has(label);
    const effectiveSecurity = Object.hasOwn(operation, "security")
      ? operation.security
      : document.security;

    if (!Array.isArray(operation.tags) || operation.tags.length === 0) errors.push(`${label} lacks tags`);
    if (!operation.summary) errors.push(`${label} lacks summary`);
    if (!Object.keys(responses).some((status) => /^2\d\d$/.test(status))) {
      errors.push(`${label} lacks a success response`);
    }

    if (isPublic) {
      if (!Array.isArray(operation.security) || operation.security.length !== 0) {
        errors.push(`${label} must explicitly set security: []`);
      }
    } else {
      if (!isBearerOnlySecurity(effectiveSecurity)) {
        errors.push(`${label} must use bearerAuth only and must not allow an anonymous security alternative`);
      }
      if (!responses["401"]) errors.push(`${label} lacks 401`);
      if (!Array.isArray(operation["x-required-roles"]) || operation["x-required-roles"].length === 0) {
        errors.push(`${label} lacks x-required-roles`);
      } else if (!route.startsWith("/admin/") && !operation["x-required-roles"].includes("customer")) {
        errors.push(`${label} must require the customer role`);
      }
      if (!responses["403"]) errors.push(`${label} lacks 403`);
    }

    if (route.startsWith("/admin/")) {
      if (!isBearerOnlySecurity(operation.security)) {
        errors.push(`${label} must explicitly declare bearerAuth only, without an anonymous alternative`);
      }
      if (!(operation["x-required-roles"] ?? []).includes("admin")) errors.push(`${label} lacks admin role`);
      if (!Array.isArray(operation["x-required-permissions"]) || operation["x-required-permissions"].length === 0) {
        errors.push(`${label} lacks x-required-permissions`);
      } else {
        const knownPermissions = new Set([
          "catalog:manage",
          "dashboard:read",
          "inventory:manage",
          "orders:fulfill",
          "orders:read:any",
          "prepurchase:manage",
          "promotion:manage",
        ]);
        for (const permission of operation["x-required-permissions"]) {
          if (!knownPermissions.has(permission)) errors.push(`${label} uses unknown permission ${permission}`);
        }
      }
    }

    if (route !== "/health") {
      const refs = operation["x-prd-references"];
      if (!Array.isArray(refs) || refs.length === 0) {
        errors.push(`${label} lacks x-prd-references`);
      } else {
        for (const reference of refs) {
          if (!/^(US-[CA]\d{2}|FR-[A-Z0-9-]+|BR-\d{2}|BR-(DIS|SHW|LEAD|TD|EST|LN|HAND)-\d{3})$/.test(reference)) {
            errors.push(`${label} has malformed PRD reference ${reference}`);
          }
        }
      }
    }

    for (const status of ["429", "500"]) {
      if (!responses[status]) errors.push(`${label} lacks ${status}`);
    }
    if (operation.requestBody) {
      if (!responses["400"]) errors.push(`${label} has requestBody but lacks 400`);
      const requestBody = dereference(document, operation.requestBody);
      if (!requestBody?.content?.["application/json"]?.schema) {
        errors.push(`${label} requestBody lacks application/json schema`);
      }
    }

    const parameterKeys = new Set();
    for (const parameter of operationParameters(document, route, operation)) {
      const key = `${parameter.in}:${parameter.name}`;
      if (parameterKeys.has(key)) errors.push(`${label} has duplicate parameter ${key}`);
      parameterKeys.add(key);
    }

    for (const [status, responseReference] of Object.entries(responses)) {
      if (!/^[45]/.test(status)) continue;
      if (!responseReference?.$ref) {
        errors.push(`${label} ${status} must reference a reusable typed error response`);
        continue;
      }
      const response = dereference(document, responseReference);
      const allowed = response["x-error-codes"];
      if (!Array.isArray(allowed) || allowed.length === 0) {
        errors.push(`${label} ${status} response lacks x-error-codes`);
        continue;
      }
      for (const code of allowed) {
        if (!errorCodes.has(code)) errors.push(`${label} ${status} uses unknown error code ${code}`);
      }
      if (response.content?.["application/json"]?.schema?.$ref !== "#/components/schemas/ErrorResponse") {
        errors.push(`${label} ${status} must use the ErrorResponse schema`);
      }
    }
  }

  for (const [name, response] of Object.entries(document.components?.responses ?? {})) {
    if (!response["x-error-codes"]) continue;
    const allowed = new Set(response["x-error-codes"]);
    for (const code of responseExampleCodes(response)) {
      if (!allowed.has(code)) errors.push(`response ${name} example code ${code} is not declared in x-error-codes`);
    }
  }

  const requestSchemas = Object.entries(document.components?.schemas ?? {})
    .filter(([name]) => name.endsWith("Request"));
  const forbiddenSystemFields = new Set(["id", "customerId", "createdAt", "updatedAt", "usedCount", "inventoryVersion"]);
  for (const [name, schema] of requestSchemas) {
    for (const propertyName of collectSchemaPropertyNames(document, schema)) {
      if (forbiddenSystemFields.has(propertyName)) errors.push(`${name} exposes system field ${propertyName}`);
      if (propertyName === "availableQuantity" && name !== "InventoryUpdateRequest") {
        errors.push(`${name} mutates inventory outside InventoryUpdateRequest`);
      }
    }
  }

  const idempotentOperations = [
    {
      route: "/checkout",
      method: "post",
      label: "checkout",
      conflictResponse: "#/components/responses/CheckoutConflict",
    },
    {
      route: "/orders/{orderId}/mock-payment",
      method: "post",
      label: "mock payment",
      conflictResponse: "#/components/responses/MockPaymentConflict",
    },
    {
      route: "/orders/{orderId}/cancellation",
      method: "post",
      label: "customer cancellation",
      conflictResponse: "#/components/responses/CancellationConflict",
    },
    {
      route: "/orders/{orderId}/mock-refund",
      method: "post",
      label: "mock refund",
      conflictResponse: "#/components/responses/MockRefundConflict",
    },
  ];
  for (const definition of idempotentOperations) {
    const operation = document.paths?.[definition.route]?.[definition.method];
    if (!operation) continue;
    const idempotencyParameter = operationParameters(document, definition.route, operation)
      .find((parameter) => parameter.in === "header" && parameter.name === "Idempotency-Key");
    if (!idempotencyParameter || idempotencyParameter.required !== true) {
      errors.push(`${definition.label} lacks a required Idempotency-Key header`);
    }
    const description = operation.description ?? "";
    if (!/(repeat|replay)/i.test(description) || !description.includes("IDEMPOTENCY_KEY_REUSED")) {
      errors.push(`${definition.label} replay/key-reuse behavior is undocumented`);
    }
    if (operation.responses?.["409"]?.$ref !== definition.conflictResponse) {
      errors.push(`${definition.label} 409 must use ${definition.conflictResponse}`);
    }
  }

  if (document.paths?.["/admin/orders"]?.get?.responses?.["200"]?.$ref
      !== "#/components/responses/AdminOrderPage") {
    errors.push("admin order search must return AdminOrderPage");
  }
  for (const extension of [
    "x-pricebook-policy",
    "x-inventory-policy",
    "x-order-state-machine",
    "x-payment-deadline-policy",
    "x-refund-policy",
    "x-product-publication-policy",
    "x-product-configuration-policy",
    "x-single-showroom-policy",
    "x-prepurchase-estimate-policy",
    "x-authorization-model",
  ]) {
    if (!document[extension]) errors.push(`missing root policy ${extension}`);
  }

  const rateLimitHeaders = new Set(
    Object.keys(document.components?.responses?.TooManyRequests?.headers ?? {}),
  );
  for (const header of [
    "Retry-After",
    "X-RateLimit-Limit",
    "X-RateLimit-Remaining",
    "X-RateLimit-Reset",
  ]) {
    if (!rateLimitHeaders.has(header)) errors.push(`TooManyRequests lacks ${header}`);
  }

  requireCondition(errors.length === 0, `Contract checks failed:\n - ${errors.join("\n - ")}`);
  return `required-operation coverage, PRD-reference format, Auth0/RBAC, DTO boundaries, typed errors, 429/500 and idempotency passed for ${allOperations.length} operations`;
}

function absoluteRefs(node, baseUri) {
  if (Array.isArray(node)) return node.map((value) => absoluteRefs(value, baseUri));
  if (node && typeof node === "object") {
    return Object.fromEntries(Object.entries(node).map(([key, value]) => [
      key,
      key === "$ref" && typeof value === "string" && value.startsWith("#")
        ? `${baseUri}${value}`
        : absoluteRefs(value, baseUri),
    ]));
  }
  return node;
}

function validationMessage(validate) {
  return (validate.errors ?? [])
    .slice(0, 6)
    .map((error) => `${error.instancePath || "/"} ${error.message}`)
    .join("; ");
}

function checkSchemas(specPath) {
  const document = loadSpec(specPath);
  const baseUri = "https://fastlane.local/openapi.yaml";
  const rootSchema = structuredClone(document);
  rootSchema.$id = baseUri;
  const ajv = new Ajv2020({
    allErrors: true,
    allowUnionTypes: true,
    strict: false,
    validateFormats: true,
  });
  addFormats(ajv);
  ajv.addSchema(rootSchema, baseUri);

  const validators = new Map();
  for (const name of Object.keys(document.components?.schemas ?? {})) {
    try {
      validators.set(name, ajv.compile({ $ref: `${baseUri}#/components/schemas/${name}` }));
    } catch (error) {
      throw new CheckFailure(`Cannot compile schema ${name}: ${error.message}`);
    }
  }

  function valid(name, value) {
    const validate = validators.get(name);
    requireCondition(validate, `Missing schema validator ${name}`);
    if (!validate(value)) throw new CheckFailure(`${name} valid fixture failed: ${validationMessage(validate)}`);
  }

  function invalid(name, value) {
    const validate = validators.get(name);
    requireCondition(validate, `Missing schema validator ${name}`);
    if (validate(value)) throw new CheckFailure(`${name} negative fixture unexpectedly passed: ${JSON.stringify(value)}`);
  }

  const u1 = "11111111-1111-4111-8111-111111111111";
  const u2 = "22222222-2222-4222-8222-222222222222";
  const u3 = "33333333-3333-4333-8333-333333333333";
  const u4 = "44444444-4444-4444-8444-444444444444";
  const u5 = "55555555-5555-4555-8555-555555555555";
  const timestamp = "2026-07-20T10:00:00Z";
  const address = {
    recipientName: "Nguyễn Văn A",
    phoneNumber: "0912345678",
    line1: "123 Nguyễn Trãi",
    communeLevel: {
      code: "26734",
      name: "Phường Bến Thành",
      type: "WARD",
    },
    province: {
      code: "79",
      name: "TP. Hồ Chí Minh",
    },
    countryCode: "VN",
  };
  const discount = { type: "percentage", value: 10 };
  const cancellationPolicy = {
    customerCancellationAllowed: true,
    customerCancellationCutoff: "before_balance_due",
    refundPercentage: 100,
    overdueRefundPercentage: 0,
    cancellationFeeAmount: "0",
  };
  const purchaseTerms = {
    paymentMode: "deposit",
    depositAmount: "30000000",
    initialPaymentWindowMinutes: 30,
    balancePaymentWindowDays: 7,
    gracePeriodHours: 48,
    cancellationPolicy,
  };
  const product = {
    id: u1,
    name: "VinFast VF 8",
    slug: "vinfast-vf-8",
    productKind: "car",
    purchaseTerms,
    category: { id: u2, name: "Ô tô điện", slug: "o-to-dien", isActive: true },
    thumbnailUrl: "https://example.com/vf8.jpg",
    priceRange: { minimum: "999000000", maximum: "1199000000", currency: "VND" },
    isActive: true,
    description: "Mẫu SUV điện.",
    images: [{
      id: u3,
      url: "https://example.com/vf8.jpg",
      altText: "VinFast VF 8 màu đỏ",
      sortOrder: 0,
      isThumbnail: true,
    }],
    specifications: [{
      name: "Công suất tối đa",
      value: "150",
      unit: "kW",
      group: "Động cơ",
      sortOrder: 0,
    }],
    variants: [{
      id: u3,
      sku: "VF8-ECO-RED",
      attributes: { trim: "Eco", color: "Red" },
      batteryOption: "included",
      price: {
        currency: "VND",
        listPrice: "1099000000",
        salePrice: "999000000",
        effectivePrice: "999000000",
      },
      availableQuantity: 5,
      inventoryVersion: 2,
      isActive: true,
      isPurchasable: true,
    }],
    optionGroups: [{
      id: u4,
      code: "PAINT",
      name: "Màu sơn nâng cao",
      minimumSelections: 0,
      maximumSelections: 1,
      isActive: true,
      values: [{
        id: u5,
        code: "PREMIUM_RED",
        name: "Đỏ nâng cao",
        priceAdjustment: "12000000",
        compatibleVariantSkus: ["VF8-ECO-RED"],
        isActive: true,
      }],
    }],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const item = {
    id: u1,
    variantId: u3,
    productName: "VinFast VF 8",
    productKind: "car",
    purchaseTerms,
    sku: "VF8-ECO-RED",
    variantAttributes: { trim: "Eco" },
    selectedOptions: [{
      groupId: u4,
      groupCode: "PAINT",
      groupName: "Màu sơn nâng cao",
      valueId: u5,
      valueCode: "PREMIUM_RED",
      valueName: "Đỏ nâng cao",
      priceAdjustment: "12000000",
    }],
    quantity: 1,
    unitListPrice: "1099000000",
    unitSalePrice: "999000000",
    unitOptionTotal: "12000000",
    unitPrice: "1011000000",
    unitAmountDueNow: "30000000",
    lineTotal: "1011000000",
    lineAmountDueNow: "30000000",
  };
  const cartItem = {
    ...item,
    productId: u2,
    productSlug: "vinfast-vf-8",
  };
  const pricing = {
    currency: "VND",
    subtotal: "1011000000",
    discountTotal: "101100000",
    grandTotal: "909900000",
    amountDueNow: "30000000",
    balanceDue: "879900000",
  };
  const applied = {
    promotionId: u2,
    code: "FASTLANE10",
    discount,
    discountAmount: "101100000",
  };
  const productCreate = {
    categoryId: u2,
    name: "VinFast VF 8",
    slug: "vinfast-vf-8",
    productKind: "car",
    purchaseTerms,
    description: "Mẫu SUV điện cỡ D.",
    specifications: [],
    images: [{
      url: "https://example.com/vf8.jpg",
      altText: "VinFast VF 8",
      sortOrder: 0,
      isThumbnail: true,
    }],
    optionGroups: [{
      code: "PAINT",
      name: "Màu sơn nâng cao",
      minimumSelections: 0,
      maximumSelections: 1,
      isActive: true,
      values: [{
        code: "PREMIUM_RED",
        name: "Đỏ nâng cao",
        priceAdjustment: "12000000",
        compatibleVariantSkus: ["VF8-ECO-RED"],
        isActive: true,
      }],
    }],
    isActive: true,
    variants: [{
      sku: "VF8-ECO-RED",
      attributes: { trim: "Eco", color: "Red" },
      batteryOption: "included",
      listPrice: "1099000000",
      salePrice: null,
      isActive: true,
    }],
  };
  const accessoryContent = {
    schema: "accessory_content_v1",
    sections: [{
      key: "technical_specs",
      type: "TECHNICAL_SPECS",
      title: "Thông tin kỹ thuật",
      display_order: 10,
      body: null,
      items: [],
      attributes: [{ label: "Chất liệu", value: "Nhựa TPE" }],
    }],
  };
  const adminAccessoryWrite = {
    categoryId: u1,
    templateCode: "vehicle_fit",
    templateVersion: 1,
    categoryAssignments: [{ categoryId: u2, compatibilityMode: "ALL_MODELS", modelIds: [] }],
    name: "Ốp gương",
    slug: "op-guong",
    description: "Phụ kiện chính hãng.",
    isActive: true,
    serviceLabelIds: [],
    content: {
      schema: "accessory_content_v1",
      sections: [{
        key: "features",
        type: "FEATURES",
        title: "Tính năng nổi bật",
        displayOrder: 10,
        body: null,
        items: ["Bền và dễ vệ sinh."],
        attributes: [],
      }],
    },
    optionGroups: [{
      code: "color",
      name: "Màu sắc",
      displayType: "SWATCH",
      minimumSelections: 1,
      maximumSelections: 1,
      displayOrder: 10,
      values: [{
        code: "black",
        name: "Đen",
        colorHex: "#000000",
        swatchUrl: null,
        displayOrder: 10,
      }],
    }],
    variants: [{
      name: "Đen",
      originalPrice: 500000,
      salePrice: 450000,
      isActive: true,
      optionValues: { color: "black" },
      imageUrls: ["https://example.com/black-sku.webp"],
    }],
  };
  const testDriveLocation = {
    name: "FASTLANE Central",
    addressLine: "720A Điện Biên Phủ",
    province: { code: "79", name: "TP. Hồ Chí Minh" },
    phoneNumber: "0912345678",
    timezone: "Asia/Ho_Chi_Minh",
    isActive: true,
  };
  const testDriveCreate = {
    productId: u1,
    slotId: u2,
    contact: {
      fullName: "Nguyễn Văn A",
      phoneNumber: "0912345678",
      email: "customer@example.com",
    },
    consent: {
      privacyConsent: true,
      privacyPolicyVersion: "2026-07",
      marketingConsent: false,
    },
    licenceAcknowledged: true,
    note: "Muốn được tư vấn thêm về pin.",
  };
  const estimateSelection = {
    productId: u1,
    variantId: u3,
    selectedOptionValueIds: [],
  };
  const samples = new Map([
    ["HealthResponse", { data: { status: "ok" } }],
    ["ProductDetail", product],
    ["AdminAccessoryWriteRequest", adminAccessoryWrite],
    ["AccessoryContentV1", accessoryContent],
    ["AddCartItemRequest", { variantId: u3, quantity: 1 }],
    ["Cart", { id: u1, version: 3, pricedAt: timestamp, items: [cartItem], promotion: applied, pricing }],
    ["CheckoutRequest", {
      cartItemIds: [u1],
      expectedCartVersion: 3,
      acceptedGrandTotal: "909900000",
      acceptedAmountDueNow: "30000000",
      shippingAddress: address,
      note: "Gọi trước khi giao",
    }],
    ["Order", {
      id: u1,
      orderNumber: "FLE-20260720-00001",
      customer: { id: u2, email: "customer@example.com" },
      status: "Created",
      statusUpdatedAt: timestamp,
      items: [item],
      promotion: applied,
      pricing: { ...pricing, shippingTotal: "0" },
      payment: {
        status: "Pending",
        amountDueAtCheckout: "30000000",
        amountPaid: "0",
        amountRefunded: "0",
        balanceDue: "909900000",
        schedule: {
          initialPaymentDueAt: "2026-07-20T10:30:00Z",
          balanceDueAt: null,
          gracePeriodEndsAt: null,
        },
        refund: {
          status: "NotRequired",
          requestedAmount: "0",
          refundedAmount: "0",
          cancellationFeeAmount: "0",
        },
        transactions: [],
      },
      cancellationPolicy,
      cancellation: null,
      shippingAddress: address,
      note: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }],
    ["AdminOrderSummary", {
      id: u1,
      orderNumber: "FLE-20260720-00001",
      customer: { id: u2, email: "customer@example.com" },
      recipientName: "Nguyễn Văn A",
      recipientPhoneNumber: "0912345678",
      status: "Paid",
      paymentStatus: "Paid",
      nextPaymentDueAt: null,
      pricing: { currency: "VND", grandTotal: "909900000", amountDueNow: "30000000", balanceDue: "879900000" },
      createdAt: timestamp,
      statusUpdatedAt: timestamp,
    }],
    ["Promotion", {
      id: u1,
      code: "FASTLANE10",
      discount,
      minimumOrderAmount: "500000000",
      startsAt: timestamp,
      endsAt: null,
      usageLimit: 100,
      usedCount: 1,
      isActive: true,
    }],
    ["DashboardSummary", {
      generatedAt: timestamp,
      totalOrders: 12,
      ordersByStatus: { Created: 2, DepositPaid: 1, Paid: 2, Shipped: 2, Completed: 3, Cancelled: 1, Expired: 1 },
      projectedRevenue: "5000000000",
      activeProductCount: 8,
      lowStockVariantCount: 2,
    }],
    ["AdminAccessorySaveResult", { id: u1, productType: "ACCESSORY", isActive: true, updatedAt: timestamp }],
    ["CancelOrderRequest", { expectedCurrentStatus: "DepositPaid", reasonCode: "changed_mind", note: "Thay đổi kế hoạch mua xe." }],
    ["CreateTestDriveRequest", testDriveCreate],
    ["TestDriveAvailability", {
      productId: u1,
      location: testDriveLocation,
      slots: [{
        id: u2,
        startsAt: "2026-07-23T02:00:00Z",
        endsAt: "2026-07-23T03:30:00Z",
        status: "AVAILABLE",
        remainingCapacity: 1,
      }],
      generatedAt: timestamp,
    }],
    ["TestDriveRequestDetail", {
      id: u1,
      referenceNumber: "TDR-20260722-0001",
      productId: u2,
      productName: "VinFast VF 8",
      status: "REQUESTED",
      preferredStartsAt: "2026-07-23T02:00:00Z",
      preferredEndsAt: "2026-07-23T03:30:00Z",
      contact: testDriveCreate.contact,
      locationSnapshot: testDriveLocation,
      note: null,
      licenceAcknowledged: true,
      privacyPolicyVersion: "2026-07",
      marketingConsent: false,
      history: [{
        fromStatus: null,
        toStatus: "REQUESTED",
        actorType: "GUEST",
        reason: null,
        changedAt: timestamp,
      }],
      createdAt: timestamp,
      updatedAt: timestamp,
    }],
    ["OnRoadEstimate", {
      calculationId: u1,
      currency: "VND",
      selection: estimateSelection,
      registrationProvince: { code: "79", name: "TP. Hồ Chí Minh" },
      breakdown: [
        { code: "VEHICLE_PRICE", label: "Giá xe sau ưu đãi", category: "VEHICLE", amount: "999000000", included: false },
        { code: "VAT_INCLUDED", label: "VAT đã bao gồm", category: "TAX_INFO", amount: "0", included: true },
        { code: "REGISTRATION", label: "Lệ phí đăng ký", category: "MANDATORY_FEE", amount: "20000000", included: false },
      ],
      vehiclePriceAfterDiscount: "999000000",
      mandatoryFeeTotal: "20000000",
      optionalFeeTotal: "0",
      onRoadTotal: "1019000000",
      catalogVersion: "catalog-2026-07-22",
      feePolicyVersions: ["registration-v1"],
      generatedAt: timestamp,
      disclaimer: "Dự toán tham khảo, không phải báo giá.",
    }],
    ["InstallmentEstimate", {
      calculationId: u2,
      onRoadCalculationId: u1,
      currency: "VND",
      financeBase: "999000000",
      downPayment: "499500000",
      loanPrincipal: "499500000",
      upfrontCash: "519500000",
      annualInterestRate: 8.5,
      termMonths: 1,
      totalInterest: "3538125",
      totalLoanAndInterest: "503038125",
      schedule: [{
        period: 1,
        openingPrincipal: "499500000",
        principalPaid: "499500000",
        interestPaid: "3538125",
        paymentTotal: "503038125",
        closingPrincipal: "0",
      }],
      loanPackageVersion: "standard-bank-v1",
      generatedAt: timestamp,
      disclaimer: "Dự toán tham khảo, không phải quyết định cấp tín dụng.",
    }],
    ["FeePolicyCreateRequest", {
      code: "REGISTRATION_FEE",
      label: "Lệ phí đăng ký",
      vehicleKind: "car",
      provinceCode: null,
      calculationType: "FIXED",
      value: "20000000",
      calculationBase: "VEHICLE_PRICE_AFTER_DISCOUNT",
      mandatory: true,
      priority: 0,
      startsAt: timestamp,
      endsAt: null,
      status: "ACTIVE",
    }],
    ["LoanPackageCreateRequest", {
      code: "STANDARD_BANK",
      name: "Vay tiêu chuẩn",
      lenderName: "Ngân hàng Demo",
      annualInterestRate: 8.5,
      allowedTermMonths: [12, 24, 36],
      allowedDownPaymentPercents: [20, 30, 50],
      startsAt: timestamp,
      endsAt: null,
      status: "ACTIVE",
    }],
  ]);
  for (const [name, sample] of samples) valid(name, sample);

  let negativeCount = 0;
  const negative = (name, value) => {
    invalid(name, value);
    negativeCount += 1;
  };
  negative("PercentageDiscount", { type: "percentage", value: 101 });
  negative("FixedAmountDiscount", { type: "fixed_amount", value: "0" });
  negative("CategoryPatchRequest", {});
  negative("AdminAccessoryWriteRequest", { ...adminAccessoryWrite, internalCost: 5 });
  negative("Money", "-1");
  negative("Money", 199000);
  negative("Money", "0199000");
  negative("PositiveMoney", "0");
  negative("OrderTransitionRequest", { expectedCurrentStatus: "Created", targetStatus: "DepositPaid" });
  negative("PurchaseTerms", { paymentMode: "full", depositAmount: "30000000" });
  negative("PurchaseTerms", { paymentMode: "deposit", depositAmount: null });
  negative("CancellationPolicy", { ...cancellationPolicy, refundPercentage: 101 });
  negative("CancelOrderRequest", { expectedCurrentStatus: "Shipped", reasonCode: "changed_mind" });
  negative("AddCartItemRequest", { variantId: u3, selectedOptionValueIds: [], quantity: 1 });
  const accessoryWithOptionPrice = structuredClone(adminAccessoryWrite);
  accessoryWithOptionPrice.optionGroups[0].values[0].priceAdjustment = 100000;
  negative("AdminAccessoryWriteRequest", accessoryWithOptionPrice);
  const accessoryWithSystemId = structuredClone(adminAccessoryWrite);
  accessoryWithSystemId.variants[0].id = u3;
  negative("AdminAccessoryWriteRequest", accessoryWithSystemId);
  const productWithExtraField = structuredClone(product);
  productWithExtraField.internalCost = "1";
  negative("ProductDetail", productWithExtraField);
  negative("AccessoryContentV1", {
    ...accessoryContent,
    specification_text: "legacy",
  });
  negative("AccessoryContentV1", {
    schema: "accessory_content_v1",
    sections: [{
      key: "empty",
      type: "OTHER",
      title: "Mục rỗng",
      display_order: 10,
      body: null,
      items: [],
      attributes: [],
    }],
  });
  negative("CreateTestDriveRequest", { ...testDriveCreate, showroomId: u5 });
  negative("CreateTestDriveRequest", {
    ...testDriveCreate,
    consent: { ...testDriveCreate.consent, privacyConsent: false },
  });
  negative("OnRoadEstimateRequest", {
    selection: estimateSelection,
    registrationProvince: { code: "79", name: "TP. Hồ Chí Minh" },
    selectedOptionalFeeCodes: [],
    acceptedTotal: "1000000000",
  });
  negative("InstallmentEstimateRequest", {
    onRoadCalculationId: u1,
    loanPackageId: u2,
    termMonths: 0,
    downPaymentPercent: 20,
  });
  negative("TestDriveSettingsPatchRequest", { expectedVersion: 1 });
  negative("FeePolicyCreateRequest", {
    code: "REGISTRATION_FEE",
    label: "Lệ phí đăng ký",
    vehicleKind: "car",
    provinceCode: null,
    calculationType: "FIXED",
    value: "-1",
    calculationBase: "VEHICLE_PRICE_AFTER_DISCOUNT",
    mandatory: true,
    startsAt: timestamp,
    status: "ACTIVE",
  });
  negative("LoanPackageCreateRequest", {
    code: "INVALID_LOAN",
    name: "Gói vay lỗi",
    lenderName: "Ngân hàng Demo",
    annualInterestRate: 8.5,
    allowedTermMonths: [12],
    allowedDownPaymentPercents: [101],
    startsAt: timestamp,
    status: "ACTIVE",
  });

  valid("Money", "199000");
  valid("PositiveMoney", "1");

  let componentExampleCount = 0;
  for (const [name, schema] of Object.entries(document.components?.schemas ?? {})) {
    for (const example of schema.examples ?? []) {
      valid(name, example);
      componentExampleCount += 1;
    }
    if (Object.hasOwn(schema, "example")) {
      valid(name, schema.example);
      componentExampleCount += 1;
    }
  }

  let responseExampleCount = 0;
  for (const [responseName, response] of Object.entries(document.components?.responses ?? {})) {
    for (const media of Object.values(response.content ?? {})) {
      if (!media.schema) continue;
      const examples = [];
      if (Object.hasOwn(media, "example")) examples.push(media.example);
      for (const exampleEntry of Object.values(media.examples ?? {})) {
        const resolvedEntry = exampleEntry?.$ref
          ? resolvePointer(document, exampleEntry.$ref)
          : exampleEntry;
        if (Object.hasOwn(resolvedEntry ?? {}, "value")) examples.push(resolvedEntry.value);
      }
      const validate = ajv.compile(absoluteRefs(media.schema, baseUri));
      for (const example of examples) {
        if (!validate(example)) {
          throw new CheckFailure(
            `Response example ${responseName} failed: ${validationMessage(validate)}`,
          );
        }
        responseExampleCount += 1;
      }
    }
  }

  return `${samples.size} representative fixtures, ${componentExampleCount} component examples, ${responseExampleCount} response examples and ${negativeCount} negative fixtures passed`;
}

function safeRemoveTemp(tempPath) {
  const resolvedTempRoot = path.resolve(tmpdir()) + path.sep;
  const resolvedTarget = path.resolve(tempPath);
  requireCondition(
    resolvedTarget.startsWith(resolvedTempRoot)
      && path.basename(resolvedTarget).startsWith("fastlane-openapi-"),
    `Refusing to remove unexpected temp path: ${resolvedTarget}`,
  );
  rmSync(resolvedTarget, { recursive: true, force: true });
}

function checkCodegen(specPath) {
  const openapiTypescript = localBin(["openapi-typescript", "bin", "cli.js"]);
  const tempPath = mkdtempSync(path.join(tmpdir(), "fastlane-openapi-"));
  ACTIVE_TEMP_PATHS.add(tempPath);
  const outputPath = path.join(tempPath, "openapi.d.ts");
  try {
    runNodeTool(openapiTypescript, [specPath, "--output", outputPath], path.dirname(specPath));
    requireCondition(existsSync(outputPath), "Code generator did not create openapi.d.ts");
    const generated = readFileSync(outputPath, "utf8");
    requireCondition(generated.includes("export interface paths"), "Generated types lack paths interface");
    requireCondition(generated.includes("ProductDetail"), "Generated types lack ProductDetail");
    requireCondition(generated.includes("AdminOrderSummary"), "Generated types lack AdminOrderSummary");
    return `openapi-typescript 7.9.1 generated ${statSync(outputPath).size} bytes in a temporary directory`;
  } finally {
    safeRemoveTemp(tempPath);
    ACTIVE_TEMP_PATHS.delete(tempPath);
  }
}

const CHECKS = new Map([
  ["lint", checkLint],
  ["refs", checkRefs],
  ["contract", checkContract],
  ["schemas", checkSchemas],
  ["codegen", checkCodegen],
]);

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[FAIL] ${error.message}\n\n${usage()}`);
    return 2;
  }
  if (args.help) {
    console.log(usage());
    return 0;
  }
  if (args.list) {
    console.log("Available checks:");
    for (const name of CHECK_ORDER) console.log(`  ${name}`);
    console.log("  all (runs every check above in deterministic order)");
    return 0;
  }
  if (!existsSync(args.specPath)) {
    console.error(`[FAIL] Spec does not exist: ${args.specPath}`);
    return 2;
  }

  console.log(`Fastlane OpenAPI checks: ${args.selected.join(", ")}`);
  console.log(`Spec: ${args.specPath}`);
  const failures = [];
  const results = [];
  for (const name of args.selected) {
    console.log(`\n[RUN ] ${name}`);
    const started = performance.now();
    try {
      const evidence = CHECKS.get(name)(args.specPath);
      const duration = ((performance.now() - started) / 1000).toFixed(2);
      console.log(`[PASS] ${name} (${duration}s): ${evidence}`);
      results.push({ name, status: "PASS", duration });
    } catch (error) {
      const duration = ((performance.now() - started) / 1000).toFixed(2);
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[FAIL] ${name} (${duration}s): ${message}`);
      failures.push({ name, message });
      results.push({ name, status: "FAIL", duration });
    }
  }

  console.log("\nSummary");
  for (const result of results) {
    console.log(`  ${result.status.padEnd(4)}  ${result.name.padEnd(8)} ${result.duration}s`);
  }
  if (failures.length > 0) {
    console.error(`  Result: FAIL (${failures.length}/${results.length} groups failed)`);
    return 1;
  }
  console.log(`  Result: PASS (${results.length}/${results.length} groups passed)`);
  return 0;
}

function cleanupActiveTemps() {
  for (const tempPath of [...ACTIVE_TEMP_PATHS]) {
    try {
      safeRemoveTemp(tempPath);
      ACTIVE_TEMP_PATHS.delete(tempPath);
    } catch {
      // Keep exit handling best-effort; normal codegen cleanup still fails loudly.
    }
  }
}

process.on("exit", cleanupActiveTemps);
process.on("SIGINT", () => {
  cleanupActiveTemps();
  process.exit(130);
});
process.exitCode = main();
