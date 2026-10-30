import type { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';

export const moduleSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  sortOrder: true,
} as const;
export const contentSelect = {
  id: true,
  title: true,
  summary: true,
  status: true,
  moduleId: true,
  createdAt: true,
  updatedAt: true,
} as const;
export type PublicModule = Prisma.EducationalModuleGetPayload<{ select: typeof moduleSelect }>;
export type PublicContent = Prisma.EducationalContentGetPayload<{ select: typeof contentSelect }>;
export interface PageInput {
  page: number;
  pageSize: number;
}
export interface ModuleFilter extends PageInput {
  search?: string;
  active?: boolean;
}
export interface ContentFilter extends PageInput {
  moduleId?: string;
  status?: 'DRAFT' | 'PUBLISHED' | 'INACTIVE';
}
const moduleOrder = [
  { sortOrder: 'asc' },
  { title: 'asc' },
  { id: 'asc' },
] satisfies Prisma.EducationalModuleOrderByWithRelationInput[];
const contentOrder = [
  { sortOrder: 'asc' },
  { id: 'asc' },
] satisfies Prisma.EducationalContentOrderByWithRelationInput[];
const visibleContent = {
  status: 'PUBLISHED',
  module: { status: 'PUBLISHED' },
} satisfies Prisma.EducationalContentWhereInput;
const pagination = (input: PageInput, total: number) => ({
  page: input.page,
  pageSize: input.pageSize,
  total,
  pages: Math.ceil(total / input.pageSize),
});

// Mismas reglas de visibilidad que routes/public.ts; nunca usa credenciales del solicitante.
export const publicEducation = {
  async modules(input: ModuleFilter) {
    if (input.active === false) return { items: [], pagination: pagination(input, 0) };
    const where: Prisma.EducationalModuleWhereInput = {
      status: 'PUBLISHED',
      ...(input.search
        ? {
            OR: [
              { title: { contains: input.search, mode: 'insensitive' } },
              { description: { contains: input.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, items] = await Promise.all([
      prisma.educationalModule.count({ where }),
      prisma.educationalModule.findMany({
        where,
        select: moduleSelect,
        orderBy: moduleOrder,
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
    ]);
    return { items, pagination: pagination(input, total) };
  },
  async contents(input: ContentFilter) {
    if (input.status && input.status !== 'PUBLISHED')
      return { items: [], pagination: pagination(input, 0) };
    const where: Prisma.EducationalContentWhereInput = {
      ...visibleContent,
      ...(input.moduleId ? { moduleId: input.moduleId } : {}),
    };
    const [total, items] = await Promise.all([
      prisma.educationalContent.count({ where }),
      prisma.educationalContent.findMany({
        where,
        select: contentSelect,
        orderBy: contentOrder,
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
    ]);
    return { items, pagination: pagination(input, total) };
  },
  modulesByIds(ids: readonly string[]) {
    return prisma.educationalModule.findMany({
      where: { id: { in: [...ids] }, status: 'PUBLISHED' },
      select: moduleSelect,
    });
  },
  contentsByIds(ids: readonly string[]) {
    return prisma.educationalContent.findMany({
      where: { id: { in: [...ids] }, ...visibleContent },
      select: contentSelect,
    });
  },
  // Prisma agrupa la relación para todos los módulos, con paginación por padre.
  contentsByModules(ids: readonly string[], input: PageInput) {
    return prisma.educationalModule.findMany({
      where: { id: { in: [...ids] }, status: 'PUBLISHED' },
      select: {
        id: true,
        contents: {
          where: { status: 'PUBLISHED' },
          select: contentSelect,
          orderBy: contentOrder,
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
        },
      },
    });
  },
};
