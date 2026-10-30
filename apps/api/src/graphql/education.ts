import DataLoader from 'dataloader';
import { GraphQLError } from 'graphql';
import { z } from 'zod';

import {
  publicEducation,
  type PublicModule,
  type PublicContent,
  type PageInput,
} from '../services/public-education.js';
import { DateTime } from './date-time.js';
import type { MutationAccess } from './mutation-auth.js';

export const mutationModule = Symbol('authorizedMutationModule');

const pageSchema = z.object({
  page: z.number().int().min(1).max(100000).default(1),
  pageSize: z.number().int().min(1).max(50).default(10),
});
const moduleSchema = pageSchema.extend({
  search: z.string().trim().max(100).nullish(),
  active: z.boolean().nullish(),
});
const contentSchema = pageSchema.extend({
  moduleId: z.uuid().nullish(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'INACTIVE']).nullish(),
});
function validate<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new GraphQLError('Argumentos inválidos.', {
      extensions: {
        code: 'BAD_USER_INPUT',
        issues: parsed.error.issues.map(({ path, message }) => ({ path: path.join('.'), message })),
      },
    });
  return parsed.data;
}
const missing = (kind: 'MODULE' | 'CONTENT') =>
  new GraphQLError(kind === 'MODULE' ? 'Módulo no disponible.' : 'Contenido no disponible.', {
    extensions: { code: `${kind}_NOT_FOUND` },
  });

export function createEducationContext(service = publicEducation, mutationAccess?: MutationAccess) {
  const modules = new DataLoader<string, PublicModule | null>(async (ids) => {
    const rows = await service.modulesByIds(ids);
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.map((id) => byId.get(id) ?? null);
  });
  const contents = new DataLoader<string, PublicContent | null>(async (ids) => {
    const rows = await service.contentsByIds(ids);
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.map((id) => byId.get(id) ?? null);
  });
  // Una carga agrupada por combinación de paginación; la caché nunca cruza peticiones.
  const groups = new Map<string, DataLoader<string, PublicContent[]>>();
  function moduleContents(id: string, page: PageInput) {
    const key = `${page.page}:${page.pageSize}`;
    let loader = groups.get(key);
    if (!loader) {
      loader = new DataLoader(async (ids: readonly string[]) => {
        const rows = await service.contentsByModules(ids, page);
        const byId = new Map(rows.map((row) => [row.id, row.contents]));
        for (const row of rows)
          for (const content of row.contents) contents.prime(content.id, content);
        return ids.map((moduleId) => byId.get(moduleId) ?? []);
      });
      groups.set(key, loader);
    }
    return loader.load(id);
  }
  return {
    service,
    modules,
    contents,
    moduleContents,
    mutationAccess,
    clearEducation() {
      modules.clearAll();
      contents.clearAll();
      groups.clear();
    },
  };
}
export type EducationContext = ReturnType<typeof createEducationContext>;

export const educationTypeDefs = `#graphql
  scalar DateTime
  enum ContentStatus { DRAFT PUBLISHED INACTIVE }
  type EducationalModule {
    id: ID!
    name: String!
    description: String
    active: Boolean!
    order: Int!
    contents(page: Int! = 1, pageSize: Int! = 10): [EducationalContent!]!
  }
  type EducationalContent {
    id: ID!
    title: String!
    description: String
    status: ContentStatus!
    module: EducationalModule!
    createdAt: DateTime!
    updatedAt: DateTime!
  }
  type Pagination { page: Int! pageSize: Int! total: Int! pages: Int! }
  type ModulePage { items: [EducationalModule!]! pagination: Pagination! }
  type ContentPage { items: [EducationalContent!]! pagination: Pagination! }
  extend type Query {
    module(id: ID!): EducationalModule
    modules(page: Int! = 1, pageSize: Int! = 10, search: String, active: Boolean): ModulePage!
    content(id: ID!): EducationalContent
    contents(page: Int! = 1, pageSize: Int! = 10, moduleId: ID, status: ContentStatus): ContentPage!
  }
`;

export const educationResolvers = {
  DateTime,
  Query: {
    async module(_parent: unknown, args: { id: string }, ctx: EducationContext) {
      const row = await ctx.modules.load(validate(z.uuid(), args.id));
      if (!row) throw missing('MODULE');
      return row;
    },
    async content(_parent: unknown, args: { id: string }, ctx: EducationContext) {
      const row = await ctx.contents.load(validate(z.uuid(), args.id));
      if (!row) throw missing('CONTENT');
      return row;
    },
    async modules(_parent: unknown, args: unknown, ctx: EducationContext) {
      const { search, active, ...page } = validate(moduleSchema, args);
      const result = await ctx.service.modules({
        ...page,
        ...(search != null ? { search } : {}),
        ...(active != null ? { active } : {}),
      });
      for (const item of result.items) ctx.modules.prime(item.id, item);
      return result;
    },
    async contents(_parent: unknown, args: unknown, ctx: EducationContext) {
      const { moduleId, status, ...page } = validate(contentSchema, args);
      const result = await ctx.service.contents({
        ...page,
        ...(moduleId != null ? { moduleId } : {}),
        ...(status != null ? { status } : {}),
      });
      for (const item of result.items) ctx.contents.prime(item.id, item);
      return result;
    },
  },
  EducationalModule: {
    name: (row: PublicModule) => row.title,
    active: (row: PublicModule) => row.status === 'PUBLISHED',
    order: (row: PublicModule) => row.sortOrder,
    contents: (row: PublicModule, args: unknown, ctx: EducationContext) =>
      ctx.moduleContents(row.id, validate(pageSchema, args)),
  },
  EducationalContent: {
    description: (row: PublicContent) => row.summary,
    async module(
      row: PublicContent & { [mutationModule]?: PublicModule },
      _args: unknown,
      ctx: EducationContext,
    ) {
      if (row[mutationModule]) return row[mutationModule];
      const module = await ctx.modules.load(row.moduleId);
      if (!module) throw missing('MODULE');
      return module;
    },
  },
};
