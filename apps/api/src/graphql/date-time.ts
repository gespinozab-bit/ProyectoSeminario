import { GraphQLError, GraphQLScalarType, Kind } from 'graphql';
import { z } from 'zod';

const input = z.iso.datetime({ offset: true, precision: 3 });
function parse(value: unknown): Date {
  if (typeof value !== 'string' || !input.safeParse(value).success || value.endsWith('-00:00')) {
    throw new GraphQLError('DateTime requiere fecha ISO 8601 con milisegundos y zona horaria.', {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }
  const date = new Date(value);
  if (
    !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() < 1 ||
    date.getUTCFullYear() > 9999
  ) {
    throw new GraphQLError('DateTime fuera de rango.', { extensions: { code: 'BAD_USER_INPUT' } });
  }
  return date;
}

export const DateTime = new GraphQLScalarType<Date, string>({
  name: 'DateTime',
  description: 'Fecha ISO 8601 con milisegundos y zona horaria; salida normalizada a UTC.',
  serialize(value) {
    try {
      const date = value instanceof Date ? value : parse(value);
      if (
        !Number.isFinite(date.getTime()) ||
        date.getUTCFullYear() < 1 ||
        date.getUTCFullYear() > 9999
      )
        throw new Error();
      return date.toISOString();
    } catch {
      throw new GraphQLError('Fecha almacenada no válida.', {
        extensions: { code: 'INTERNAL_SERVER_ERROR' },
      });
    }
  },
  parseValue: parse,
  parseLiteral(node) {
    if (node.kind !== Kind.STRING)
      throw new GraphQLError('DateTime solo acepta texto ISO 8601.', {
        extensions: { code: 'BAD_USER_INPUT' },
      });
    return parse(node.value);
  },
});
