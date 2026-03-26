/** Parsed Solidity function signature with name and parameter types. */
export interface FunctionSignature {
  name: string;
  paramTypes: string[];
}

/** Parsed public state variable declaration with type and optional mapping key type. */
export interface PublicStateVariable {
  name: string;
  type: string;
  keyType?: string;
}

const FUNCTION_SIGNATURE_REGEX =
  /function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/g;
const PUBLIC_FUNCTION_SIGNATURE_REGEX =
  /function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*(?:external|public)/g;
const PUBLIC_STATE_REGEX =
  /(mapping\s*\(\s*([^=]+)=>\s*([^)]+)\)|[A-Za-z0-9_]+)\s+public\s+([A-Za-z_][A-Za-z0-9_]*)/g;
const CONSTRUCTOR_REGEX = /constructor\s*\(([^)]*)\)/;

/**
 * Parses function signatures from Solidity source using the provided regex pattern.
 *
 * @param source - Raw Solidity source code.
 * @param regex - Regular expression with capture groups for function name and parameters.
 * @returns Array of parsed function signatures.
 */
function parseSignatures(source: string, regex: RegExp): FunctionSignature[] {
  return [...source.matchAll(regex)].map((match) => {
    const rawParams = match[2].trim();
    const paramTypes =
      rawParams.length === 0
        ? []
        : rawParams.split(",").map((param) => {
            const tokens = param.trim().split(/\s+/);
            return tokens[0];
          });
    return {
      name: match[1],
      paramTypes,
    };
  });
}

/**
 * Parses all function signatures (any visibility) from Solidity source code.
 *
 * @param source - Raw Solidity source code string.
 * @returns Array of function signatures with names and parameter types.
 */
export function parseFunctionSignatures(source: string): FunctionSignature[] {
  return parseSignatures(source, FUNCTION_SIGNATURE_REGEX);
}

/**
 * Parses only public and external function signatures from Solidity source code.
 *
 * @param source - Raw Solidity source code string.
 * @returns Array of public/external function signatures with names and parameter types.
 */
export function parsePublicFunctionSignatures(
  source: string,
): FunctionSignature[] {
  return parseSignatures(source, PUBLIC_FUNCTION_SIGNATURE_REGEX);
}

/**
 * Parses public state variable declarations from Solidity source code, including mapping key types.
 *
 * @param source - Raw Solidity source code string.
 * @returns Array of public state variables with name, type, and optional mapping key type.
 */
export function parsePublicStateVariables(
  source: string,
): PublicStateVariable[] {
  return [...source.matchAll(PUBLIC_STATE_REGEX)].map((match) => ({
    name: match[4],
    type: match[1].trim(),
    keyType: match[2]?.trim(),
  }));
}

/**
 * Extracts constructor parameters from Solidity source and generates default argument values for deployment.
 *
 * @param source - Raw Solidity source code string.
 * @returns Comma-separated string of default constructor argument literals, or empty string if none.
 */
export function parseConstructorArgs(source: string): string {
  const match = source.match(CONSTRUCTOR_REGEX);
  if (!match?.[1].trim()) return "";
  const params = match[1]
    .trim()
    .split(",")
    .map((param) => {
      const tokens = param.trim().split(/\s+/);
      const type = tokens[0];
      if (type === "address") return "address(0)";
      if (type.startsWith("address")) return "address(0)";
      if (type === "bool") return "false";
      if (type.startsWith("uint") || type.startsWith("int")) return "0";
      if (type === "string") return '""';
      if (type === "bytes") return '"0x"';
      return "0";
    });
  return params.join(", ");
}

/**
 * Sanitizes a string into a valid Solidity/TypeScript identifier by replacing non-alphanumeric characters with underscores.
 *
 * @param value - The raw string to sanitize.
 * @returns Sanitized identifier string safe for use in generated code.
 */
export function sanitizeIdentifier(value: string): string {
  return value.replace(/[^A-Za-z0-9_]/g, "_");
}
