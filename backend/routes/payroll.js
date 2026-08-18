const express = require("express");
const router = express.Router();
const PayrollCycle = require("../models/PayrollCycle");
const Employee = require("../models/Employee");
const requireAuth = require("../middleware/auth");
const { requireRole, scopeFilter, canAccessCompany, requireAnyRole } = require("../middleware/permissions");
const { logAction } = require("../utils/auditLog");
const { parseCheckInFile, parseLeaveFile, buildAttendanceSummary, calculateAttendanceDeduction } = require("../utils/attendanceParser");
const { fetchAttendanceFromSheet } = require("../utils/attendanceSheetsClient");

// AmanorX's standard weekly off, per company policy - Sunday. If this ever
// differs by company, this is the one place to change (e.g. read it off
// the Company doc instead of a constant).
const WEEKLY_OFF_WEEKDAY = 0;

function computeEntryAttendance({ month, employee, attendanceFile, leaveFile }) {
  const { presentDates, lateDates } = parseCheckInFile(attendanceFile);
  const leaveDates = leaveFile ? parseLeaveFile(leaveFile) : new Set();
  const summary = buildAttendanceSummary({ month, presentDates, lateDates, leaveDates, weeklyOffWeekday: WEEKLY_OFF_WEEKDAY });
  const deduction = calculateAttendanceDeduction(employee.grossSalary, summary);
  return { summary, deduction };
}

// Same as computeEntryAttendance above, but sources presence/lateness/leave
// data directly from AttendanceSystem's Google Sheet instead of an
// uploaded file - used when the employee has an attendanceUsername on file.
async function computeEntryAttendanceFromSheet({ month, employee }) {
  if (!employee.attendanceUsername) {
    throw new Error(`${employee.employeeName} doesn't have an AttendanceSystem username set - add one on their Employee page, or upload attendance files manually instead`);
  }
  const { presentDates, lateDates, leaveDates } = await fetchAttendanceFromSheet(employee.attendanceUsername, month);
  const summary = buildAttendanceSummary({ month, presentDates, lateDates, leaveDates, weeklyOffWeekday: WEEKLY_OFF_WEEKDAY });
  const deduction = calculateAttendanceDeduction(employee.grossSalary, summary);
  return { summary, deduction };
}

router.use(requireAuth);
router.use(requireAnyRole(["HR", "CEO", "Accountant", "Finance"]));

