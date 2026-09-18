export { ProviderConfigError } from "./errors.js";

export { resolveConfigDir } from "./configDir.js";

export {
  MANAGED_CONFIG_FILENAME,
  SCHEMA_VERSION,
  isManagedProviderConfigV1,
} from "./schema.js";
export type { ManagedProviderConfigV1 } from "./schema.js";

export {
  resolveManagedConfigPath,
  readManagedConfig,
  writeManagedConfig,
  removeManagedConfig,
} from "./store.js";
export type { ManagedConfigReadResult } from "./store.js";

export { resolveOpenAIConfig, toSafeProviderStatus } from "./resolve.js";
export type { ConfigSource, ResolvedOpenAIConfig, SafeProviderStatus } from "./resolve.js";

export { redactSecretText } from "./redact.js";
