import { GraphQLError } from 'graphql';
import { z } from 'zod';
import { Prisma } from '../generated/prisma/client.js';
import {
  educationWrite,
  EducationWriteError,
  createContentSchema,
  updateContentSchema,
  updateModuleSchema,
} from '../services/education-write.js';
import { mutationModule, type EducationContext } from './education.js';

const denied = () =>
  new GraphQLError('Permisos insuficientes.', { extensions: { code: 'FORBIDDEN' } });
async function authorize(ctx: EducationContext, value: string, adminOnly = false) {
  if (!ctx.mutationAccess)
    throw new GraphQLError('Se requiere una sesión válida.', {
      extensions: { code: 'UNAUTHENTICATED' },
    });
  const actor = await ctx.mutationAccess();
  if (
    !actor.user.roles.includes('ADMINISTRADOR') &&
    (adminOnly || !actor.user.roles.includes('DOCENTE') || !actor.user.permissions.includes(value))
  )
    throw denied();
  return actor;
}
function permission(actor: Awaited<ReturnType<typeof authorize>>, value: string) {
  if (!actor.user.roles.includes('ADMINISTRADOR') && !actor.user.permissions.includes(value))
    throw denied();
}
async function execute<T>(work: () => Promise<T>) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof GraphQLError) throw error;
    if (error instanceof z.ZodError)
      throw new GraphQLError('Argumentos inválidos.', {
        extensions: {
          code: 'BAD_USER_INPUT',
          fields: error.issues.map((issue) => issue.path.join('.')),
        },
      });
    if (error instanceof EducationWriteError)
      throw new GraphQLError(error.message, { extensions: { code: error.code } });
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const code =
        error.code === 'P2025'
          ? 'NOT_FOUND'
          : ['P2002', 'P2034'].includes(error.code)
            ? 'CONFLICT'
            : error.code === 'P2003'
              ? 'BAD_USER_INPUT'
              : 'INTERNAL_SERVER_ERROR';
      const message =
        code === 'NOT_FOUND'
          ? 'Registro no encontrado.'
          : code === 'CONFLICT'
            ? 'La operación entra en conflicto con otro registro o cambio concurrente.'
            : code === 'BAD_USER_INPUT'
              ? 'Referencia de datos inválida.'
              : 'Error interno del servidor.';
      throw new GraphQLError(message, { extensions: { code } });
    }
    throw new GraphQLError('Error interno del servidor.', {
      extensions: { code: 'INTERNAL_SERVER_ERROR' },
    });
  }
}
function output(value: Awaited<ReturnType<typeof educationWrite.create>>, ctx: EducationContext) {
  ctx.clearEducation();
  // Instantánea solo en el resultado autorizado; no contamina cachés públicas.
  return Object.assign(value.content, { [mutationModule]: value.module });
}
export const mutationTypeDefs = `#graphql
  input CreateEducationalContentInput {
    moduleId: ID!
    title: String!
    description: String
    content: String
    learningObjective: String
    order: Int!
    status: ContentStatus
  }
  input UpdateEducationalContentInput {
    moduleId: ID
    title: String
    description: String
    content: String
    learningObjective: String
    order: Int
    status: ContentStatus
  }
  input UpdateEducationalModuleInput {
    name: String
    description: String
    active: Boolean
    order: Int
  }
  type Mutation {
    createEducationalContent(input: CreateEducationalContentInput!): EducationalContent!
    updateEducationalContent(id: ID!, input: UpdateEducationalContentInput!): EducationalContent!
    publishEducationalContent(id: ID!): EducationalContent!
    deactivateEducationalContent(id: ID!): EducationalContent!
    updateEducationalModule(id: ID!, input: UpdateEducationalModuleInput!): EducationalModule!
  }
`;
export const mutationResolvers = {
  createEducationalContent: (_root: unknown, args: { input: unknown }, ctx: EducationContext) =>
    execute(async () => {
      const { user, metadata } = await authorize(ctx, 'content.create');
      return output(
        await educationWrite.create(createContentSchema.parse(args.input), {
          id: user.id,
          metadata,
        }),
        ctx,
      );
    }),
  updateEducationalContent: (
    _root: unknown,
    args: { id: string; input: unknown },
    ctx: EducationContext,
  ) =>
    execute(async () => {
      const actor = await authorize(ctx, 'content.update');
      const input = updateContentSchema.parse(args.input);
      if (input.status === 'PUBLISHED') permission(actor, 'content.publish');
      if (input.status === 'INACTIVE') permission(actor, 'content.deactivate');
      return output(
        await educationWrite.update(z.uuid().parse(args.id), input, {
          id: actor.user.id,
          metadata: actor.metadata,
        }),
        ctx,
      );
    }),
  publishEducationalContent: (_root: unknown, args: { id: string }, ctx: EducationContext) =>
    execute(async () => {
      const { user, metadata } = await authorize(ctx, 'content.publish');
      return output(
        await educationWrite.changeStatus(z.uuid().parse(args.id), 'PUBLISHED', {
          id: user.id,
          metadata,
        }),
        ctx,
      );
    }),
  deactivateEducationalContent: (_root: unknown, args: { id: string }, ctx: EducationContext) =>
    execute(async () => {
      const { user, metadata } = await authorize(ctx, 'content.deactivate');
      return output(
        await educationWrite.changeStatus(z.uuid().parse(args.id), 'INACTIVE', {
          id: user.id,
          metadata,
        }),
        ctx,
      );
    }),
  updateEducationalModule: (
    _root: unknown,
    args: { id: string; input: unknown },
    ctx: EducationContext,
  ) =>
    execute(async () => {
      const { user, metadata } = await authorize(ctx, 'modules.status', true);
      const row = await educationWrite.updateModule(
        z.uuid().parse(args.id),
        updateModuleSchema.parse(args.input),
        { id: user.id, metadata },
      );
      ctx.clearEducation();
      return row;
    }),
};
