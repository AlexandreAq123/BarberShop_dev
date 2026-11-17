import { z } from "zod";

export const PAGE_LIMIT_MAX = 100;

/**
 * Paginação por offset. As listagens do admin são pequenas (equipe, catálogo, bloqueios
 * de um período), então offset basta; a ordenação de cada listagem termina SEMPRE em `id`
 * para ser estável entre páginas.
 */
export const pageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(PAGE_LIMIT_MAX).default(50),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

export type PageQuery = z.infer<typeof pageQuery>;

/** Prisma: busca uma linha a mais para saber se há próxima página. */
export const pageArgs = (page: PageQuery) => ({ skip: page.offset, take: page.limit + 1 });

export function toPage<T>(rows: T[], page: PageQuery) {
  const hasMore = rows.length > page.limit;
  return {
    items: hasMore ? rows.slice(0, page.limit) : rows,
    nextOffset: hasMore ? page.offset + page.limit : null,
  };
}

export const pageOut = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextOffset: z.number().int().nullable() });
