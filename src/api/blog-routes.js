'use strict';

const express = require('express');
const db = require('../db/pool');
const queries = require('../db/queries');
const {
  requireUser,
  requireAdmin,
  requireManagerOrAdmin,
} = require('../auth/middleware');

/**
 * Blog routes.
 *
 * Two routers are exported and mounted separately by server.js:
 *
 *   publicRouter  -> /api/v1/blog          (NO auth — public site)
 *     GET /                ?limit&offset   list PUBLISHED posts (excerpt only)
 *     GET /:slug                           one PUBLISHED post (full Markdown)
 *
 *   adminRouter   -> /api/v1/admin/blog    (Bearer JWT + role gate)
 *     GET    /             ?status&limit&offset   list ALL posts (manager|admin)
 *     GET    /:id                                 one post by id   (manager|admin)
 *     POST   /                                    create a post    (manager|admin)
 *     PUT    /:id                                 update a post    (manager|admin)
 *     DELETE /:id                                 delete a post    (admin only)
 *
 * `content` holds raw Markdown; it is stored/returned verbatim (rendering is the
 * frontend's job). All SQL is parameterized via queries.js — no raw input is
 * ever interpolated into a statement.
 */

// --- Validation limits -----------------------------------------------------
const MAX_TITLE = 300;
const MAX_SLUG = 300;
const MAX_EXCERPT = 1000;
const MAX_COVER_URL = 2000;

const BLOG_DEFAULT_LIMIT = 20;
const BLOG_MAX_LIMIT = 100;

const VALID_BLOG_STATUSES = queries.VALID_BLOG_STATUSES; // ['draft','published']

