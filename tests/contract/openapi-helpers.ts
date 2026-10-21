import { readFileSync } from "node:fs";
import { join } from "node:path";
import { load } from "js-yaml";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";

const SPEC_PATH = join(process.cwd(), "docs", "openapi.yaml");
const DOC_ID = "https://leados.dev/openapi.yaml";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const openApiDoc: any = load(readFileSync(SPEC_PATH, "utf8"));

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema({ ...openApiDoc, $id: DOC_ID });

export function compileSchema(schemaName: string) {
  return ajv.compile({ $ref: `${DOC_ID}#/components/schemas/${schemaName}` });
}

export function getResponseStatuses(path: string, method: string): string[] {
  const operation = openApiDoc.paths[path]?.[method.toLowerCase()];
  if (!operation) throw new Error(`No OpenAPI operation declared for ${method} ${path}`);
  return Object.keys(operation.responses ?? {});
}
