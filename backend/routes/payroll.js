const express = require("express");
const router = express.Router();
const PayrollCycle = require("../models/PayrollCycle");
const requireAuth = require("../middleware/auth");
const { requireRole, scopeFilter, canAccessCompany, requireAnyRole } = require("../middleware/permissions");
const { logAction } = require("../utils/auditLog");

router.use(requireAuth);
router.use(requireAnyRole(["HR", "CEO", "Accountant", "Finance"]));

const PAYROLL_POPULATE = [
  { path: "company" },
  { path: "createdBy", select: "fullName email" },
  { path: "entries.employee", select: "employeeName designation" },
  { path: "financeDecision.by", select: "fullName email" },
  { path: "accountantDecision.by", select: "fullName email" },
  { path: "ceoDecision.by", select: "fullName email" },
];

// GET /api/payroll
router.get("/", async (req, res) => {
  try {
    const filter = scopeFilter(req.user);
    if (req.query.status) filter.status = req.query.status;
    const cycles = await PayrollCycle.find(filter).sort({ createdAt: -1 }).populate(PAYROLL_POPULATE);
    res.json(cycles);
  } catch (err) {
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
});

// GET /api/payroll/:id
router.get("/:id", async (req, res) => {
  try {
    const cycle = await PayrollCycle.findById(req.params.id).populate(PAYROLL_POPULATE);
    if (!cycle || !canAccessCompany(req.user, cycle.company._id)) {
      return res.status(404).json({ message: "Payroll cycle not found" });
    }
    res.json(cycle);
  } catch (err) {
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
});

// POST /api/payroll - HR only, creates + submits a cycle for one company/month
router.post("/", requireRole("HR"), async (req, res) => {
  try {
    const { companyId, month, entries } = req.body;
    if (!companyId || !month || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ message: "companyId, month, and at least one entry are required" });
    }

    const cycle = await PayrollCycle.create({
      company: companyId,
      month,
      createdBy: req.user._id,
      entries,
      status: "Pending Finance Review",
    });

    await logAction({ entityType: "PayrollCycle", entityId: cycle._id, action: "submitted", performedBy: req.user._id });

    await cycle.populate(PAYROLL_POPULATE);
    res.status(201).json(cycle);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: "A payroll cycle for this company and month already exists" });
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
});

// Shared stage-decision logic, same atomic pattern as Offers.
async function makeStageDecision(req, res, { requiredStatus, approvedStatus, decisionField }) {
  const { decision, reason } = req.body;
  const validDecisions = ["Approved", "Declined"];
  if (!validDecisions.includes(decision)) {
    return res.status(400).json({ message: `decision must be one of: ${validDecisions.join(", ")}` });
  }
  if (decision === "Declined" && !reason) {
    return res.status(400).json({ message: "A reason is required to decline" });
  }
const update = {
    status: decision === "Approved" ? approvedStatus : "Declined",
    [`${decisionField}.by`]: req.user._id,
    [`${decisionField}.at`]: new Date(),
    [`${decisionField}.reason`]: reason || "",
  };

  const cycle = await PayrollCycle.findOneAndUpdate(
    { _id: req.params.id, status: requiredStatus },
    update,
    { new: true }
  ).populate(PAYROLL_POPULATE);

  if (!cycle) {
    return res.status(409).json({ message: "This cycle's status has already changed - refresh to see the current status" });
  }

  await logAction({ entityType: "PayrollCycle", entityId: cycle._id, action: `${decision.toLowerCase()}_${decisionField.replace("Decision", "")}`, performedBy: req.user._id, details: { reason: reason || null } });
  res.json(cycle);
}

// POST /api/payroll/:id/finance-decision - Finance only
router.post("/:id/finance-decision", requireRole("Finance"), async (req, res) => {
  try {
    await makeStageDecision(req, res, {
      requiredStatus: "Pending Finance Review",
      approvedStatus: "Pending Accountant Review",
      decisionField: "financeDecision",
    });
  } catch (err) {
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
});

// POST /api/payroll/:id/accountant-decision - Accountant only
router.post("/:id/accountant-decision", requireRole("Accountant"), async (req, res) => {
  try {
    await makeStageDecision(req, res, {
      requiredStatus: "Pending Accountant Review",
      approvedStatus: "Pending CEO Review",
      decisionField: "accountantDecision",
    });
  } catch (err) {
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
});

// POST /api/payroll/:id/ceo-decision - CEO only, final sign-off
router.post("/:id/ceo-decision", requireRole("CEO"), async (req, res) => {
  try {
    await makeStageDecision(req, res, {
      requiredStatus: "Pending CEO Review",
      approvedStatus: "Approved",
      decisionField: "ceoDecision",
    });
  } catch (err) {
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
});

// POST /api/payroll/:id/escalate - Finance or Accountant flags a problem to HR
router.post("/:id/escalate", async (req, res) => {
  try {
    if (!["Finance", "Accountant"].includes(req.user.role.name)) {
      return res.status(403).json({ message: "Only Finance or Accountant can escalate a payroll cycle" });
    }
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ message: "A reason is required to escalate" });

    const cycle = await PayrollCycle.findById(req.params.id);
    if (!cycle) return res.status(404).json({ message: "Payroll cycle not found" });

    cycle.stageBeforeEscalation = cycle.status;
    cycle.status = "Needs HR Attention";
    cycle.escalatedToHR = true;
    cycle.escalationReason = reason;
    cycle.escalatedAt = new Date();
    await cycle.save();

    await logAction({ entityType: "PayrollCycle", entityId: cycle._id, action: "escalated_to_hr", performedBy: req.user._id, details: { reason } });

    await cycle.populate(PAYROLL_POPULATE);
    res.json(cycle);
  } catch (err) {
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
});

// POST /api/payroll/:id/resolve-escalation - HR only, sends it back to
// whichever stage it was at before the escalation
router.post("/:id/resolve-escalation", requireRole("HR"), async (req, res) => {
  try {
    const cycle = await PayrollCycle.findById(req.params.id);
    if (!cycle) return res.status(404).json({ message: "Payroll cycle not found" });
    if (cycle.status !== "Needs HR Attention") {
      return res.status(400).json({ message: "This cycle isn't currently escalated" });
    }

    cycle.status = cycle.stageBeforeEscalation || "Pending Finance Review";
    cycle.escalatedToHR = false;
    cycle.stageBeforeEscalation = null;
    await cycle.save();

    await logAction({ entityType: "PayrollCycle", entityId: cycle._id, action: "escalation_resolved", performedBy: req.user._id });

    await cycle.populate(PAYROLL_POPULATE);
    res.json(cycle);
  } catch (err) {
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
});

// POST /api/payroll/:id/escalate-to-ceo - HR only, for a bigger problem
// that's gone unresolved 2-3 days (manual trigger, per Shafaat's note -
// no automatic timer built yet)
router.post("/:id/escalate-to-ceo", requireRole("HR"), async (req, res) => {
  try {
    const cycle = await PayrollCycle.findById(req.params.id);
    if (!cycle) return res.status(404).json({ message: "Payroll cycle not found" });

    cycle.escalatedToCEO = true;
    cycle.escalatedToCEOAt = new Date();
    await cycle.save();

    await logAction({ entityType: "PayrollCycle", entityId: cycle._id, action: "escalated_to_ceo", performedBy: req.user._id });

    await cycle.populate(PAYROLL_POPULATE);
    res.json(cycle);
  } catch (err) {
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
});

module.exports = router;