/** Parse a positive integer route param, or null if it isn't one. */
function parseId(raw) {
  const id = parseInt(raw, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Clamp/normalize ?limit & ?offset query params. */
function parsePaging(req, defLimit, maxLimit) {
  let limit = parseInt(req.query.limit, 10);
  let offset = parseInt(req.query.offset, 10);
  if (!Number.isFinite(limit) || limit <= 0) limit = defLimit;
  if (limit > maxLimit) limit = maxLimit;
  if (!Number.isFinite(offset) || offset < 0) offset = 0;
  return { limit, offset };
}

// ===========================================================================
// Public router — /api/v1/blog
// ===========================================================================
const publicRouter = express.Router();

// ---------------------------------------------------------------------------
// GET /  — list published posts (newest first), excerpt only
// ---------------------------------------------------------------------------
publicRouter.get('/', async (req, res, next) => {
  try {
    if (!db.isEnabled()) {
      return res.status(503).json({ error: 'blog requires a configured database' });
    }
    const { limit, offset } = parsePaging(req, BLOG_DEFAULT_LIMIT, BLOG_MAX_LIMIT);
    const { posts, total } = await queries.listPublishedPosts(limit, offset);
    return res.json({ posts, total, limit, offset });
  } catch (err) {
    return next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /:slug  — one published post with full content
// ---------------------------------------------------------------------------
publicRouter.get('/:slug', async (req, res, next) => {
  try {
    if (!db.isEnabled()) {
      return res.status(503).json({ error: 'blog requires a configured database' });
    }
    const slug = typeof req.params.slug === 'string' ? req.params.slug.trim() : '';
    if (!slug) {
      return res.status(400).json({ error: 'invalid slug' });
    }
    const post = await queries.getPublishedPostBySlug(slug);
    if (!post) {
      // 404 covers both "no such slug" and "exists but not published" — the
      // public must not be able to tell a draft exists.
      return res.status(404).json({ error: 'post not found' });
    }
    return res.json({ post });
  } catch (err) {
    return next(err);
  }
});

// ===========================================================================
// Admin router — /api/v1/admin/blog
// ===========================================================================
const adminRouter = express.Router();

// ---------------------------------------------------------------------------
// GET /  — list ALL posts (manager|admin), optional ?status filter
// ---------------------------------------------------------------------------
adminRouter.get('/', requireUser, requireManagerOrAdmin, async (req, res, next) => {
  try {
    const { limit, offset } = parsePaging(req, BLOG_DEFAULT_LIMIT, BLOG_MAX_LIMIT);

    let status = null;
    if (typeof req.query.status === 'string' && req.query.status.trim()) {
      status = req.query.status.trim();
      if (!VALID_BLOG_STATUSES.includes(status)) {
        return res.status(400).json({
          error: `"status" must be one of: ${VALID_BLOG_STATUSES.join(', ')}`,
        });
      }
    }

    const { posts, total } = await queries.listAllPostsAdmin({ status, limit, offset });
    return res.json({ posts, total, limit, offset });
  } catch (err) {
    return next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /:id  — one post by id, any status (manager|admin)
// ---------------------------------------------------------------------------
adminRouter.get('/:id', requireUser, requireManagerOrAdmin, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: 'invalid post id' });
    }
    const post = await queries.getBlogPostById(id);
    if (!post) {
      return res.status(404).json({ error: 'post not found' });
    }
    return res.json({ post });
  } catch (err) {
    return next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /  — create a post (manager|admin)
//   body { title, slug?, excerpt?, content, cover_image_url?, status }
// ---------------------------------------------------------------------------
adminRouter.post('/', requireUser, requireManagerOrAdmin, async (req, res, next) => {
  try {
    const body = req.body || {};
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const content = typeof body.content === 'string' ? body.content : '';
    const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
    const excerptRaw = typeof body.excerpt === 'string' ? body.excerpt.trim() : '';
    const coverRaw =
      typeof body.cover_image_url === 'string' ? body.cover_image_url.trim() : '';
    const status = typeof body.status === 'string' ? body.status.trim() : 'draft';

    if (!title) {
      return res.status(400).json({ error: '"title" is required' });
    }
    if (title.length > MAX_TITLE) {
      return res.status(400).json({ error: `"title" must be at most ${MAX_TITLE} characters` });
    }
    if (!content.trim()) {
      return res.status(400).json({ error: '"content" is required' });
    }
    if (slug && slug.length > MAX_SLUG) {
      return res.status(400).json({ error: `"slug" must be at most ${MAX_SLUG} characters` });
    }
    if (excerptRaw && excerptRaw.length > MAX_EXCERPT) {
      return res.status(400).json({ error: `"excerpt" must be at most ${MAX_EXCERPT} characters` });
    }
    if (coverRaw && coverRaw.length > MAX_COVER_URL) {
      return res.status(400).json({ error: `"cover_image_url" must be at most ${MAX_COVER_URL} characters` });
    }
    if (!VALID_BLOG_STATUSES.includes(status)) {
      return res.status(400).json({
        error: `"status" must be one of: ${VALID_BLOG_STATUSES.join(', ')}`,
      });
    }

    const post = await queries.createBlogPost({
      title,
      slug: slug || null,
      excerpt: excerptRaw || null,
      content,
      coverImageUrl: coverRaw || null,
      status,
      authorId: req.authUser.id,
    });
    return res.status(201).json({ post });
  } catch (err) {
    return next(err);
  }
});

// ---------------------------------------------------------------------------
// PUT /:id  — update a post (manager|admin)
//   body may include any of { title, slug, excerpt, content, cover_image_url, status }
// ---------------------------------------------------------------------------
adminRouter.put('/:id', requireUser, requireManagerOrAdmin, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: 'invalid post id' });
    }

    const body = req.body || {};
    const fields = {};

    if (body.title !== undefined) {
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (!title) {
        return res.status(400).json({ error: '"title" must be non-empty' });
      }
      if (title.length > MAX_TITLE) {
        return res.status(400).json({ error: `"title" must be at most ${MAX_TITLE} characters` });
      }
      fields.title = title;
    }

    if (body.content !== undefined) {
      const content = typeof body.content === 'string' ? body.content : '';
      if (!content.trim()) {
        return res.status(400).json({ error: '"content" must be non-empty' });
      }
      fields.content = content;
    }

    if (body.slug !== undefined) {
      const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
      if (slug.length > MAX_SLUG) {
        return res.status(400).json({ error: `"slug" must be at most ${MAX_SLUG} characters` });
      }
      fields.slug = slug; // empty string => regenerate from title in the query layer
    }

    if (body.excerpt !== undefined) {
      const excerpt = typeof body.excerpt === 'string' ? body.excerpt.trim() : '';
      if (excerpt.length > MAX_EXCERPT) {
        return res.status(400).json({ error: `"excerpt" must be at most ${MAX_EXCERPT} characters` });
      }
      fields.excerpt = excerpt || null;
    }

    if (body.cover_image_url !== undefined) {
      const cover = typeof body.cover_image_url === 'string' ? body.cover_image_url.trim() : '';
      if (cover.length > MAX_COVER_URL) {
        return res.status(400).json({ error: `"cover_image_url" must be at most ${MAX_COVER_URL} characters` });
      }
      fields.coverImageUrl = cover || null;
    }

    if (body.status !== undefined) {
      const status = typeof body.status === 'string' ? body.status.trim() : '';
      if (!VALID_BLOG_STATUSES.includes(status)) {
        return res.status(400).json({
          error: `"status" must be one of: ${VALID_BLOG_STATUSES.join(', ')}`,
        });
      }
      fields.status = status;
    }

    const updated = await queries.updateBlogPost(id, fields);
    if (!updated) {
      return res.status(404).json({ error: 'post not found' });
    }
    return res.json({ post: updated });
  } catch (err) {
    return next(err);
  }
});

// ---------------------------------------------------------------------------
// DELETE /:id  — delete a post (admin only)
// ---------------------------------------------------------------------------
adminRouter.delete('/:id', requireUser, requireAdmin, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: 'invalid post id' });
    }
    const deleted = await queries.deleteBlogPost(id);
    if (!deleted) {
      return res.status(404).json({ error: 'post not found' });
    }
    return res.json({ ok: true, id });
  } catch (err) {
    return next(err);
  }
});

module.exports = { publicRouter, adminRouter };
