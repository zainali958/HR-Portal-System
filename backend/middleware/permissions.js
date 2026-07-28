// These helpers are the actual security boundary Shafaat asked for:
// "Enforce role and company restrictions ON THE SERVER, not by hiding
// buttons." Every route that touches company-scoped data must use
// scopeFilter() or checkCompanyAccess() below - never just trust the
// frontend to only show the right data.

// Middleware factory: blocks the request unless the logged-in user's role
// has the given permission flag set to true (e.g. "canApprove").
function requirePermission(flagName) {
  return function (req, res, next) {
    if (!req.user.role || req.user.role[flagName] !== true) {
      return res.status(403).json({ message: "You don't have permission to do this" });
    }
    next();
  };
}

// Returns a MongoDB filter object that scopes a list query to what this
// user is allowed to see:
// - HR / COO / CEO (canViewAllCompanies: true) -> no filter, sees everything
// - Unit Manager -> filtered to only their own company's records
function scopeFilter(user) {
  if (user.role.canViewAllCompanies) {
    return {};
  }
  return { company: user.company._id };
}

// For single-record routes (e.g. GET /api/offers/:id) where a Unit Manager
// could try to guess another company's record ID directly. Returns true/false
// rather than throwing, so the route decides how to respond (404, not 403 -
// so we don't even confirm the record exists to someone who shouldn't see it).
function canAccessCompany(user, companyId) {
  if (user.role.canViewAllCompanies) return true;
  if (!user.company) return false;
  return user.company._id.toString() === companyId.toString();
}
// For stage-specific routes where only ONE named role can act - e.g. only
// HR can make the HR-stage decision, only CEO can make the CEO-stage
// decision. Different from requirePermission(), which checks a boolean
// flag - this checks the literal role name, since "being HR" and "being
// able to approve something" aren't the same gate anymore now that
// Accountant/Finance can also approve things.
function requireRole(roleName) {
  return function (req, res, next) {
    if (!req.user.role || req.user.role.name !== roleName) {
      return res.status(403).json({ message: `Only ${roleName} can do this` });
    }
    next();
  };
}
// For blocking entire route files to only certain roles - e.g. Payroll
// routes should 403 immediately for a Unit Manager, since they have no
// involvement in payroll at all. Different from requireRole() (exact
// single role) and requirePermission() (boolean flag) - this checks
// membership in a list of allowed role names.
function requireAnyRole(roleNames) {
  return function (req, res, next) {
    if (!req.user.role || !roleNames.includes(req.user.role.name)) {
      return res.status(403).json({ message: "You don't have access to this section" });
    }
    next();
  };
}

module.exports = { requirePermission, scopeFilter, canAccessCompany, requireRole, requireAnyRole };

