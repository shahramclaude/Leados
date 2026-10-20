// Boot-time configuration validation.
//
// Every environment variable LEADOS depends on is declared here, once.
// `validateConfig()` is invoked from `src/instrumentation.ts` so the
// Node.js server refuses to start with a confusing runtime error buried
// three layers deep — it fails fast, at boot, with the full list of what is
// missing. See docs/CONFIG.md for the human-readable table this file backs.
interface EnvVarSpec {
  name: string;
  required: boolean;
  defaultValue?: string;
  describe: string;
}

const ENV_VARS: EnvVarSpec[] = [
  {
    name: "DATABASE_URL",
    required: true,
    describe: "Postgres connection string used by src/db/index.ts",
  },
  {
    name: "NODE_ENV",
    required: false,
    defaultValue: "development",
    describe: "Standard Node.js runtime mode",
  },
];

export interface ValidatedConfig {
  databaseUrl: string;
  nodeEnv: string;
}

export class ConfigValidationError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(
      `LEADOS failed to boot: missing required environment variable(s): ${missing.join(", ")}. ` +
        "See docs/CONFIG.md for what each variable does and how to set it.",
    );
    this.name = "ConfigValidationError";
    this.missing = missing;
  }
}

export function validateConfig(env: NodeJS.ProcessEnv = process.env): ValidatedConfig {
  const missing: string[] = [];

  for (const spec of ENV_VARS) {
    const value = env[spec.name];
    if (!value && spec.required && spec.defaultValue === undefined) {
      missing.push(spec.name);
    }
  }

  if (missing.length > 0) {
    throw new ConfigValidationError(missing);
  }

  return {
    databaseUrl: env.DATABASE_URL as string,
    nodeEnv: env.NODE_ENV ?? "development",
  };
}
