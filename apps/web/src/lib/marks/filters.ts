import {
  ancestorIds,
  childCategories,
  createId,
  defaultFilter,
  descendantIds,
  linksInCategory,
  type MarkLink,
  type MarksDoc,
  type MarksFilter,
} from './model';

export function parseTags(raw: string): string[] {
  const parts = raw
    .split(/[,#\s]+/g)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(parts)];
}

export function allTags(doc: MarksDoc): string[] {
  const tags = new Set<string>();
  for (const link of doc.links) {
    for (const tag of link.tags) tags.add(tag);
  }
  return [...tags].sort((a, b) => a.localeCompare(b));
}

export function linkMatchesQuery(link: MarkLink, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = `${link.title} ${link.url} ${link.note} ${link.tags.join(' ')}`.toLowerCase();
  return q.split(/\s+/).every((part) => hay.includes(part));
}

export interface MarksQuery {
  query?: string;
  tag?: string;
  categoryId?: string;
}

export function applyMarksQuery(doc: MarksDoc, query: MarksQuery): MarksDoc {
  const text = (query.query ?? '').trim();
  const tag = (query.tag ?? '').trim().toLowerCase();
  const categoryId = (query.categoryId ?? '').trim();
  const inTree = categoryId ? new Set([categoryId, ...descendantIds(doc, categoryId)]) : null;

  const links = doc.links.filter((link) => {
    if (inTree && !inTree.has(link.categoryId)) return false;
    if (tag && !link.tags.includes(tag)) return false;
    if (text && !linkMatchesQuery(link, text)) return false;
    return true;
  });

  if (!text && !tag && !categoryId) return doc;

  const used = new Set<string>();
  for (const link of links) {
    if (!link.categoryId) continue;
    used.add(link.categoryId);
    for (const ancestor of ancestorIds(doc, link.categoryId)) used.add(ancestor);
  }

  if (text) {
    const needle = text.toLowerCase();
    for (const category of doc.categories) {
      if (!category.name.toLowerCase().includes(needle)) continue;
      used.add(category.id);
      for (const ancestor of ancestorIds(doc, category.id)) used.add(ancestor);
      for (const child of descendantIds(doc, category.id)) used.add(child);
    }
  }

  if (categoryId) {
    used.add(categoryId);
    for (const ancestor of ancestorIds(doc, categoryId)) used.add(ancestor);
  }

  return {
    ...doc,
    links,
    categories: doc.categories.filter((category) => used.has(category.id)),
  };
}

export function applySavedFilter(doc: MarksDoc, filter: MarksFilter, extraQuery = ''): MarksDoc {
  const query = [filter.query, extraQuery].filter((part) => part.trim()).join(' ');
  return applyMarksQuery(doc, {
    query,
    tag: filter.tag,
    categoryId: filter.categoryId,
  });
}

export function addFilter(
  doc: MarksDoc,
  input: { name: string; query?: string; tag?: string; categoryId?: string }
): MarksDoc {
  const name = input.name.trim();
  if (!name) return doc;
  return {
    ...doc,
    updatedAt: Date.now(),
    filters: [
      ...doc.filters,
      defaultFilter({
        id: createId('flt'),
        name,
        query: (input.query ?? '').trim(),
        tag: (input.tag ?? '').trim().toLowerCase(),
        categoryId: input.categoryId ?? '',
      }),
    ],
  };
}

export function removeFilter(doc: MarksDoc, id: string): MarksDoc {
  return {
    ...doc,
    updatedAt: Date.now(),
    filters: doc.filters.filter((filter) => filter.id !== id),
  };
}

export function categoryHasVisibleContent(doc: MarksDoc, id: string): boolean {
  if (linksInCategory(doc, id).length > 0) return true;
  return childCategories(doc, id).some((child) => categoryHasVisibleContent(doc, child.id));
}
