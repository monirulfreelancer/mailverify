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
 * Admin / manager dashboard routes, mounted under /api/v1/admin by server.js.
 *
 * Every route is behind JWT session auth (requireUser) plus a role gate:
 *   - read + credit endpoints: requireManagerOrAdmin
 *   - status + role changes:   requireAdmin (admin only)
 *
 *   GET   /admin/stats                 (manager|admin)
 *   GET   /admin/users                 (manager|admin)  ?limit&offset&search
 *   GET   /admin/users/:id             (manager|admin)
 *   POST  /admin/users/:id/credits     (manager|admin)  { amount, mode }
 *   PATCH /admin/users/:id/status      (admin)          { status }
 *   PATCH /admin/users/:id/role        (admin)          { role }
 *
 * requireUser already returns 503 when no database is configured, so the
 * handlers below can assume persistence is available.
 */

const router = express.Router();

const USERS_DEFAULT_LIMIT = 50;
const USERS_MAX_LIMIT = 200;

const VALID_STATUSES = ['active', 'suspended', 'banned'];
const VALID_ROLES = ['user', 'manager', 'admin'];

/** Parse a positive integer route param, or null if it isn't one. */
function parseId(raw) {
  const id = parseInt(raw, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// ---------------------------------------------------------------------------
// GET /admin/stats  — platform totals (manager|admin)
// ---------------------------------------------------------------------------
router.get(
  '/stats',
  requireUser,
  requireManagerOrAdmin,
  async (req, res, next) => {
    try {
      const stats = await queries.getAdminStats();
      return res.json(stats);
    } catch (err) {
      return next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /admin/users  — paginated list (manager|admin)
// ---------------------------------------------------------------------------
router.get(
  '/users',
  requireUser,
  requireManagerOrAdmin,
  async (req, res, next) => {
    try {
      let limit = parseInt(req.query.limit, 10);
      let offset = parseInt(req.query.offset, 10);
      if (!Number.isFinite(limit) || limit <= 0) limit = USERS_DEFAULT_LIMIT;
      if (limit > USERS_MAX_LIMIT) limit = USERS_MAX_LIMIT;
      if (!Number.isFinite(offset) || offset < 0) offset = 0;

      const search =
        typeof req.query.search === 'string' ? req.query.search : null;

      const { users, total } = await queries.listUsersAdmin({
        limit,
        offset,
        search,
      });
      return res.json({ users, total, limit, offset });
    } catch (err) {
      return next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /admin/users/:id  — one user's detail (manager|admin)
// ---------------------------------------------------------------------------
router.get(
  '/users/:id',
  requireUser,
  requireManagerOrAdmin,
  async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      if (id === null) {
        return res.status(400).json({ error: 'invalid user id' });
      }
      const detail = await queries.getUserDetailAdmin(id);
      if (!detail) {
        return res.status(404).json({ error: 'user not found' });
      }
      return res.json(detail);
    } catch (err) {
      return next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /admin/users/:id/credits  — adjust credits (manager|admin)
//   body { amount: number, mode: 'add' | 'set' }
// ---------------------------------------------------------------------------
router.post(
  '/users/:id/credits',
  requireUser,
  requireManagerOrAdmin,
  async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      if (id === null) {
        return res.status(400).json({ error: 'invalid user id' });
      }

      const { amount, mode } = req.body || {};

      if (typeof amount !== 'number' || !Number.isInteger(amount)) {
        return res
          .status(400)
          .json({ error: '"amount" must be an integer' });
      }
      if (mode !== 'add' && mode !== 'set') {
        return res
          .status(400)
          .json({ error: '"mode" must be "add" or "set"' });
      }
      // 'set' to a negative balance makes no sense; 'add' may be negative.
      if (mode === 'set' && amount < 0) {
        return res
          .status(400)
          .json({ error: '"amount" cannot be negative when mode is "set"' });
      }

      const newBalance = await queries.adminAdjustCredits(
        id,
        amount,
        mode,
        req.authUser.id
      );
      if (newBalance === null) {
        return res.status(404).json({ error: 'user not found' });
      }
      return res.json({ id, credits: newBalance });
    } catch (err) {
      return next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// PATCH /admin/users/:id/status  — set account status (admin only)
//   body { status: 'active' | 'suspended' | 'banned' }
// ---------------------------------------------------------------------------
router.patch(
  '/users/:id/status',
  requireUser,
  requireAdmin,
  async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      if (id === null) {
        return res.status(400).json({ error: 'invalid user id' });
      }

      const { status } = req.body || {};
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({
          error: `"status" must be one of: ${VALID_STATUSES.join(', ')}`,
        });
      }

      // An admin must not lock themselves out by suspending/banning self.
      if (id === req.authUser.id && status !== 'active') {
        return res
          .status(400)
          .json({ error: 'you cannot suspend or ban your own account' });
      }

      const updated = await queries.setUserStatus(id, status);
      if (!updated) {
        return res.status(404).json({ error: 'user not found' });
      }
      return res.json({ user: updated });
    } catch (err) {
      return next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// PATCH /admin/users/:id/role  — set role (admin only)
//   body { role: 'user' | 'manager' | 'admin' }
// ---------------------------------------------------------------------------
router.patch(
  '/users/:id/role',
  requireUser,
  requireAdmin,
  async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      if (id === null) {
        return res.status(400).json({ error: 'invalid user id' });
      }

      const { role } = req.body || {};
      if (!VALID_ROLES.includes(role)) {
        return res.status(400).json({
          error: `"role" must be one of: ${VALID_ROLES.join(', ')}`,
        });
      }

      // Guard 1: an admin cannot demote themselves.
      if (id === req.authUser.id && role !== 'admin') {
        return res
          .status(400)
          .json({ error: 'you cannot remove your own admin role' });
      }

      // Guard 2: never let the platform reach zero admins. If the target is
      // currently the last remaining admin and this change removes that role,
      // reject it.
      if (role !== 'admin') {
        const detail = await queries.getUserDetailAdmin(id);
        if (!detail) {
          return res.status(404).json({ error: 'user not found' });
        }
        if (detail.user.role === 'admin') {
          const admins = await queries.countAdmins();
          if (admins <= 1) {
            return res.status(400).json({
              error: 'cannot remove the last remaining admin',
            });
          }
        }
      }

      const updated = await queries.setUserRole(id, role);
      if (!updated) {
        return res.status(404).json({ error: 'user not found' });
      }
      return res.json({ user: updated });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
