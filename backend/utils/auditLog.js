const AuditLog = require("../models/AuditLog");

// Every route that submits/approves/declines/edits calls this instead of
// writing to AuditLog directly - keeps the shape consistent everywhere.
async function logAction({ entityType, entityId, action, performedBy, details }) {
  try {
    await AuditLog.create({ entityType, entityId, action, performedBy, details: details || {} });
  } catch (err) {
    // An audit log failure shouldn't take down the actual request, but it
    // must never fail silently either - log it loudly so it gets noticed.
    console.error("AUDIT LOG WRITE FAILED:", { entityType, entityId, action }, err.message);
  }
}

module.exports = { logAction };