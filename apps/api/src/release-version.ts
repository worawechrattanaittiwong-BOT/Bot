import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const DEFAULT_INSTALLER_VERSION = "1.0.1";
export const DEFAULT_EA_VERSION = "1.0.1";

export const MIN_COMPATIBLE_INSTALLER_VERSION = "1.0.0";
