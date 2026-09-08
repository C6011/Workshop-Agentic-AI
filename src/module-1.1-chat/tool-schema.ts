type JsonSchema = Record<string, unknown>;

export function toGeminiSchema(schema: JsonSchema): JsonSchema {
  const result: JsonSchema = { ...schema };
  if (typeof result.type === 'string') result.type = result.type.toUpperCase();
  if (result.properties && typeof result.properties === 'object') {
    const properties: JsonSchema = {};
    for (const [key, value] of Object.entries(result.properties as Record<string, unknown>)) {
      properties[key] = value && typeof value === 'object' ? toGeminiSchema(value as JsonSchema) : value;
    }
    result.properties = properties;
  }
  if (result.items && typeof result.items === 'object') {
    result.items = toGeminiSchema(result.items as JsonSchema);
  }
  return result;
}