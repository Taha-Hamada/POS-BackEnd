export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** بيحوّل page/limit اللي جايين من الكويري لـ skip/limit جاهزين للاستعلام. */
export const buildPagination = ({ page = 1, limit = DEFAULT_PAGE_SIZE } = {}) => {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(limit) || DEFAULT_PAGE_SIZE),
  );

  return { page: safePage, limit: safeLimit, skip: (safePage - 1) * safeLimit };
};

export const buildPaginationMeta = ({ page, limit, total }) => ({
  page,
  limit,
  total,
  pages: Math.max(1, Math.ceil(total / limit)),
  hasNext: page * limit < total,
  hasPrev: page > 1,
});

export default { buildPagination, buildPaginationMeta };
