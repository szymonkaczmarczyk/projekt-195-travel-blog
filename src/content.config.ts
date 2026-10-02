import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

export const tagKeys = ['wyspy', 'gory', 'pustynie', 'dzika-przyroda', 'tropiki'] as const;

const kraje = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/kraje' }),
  schema: z.object({
    country: z.string().length(3),
    visited: z.coerce.date(),
    days: z.number().int().min(0),
    rating: z.number().int().min(1).max(5),
    top: z.boolean().default(false),
    home: z.boolean().default(false),
    tags: z.array(z.enum(tagKeys)).default([]),
    title: z.string().optional(),
    route: z.string().optional(),
    excerpt: z.string(),
    photoSearch: z.array(z.string()).default([]),
  }),
});

export const collections = { kraje };
