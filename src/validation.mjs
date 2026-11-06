import Ajv from 'ajv';
import Ajv2020 from 'ajv/dist/2020.js';

const options = { strict: false, validateFormats: false, ownProperties: true,
  coerceTypes: false, useDefaults: false, removeAdditional: false, allErrors: false };
export function validateArguments(schema, args) {
  if (JSON.stringify(args).length > 1048576) throw new Error('INVALID_ARGUMENTS: Arguments exceed 1 MiB. No tool was called.');
  let validate;
  try {
    if (JSON.stringify(schema).length > 262144) throw new Error('Schema too large.');
    const ajv = schema.$schema?.includes('draft-07') ? new Ajv(options) : new Ajv2020(options);
    // Unknown dialects, invalid schemas and unresolved/remote $ref fail closed.
    validate = ajv.compile(schema);
  } catch {
    throw new Error('SCHEMA_UNSUPPORTED: Native input schema cannot be safely validated. No tool was called.');
  }
  if (!validate(args)) throw new Error('INVALID_ARGUMENTS: Arguments do not match the tool input schema. No tool was called.');
}