const PAYROLL_POPULATE = [
  { path: "company" },
  { path: "createdBy", select: "fullName email" },
  { path: "entries.employee", select: "employeeName designation pendingSalaryCarryForward" },
  { path: "financeDecision.by", select: "fullName email" },
  { path: "accountantDecision.by", select: "fullName email" },
  { path: "ceoDecision.by", select: "fullName email" },
  { path: "paidBy", select: "fullName email" },
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

// POST /api/payroll/fetch-attendance - HR only. Pulls attendance straight
// from AttendanceSystem's Google Sheet for one employee/month, so HR
// doesn't have to export/upload anything for employees who have an
// AttendanceSystem username on file.
router.post("/fetch-attendance", requireRole("HR"), async (req, res) => {
  try {
    const { employeeId, month } = req.body;
    if (!employeeId || !month) {
      return res.status(400).json({ message: "employeeId and month are required" });
    }

    const employee = await Employee.findById(employeeId);
    if (!employee || !canAccessCompany(req.user, employee.company)) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const { summary, deduction } = await computeEntryAttendanceFromSheet({ month, employee });
    const carriedForwardAmount = employee.pendingSalaryCarryForward || 0;
    const suggestedProposedAmount = Math.max(0, Math.round(employee.netPayable - deduction.totalDeduction)) + carriedForwardAmount;

    res.json({
      summary,
      deduction,
      grossSalary: employee.grossSalary,
      netPayable: employee.netPayable,
      carriedForwardAmount,
      suggestedProposedAmount,
      source: "attendance-system",
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// POST /api/payroll/parse-attendance - HR only. Lets the create-cycle form
// preview the computed deduction/proposed amount before the cycle is
// actually submitted, so HR can see the breakdown and adjust if needed.
router.post("/parse-attendance", requireRole("HR"), async (req, res) => {
  try {
    const { employeeId, month, attendanceFile, leaveFile } = req.body;
    if (!employeeId || !month || !attendanceFile) {
      return res.status(400).json({ message: "employeeId, month, and attendanceFile are required" });
    }

    const employee = await Employee.findById(employeeId);
    if (!employee || !canAccessCompany(req.user, employee.company)) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const { summary, deduction } = computeEntryAttendance({ month, employee, attendanceFile, leaveFile });
    const carriedForwardAmount = employee.pendingSalaryCarryForward || 0;
    const suggestedProposedAmount = Math.max(0, Math.round(employee.netPayable - deduction.totalDeduction)) + carriedForwardAmount;

    res.json({
      summary,
      deduction,
      grossSalary: employee.grossSalary,
      netPayable: employee.netPayable,
      carriedForwardAmount,
      suggestedProposedAmount,
      source: "file",
    });
  } catch (err) {
    // parseCheckInFile/parseLeaveFile throw plain, person-readable Errors
    // for bad files (missing Date column, unreadable dates, etc.) -
    // surface those as 400s rather than a generic 500.
    res.status(400).json({ message: err.message });
  }
});

// POST /api/payroll - HR only, creates + submits a cycle for one company/month
router.post("/", requireRole("HR"), async (req, res) => {
  try {
    const { companyId, month, entries } = req.body;
    if (!companyId || !month || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ message: "companyId, month, and at least one entry are required" });
    }

    // Re-parse any attached attendance files server-side rather than
    // trusting a client-submitted breakdown - the proposedAmount itself
    // stays whatever HR submitted (they may have adjusted it after seeing
    // the preview), but the stored attendanceSummary is always recomputed
    // from the actual files so reviewers downstream see an honest breakdown.
    const employeeIds = entries.map((e) => e.employee);
    const employees = await Employee.find({ _id: { $in: employeeIds } });
    const employeeById = new Map(employees.map((e) => [e._id.toString(), e]));

    const enrichedEntries = await Promise.all(entries.map(async (entry) => {
      const employee = employeeById.get(String(entry.employee));
      // Show the running balance from previous underpaid cycles on every
      // entry regardless of how attendance was sourced - this is purely
      // informational for reviewers, not something that gets recalculated.
      const carriedForwardAmount = employee?.pendingSalaryCarryForward || 0;

      if (entry.attendanceFile) {
        if (!employee) throw new Error("One of the selected employees could not be found");
        const { summary, deduction } = computeEntryAttendance({
          month, employee, attendanceFile: entry.attendanceFile, leaveFile: entry.leaveFile,
        });
        return { ...entry, attendanceSummary: { ...summary, ...deduction }, attendanceSource: "file", carriedForwardAmount };
      }

      if (entry.useAttendanceSystem) {
        if (!employee) throw new Error("One of the selected employees could not be found");
        const { summary, deduction } = await computeEntryAttendanceFromSheet({ month, employee });
        return { ...entry, attendanceSummary: { ...summary, ...deduction }, attendanceSource: "attendance-system", carriedForwardAmount };
      }

      return { ...entry, carriedForwardAmount };
    }));

    const cycle = await PayrollCycle.create({
      company: companyId,
      month,
      createdBy: req.user._id,
      entries: enrichedEntries,
      status: "Pending Finance Review",
    });

    await logAction({ entityType: "PayrollCycle", entityId: cycle._id, action: "submitted", performedBy: req.user._id });

    await cycle.populate(PAYROLL_POPULATE);
    res.status(201).json(cycle);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: "A payroll cycle for this company and month already exists" });
    // Bad attendance/leave file (unparseable / wrong columns) surfaces as a
    // 400 so HR fixes the file, instead of silently submitting a cycle
    // with no deduction applied.
    if (err.message && (err.message.includes("Could not read") || err.message.includes("must have") || err.message.includes("unreadable") || err.message.includes("no data rows") || err.message.includes("AttendanceSystem") || err.message.includes("Google Sheet") || err.message.includes("credentials"))) {
      return res.status(400).json({ message: err.message });
    }
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
});

// Shared stage-decision logic for stages that don't touch amounts
// (Accountant's mid-chain review - same atomic pattern as Offers).
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

// Validates a revisedAmounts map ({ [employeeId]: newAmount }) against a
// cycle's current entries: every key must match a real entry, and nobody
// can propose paying MORE than what was originally asked - this mechanism
// is for affordability reductions only, not raises.
function applyRevisions(entries, revisedAmounts, sourceField, baselineField) {
  const revisedIds = new Set(Object.keys(revisedAmounts || {}));
  const validIds = new Set(entries.map((e) => String(e.employee)));
  for (const id of revisedIds) {
    if (!validIds.has(id)) throw new Error("One of the revised amounts doesn't match an employee in this cycle");
  }

  let anyChanged = false;
  const updated = entries.map((entry) => {
    const employeeId = String(entry.employee);
    const baseline = entry[baselineField] ?? entry.proposedAmount;
    const revised = revisedAmounts?.[employeeId];
    const amount = revised !== undefined ? Number(revised) : baseline;

    if (revised !== undefined) {
      if (!Number.isFinite(amount) || amount < 0) {
        throw new Error(`Invalid revised amount for one of the entries`);
      }
      if (amount > entry.proposedAmount) {
        throw new Error(`A revised amount can't be more than what was originally proposed (${entry.proposedAmount})`);
      }
      if (amount !== entry.proposedAmount) anyChanged = true;
    }

    return { ...entry.toObject(), [sourceField]: amount };
  });

  return { updated, anyChanged };
}

// POST /api/payroll/:id/finance-decision - Finance only. Approves the
// cycle as-is, OR approves WITH a reduced amount for one or more entries
// (revisedAmounts: { [employeeId]: newAmount }) if the full ask can't be
// afforded, OR declines the whole cycle outright.
router.post("/:id/finance-decision", requireRole("Finance"), async (req, res) => {
  try {
    const { decision, reason, revisedAmounts } = req.body;
    const validDecisions = ["Approved", "Declined"];
    if (!validDecisions.includes(decision)) {
      return res.status(400).json({ message: `decision must be one of: ${validDecisions.join(", ")}` });
    }
    const hasRevisions = revisedAmounts && Object.keys(revisedAmounts).length > 0;
    if ((decision === "Declined" || hasRevisions) && !reason) {
      return res.status(400).json({ message: "A reason is required to decline or to propose a reduced amount" });
    }

    const cycle = await PayrollCycle.findOne({ _id: req.params.id, status: "Pending Finance Review" });
    if (!cycle) {
      return res.status(409).json({ message: "This cycle's status has already changed - refresh to see the current status" });
    }

    let nextStatus = "Declined";
    if (decision === "Approved") {
      let updated, anyChanged;
      try {
        ({ updated, anyChanged } = applyRevisions(cycle.entries, revisedAmounts, "financeApprovedAmount", "proposedAmount"));
      } catch (validationErr) {
        return res.status(400).json({ message: validationErr.message });
      }
      cycle.entries = updated;
      // A clean approval (no changes) follows the normal Finance -> Accountant
      // -> CEO order. A reduction skips straight to CEO, since a change to
      // what people get paid needs the CEO's judgment call before Accountant
      // ever sees it again.
      nextStatus = anyChanged ? "Pending CEO Review" : "Pending Accountant Review";
    }

    cycle.status = nextStatus;
    cycle.financeDecision = { by: req.user._id, at: new Date(), reason: reason || "" };
    await cycle.save();
    await cycle.populate(PAYROLL_POPULATE);

    await logAction({
      entityType: "PayrollCycle", entityId: cycle._id,
      action: decision === "Approved" ? (nextStatus === "Pending CEO Review" ? "finance_approved_with_reduction" : "approved_finance") : "declined_finance",
      performedBy: req.user._id, details: { reason: reason || null, revisedAmounts: revisedAmounts || null },
    });
    res.json(cycle);
  } catch (err) {
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
});

// POST /api/payroll/:id/accountant-decision - Accountant only. Mid-chain
// review, only reached via the normal (unreduced) path - doesn't touch
// amounts, same as before.
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

// POST /api/payroll/:id/ceo-decision - CEO only, final review. Reached
// either after Accountant's mid-chain approval (normal path) or directly
// after Finance proposes a reduction. CEO can accept whatever amount is
// currently on each entry (Finance's number, or the original if nothing
// was reduced), or substitute their own revisedAmounts, or decline.
router.post("/:id/ceo-decision", requireRole("CEO"), async (req, res) => {
  try {
    const { decision, reason, revisedAmounts } = req.body;
    const validDecisions = ["Approved", "Declined"];
    if (!validDecisions.includes(decision)) {
      return res.status(400).json({ message: `decision must be one of: ${validDecisions.join(", ")}` });
    }
    const hasRevisions = revisedAmounts && Object.keys(revisedAmounts).length > 0;
    if ((decision === "Declined" || hasRevisions) && !reason) {
      return res.status(400).json({ message: "A reason is required to decline or to propose a different amount" });
    }

    const cycle = await PayrollCycle.findOne({ _id: req.params.id, status: "Pending CEO Review" });
    if (!cycle) {
      return res.status(409).json({ message: "This cycle's status has already changed - refresh to see the current status" });
    }

    if (decision === "Approved") {
      // Baseline is whatever Finance already approved (or the original ask,
      // for cycles that reached CEO via the normal unreduced path) - CEO's
      // revisedAmounts, where given, override that baseline per entry.
      let updated;
      try {
        ({ updated } = applyRevisions(cycle.entries, revisedAmounts, "ceoApprovedAmount", "financeApprovedAmount"));
      } catch (validationErr) {
        return res.status(400).json({ message: validationErr.message });
      }
      cycle.entries = updated;
      cycle.status = "Approved";
    } else {
      cycle.status = "Declined";
    }
    cycle.ceoDecision = { by: req.user._id, at: new Date(), reason: reason || "" };
    await cycle.save();
    await cycle.populate(PAYROLL_POPULATE);

    await logAction({
      entityType: "PayrollCycle", entityId: cycle._id,
      action: decision === "Approved" ? (hasRevisions ? "ceo_approved_with_revision" : "approved_ceo") : "declined_ceo",
      performedBy: req.user._id, details: { reason: reason || null, revisedAmounts: revisedAmounts || null },
    });
    res.json(cycle);
  } catch (err) {
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
});

// POST /api/payroll/:id/mark-paid - Accountant only, final step of both
// paths. Records the actual disbursed amount per entry, computes any
// shortfall against what was originally proposed, and rolls that shortfall
// onto the employee as a carry-forward balance for their next cycle.
router.post("/:id/mark-paid", requireRole("Accountant"), async (req, res) => {
  try {
    const cycle = await PayrollCycle.findOne({ _id: req.params.id, status: "Approved" });
    if (!cycle) {
      return res.status(409).json({ message: "This cycle isn't ready to be marked paid - refresh to see the current status" });
    }

    const updatedEntries = [];
    for (const entry of cycle.entries) {
      const finalAmount = entry.ceoApprovedAmount ?? entry.financeApprovedAmount ?? entry.proposedAmount;
      const shortfall = Math.max(0, entry.proposedAmount - finalAmount);

      // The shortfall REPLACES (not adds to) the employee's running
      // balance - proposedAmount already included whatever was owed going
      // into this cycle, so this recomputation is the fresh, correct total.
      await Employee.findByIdAndUpdate(entry.employee, { pendingSalaryCarryForward: shortfall });

      updatedEntries.push({ ...entry.toObject(), paidAmount: finalAmount, shortfall });
    }

    cycle.entries = updatedEntries;
    cycle.status = "Paid";
    cycle.paidAt = new Date();
    cycle.paidBy = req.user._id;
    await cycle.save();
    await cycle.populate(PAYROLL_POPULATE);

    await logAction({ entityType: "PayrollCycle", entityId: cycle._id, action: "marked_paid", performedBy: req.user._id });
    res.json(cycle);
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
