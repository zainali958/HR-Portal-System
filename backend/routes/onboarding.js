const express = require("express");
const router = express.Router();
const Onboarding = require("../models/Onboarding");
const Offer = require("../models/Offer");
const Company = require("../models/Company");
const Employee = require("../models/Employee");
const requireAuth = require("../middleware/auth");
const { requirePermission, scopeFilter, canAccessCompany, requireRole } = require("../middleware/permissions");
const { logAction } = require("../utils/auditLog");
const { generateOfferLetterBuffer } = require("../utils/generateOfferLetter");

router.use(requireAuth);

const ONBOARDING_POPULATE = [
  { path: "company" },
  { path: "offer" },
  { path: "submittedBy", select: "fullName email" },
  { path: "decisionBy", select: "fullName email" },
  { path: "bankAccountantDecision.by", model: "User", select: "fullName email" },
  { path: "bankFinanceDecision.by", model: "User", select: "fullName email" },
  { path: "comments.author", select: "fullName email" },
];

// Recomputes bankDetailsStatus from the two independent decisions - either
// approver can act first, order doesn't matter. A Decline or Changes
// Requested from EITHER side overrides the other; both must say Approved
// for it to actually clear. Declared at module scope (not inside a route
// handler) so every route below can call it.
function recomputeBankDetailsStatus(record) {
  const a = record.bankAccountantDecision?.decision;
  const f = record.bankFinanceDecision?.decision;

  if (a === "Declined" || f === "Declined") {
    record.bankDetailsStatus = "Declined";
  } else if (a === "Changes Requested" || f === "Changes Requested") {
    record.bankDetailsStatus = "Changes Requested";
  } else if (a === "Approved" && f === "Approved") {
    record.bankDetailsStatus = "Approved";
  } else {
    record.bankDetailsStatus = "Pending";
  }
}

// GET /api/onboarding
router.get("/", async (req, res) => {
  try {
    const filter = scopeFilter(req.user);
    if (req.query.status) filter.status = req.query.status;

    const records = await Onboarding.find(filter).sort({ createdAt: -1 }).populate(ONBOARDING_POPULATE);
    res.json(records);
  } catch (err) {
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
});

// GET /api/onboarding/:id
router.get("/:id", async (req, res) => {
  try {
    const record = await Onboarding.findById(req.params.id).populate(ONBOARDING_POPULATE);
    if (!record || !canAccessCompany(req.user, record.company._id)) {
      return res.status(404).json({ message: "Onboarding record not found" });
    }
    res.json(record);
  } catch (err) {
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
});

// POST /api/onboarding
router.post("/", async (req, res) => {
  try {
    const {
      offerId, employeeName, fatherName, cnic, contactNumber, reportsTo,
      employmentType, dateOfJoining, employmentStatus, jdOnFile,
      basicSalary, houseRentAllowance, medicalAllowance, conveyanceAllowance, otherAllowance,
      incomeTaxDeduction, eobiDeduction, otherDeduction,
      bankName, accountTitle, accountNumber, notes, submit,
    } = req.body;

    if (!offerId) return res.status(400).json({ message: "offerId is required" });

    const offer = await Offer.findById(offerId);
    if (!offer) return res.status(404).json({ message: "Offer not found" });

    if (offer.submittedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Only the person who submitted this offer can start onboarding for it" });
    }
    if (offer.status !== "Approved" || offer.candidateResponse !== "Accepted") {
      return res.status(400).json({ message: "Onboarding can only start once the offer is Approved and the candidate has Accepted" });
    }

    const existing = await Onboarding.findOne({ offer: offerId });
    if (existing) {
      return res.status(409).json({ message: "An onboarding record already exists for this offer" });
    }

    if (!employeeName || !fatherName || !cnic || !reportsTo || !employmentType || !dateOfJoining) {
      return res.status(400).json({ message: "employeeName, fatherName, cnic, reportsTo, employmentType and dateOfJoining are required" });
    }
    if (employmentType !== "Intern" && !basicSalary) {
      return res.status(400).json({ message: "basicSalary is required for Full-Time/Part-Time employees" });
    }

    const company = await Company.findById(offer.company);

    const record = await Onboarding.create({
      offer: offerId,
      company: offer.company,
      submittedBy: req.user._id,
      employerOfRecord: company ? company.legalEmployerName : "",
      employeeName, fatherName, cnic, contactNumber, reportsTo,
      employmentType, dateOfJoining, employmentStatus, jdOnFile,
      basicSalary, houseRentAllowance, medicalAllowance, conveyanceAllowance, otherAllowance,
      incomeTaxDeduction, eobiDeduction, otherDeduction,
      bankName, accountTitle, accountNumber, notes,
      status: submit ? "Pending" : "Draft",
    });

    if (submit) {
      await logAction({ entityType: "Onboarding", entityId: record._id, action: "submitted", performedBy: req.user._id });
    }

    await record.populate(ONBOARDING_POPULATE);
    res.status(201).json(record);
  } catch (err) {
    if (err.name === "ValidationError") return res.status(400).json({ message: err.message });
    if (err.code === 11000) return res.status(409).json({ message: "An onboarding record already exists for this offer" });
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
});

// POST /api/onboarding/:id/submit
router.post("/:id/submit", async (req, res) => {
  try {
    const record = await Onboarding.findById(req.params.id);
    if (!record) return res.status(404).json({ message: "Onboarding record not found" });
    if (record.submittedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Only the person who created this record can submit it" });
    }
    if (record.status !== "Draft") {
      return res.status(400).json({ message: `Cannot submit a record that is currently "${record.status}"` });
    }

    record.status = "Pending";
    await record.save();
    await logAction({ entityType: "Onboarding", entityId: record._id, action: "submitted", performedBy: req.user._id });

    await record.populate(ONBOARDING_POPULATE);
    res.json(record);
  } catch (err) {
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
});

// PATCH /api/onboarding/:id
router.patch("/:id", async (req, res) => {
  try {
    const record = await Onboarding.findById(req.params.id);
    if (!record) return res.status(404).json({ message: "Onboarding record not found" });
    if (record.submittedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Only the person who created this record can edit it" });
    }
    if (!["Draft", "Changes Requested"].includes(record.status)) {
      return res.status(400).json({ message: `Cannot edit a record that is currently "${record.status}"` });
    }

    const editableFields = [
      "employeeName", "fatherName", "cnic", "contactNumber", "reportsTo",
      "employmentType", "dateOfJoining", "employmentStatus", "jdOnFile",
      "basicSalary", "houseRentAllowance", "medicalAllowance", "conveyanceAllowance", "otherAllowance",
      "incomeTaxDeduction", "eobiDeduction", "otherDeduction",
      "bankName", "accountTitle", "accountNumber", "notes",
    ];

    const changes = [];
    for (const field of editableFields) {
      if (req.body[field] !== undefined && JSON.stringify(req.body[field]) !== JSON.stringify(record[field])) {
        changes.push({ field, oldValue: record[field], newValue: req.body[field] });
        record[field] = req.body[field];
      }
    }

    const wasChangesRequested = record.status === "Changes Requested";
    if (wasChangesRequested && req.body.resubmit) {
      record.status = "Pending";
    }

    await record.save();

    if (changes.length > 0) {
      await logAction({ entityType: "Onboarding", entityId: record._id, action: "edited", performedBy: req.user._id, details: { changes } });
    }
    if (wasChangesRequested && req.body.resubmit) {
      await logAction({ entityType: "Onboarding", entityId: record._id, action: "resubmitted", performedBy: req.user._id });
    }

    await record.populate(ONBOARDING_POPULATE);
    res.json(record);
  } catch (err) {
    if (err.name === "ValidationError") return res.status(400).json({ message: err.message });
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
});

// POST /api/onboarding/:id/decision
router.post("/:id/decision", requirePermission("canApprove"), async (req, res) => {
  try {
    const { decision, reason } = req.body;
    const validDecisions = ["Approved", "Declined", "Changes Requested"];
    if (!validDecisions.includes(decision)) {
      return res.status(400).json({ message: `decision must be one of: ${validDecisions.join(", ")}` });
    }
    if ((decision === "Declined" || decision === "Changes Requested") && !reason) {
      return res.status(400).json({ message: "A reason is required for Declined or Changes Requested" });
    }

    const existing = await Onboarding.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: "Onboarding record not found" });
    if (existing.submittedBy.toString() === req.user._id.toString()) {
      return res.status(403).json({ message: "You cannot approve your own submission" });
    }

    const update = {
      status: decision,
      decisionReason: reason || "",
      decisionBy: req.user._id,
      decisionAt: new Date(),
    };
    if (reason) {
      update.$push = { comments: { author: req.user._id, message: reason } };
    }

    const record = await Onboarding.findOneAndUpdate(
      { _id: req.params.id, status: "Pending" },
      update,
      { new: true }
    ).populate(ONBOARDING_POPULATE);

    if (!record) {
      return res.status(409).json({ message: "This record was already decided on by someone else - refresh to see the current status" });
    }

    // Approving the overall record opens the separate bank-details gate -
    // Accountant and Finance can now independently review it.
    if (decision === "Approved" && record.bankDetailsStatus === "Not Started") {
      record.bankDetailsStatus = "Pending";
      await record.save();
    }

    // Auto-create the permanent Employee record once Approved - carries
    // over the full payroll breakdown, not just a flat salary number.
    if (decision === "Approved") {
      const alreadyExists = await Employee.findOne({ onboarding: record._id });
      if (!alreadyExists) {
        await Employee.create({
          onboarding: record._id,
          offer: record.offer._id,
          company: record.company._id,
          employerOfRecord: record.employerOfRecord,
          employeeName: record.employeeName,
          fatherName: record.fatherName,
          cnic: record.cnic,
          contactNumber: record.contactNumber,
          designation: record.offer.designation,
          reportsTo: record.reportsTo,
          employmentType: record.employmentType,
          dateOfJoining: record.dateOfJoining,
          employmentStatus: record.employmentStatus,
          jdOnFile: record.jdOnFile,
          basicSalary: record.basicSalary,
          houseRentAllowance: record.houseRentAllowance,
          medicalAllowance: record.medicalAllowance,
          conveyanceAllowance: record.conveyanceAllowance,
          otherAllowance: record.otherAllowance,
          incomeTaxDeduction: record.incomeTaxDeduction,
          eobiDeduction: record.eobiDeduction,
          otherDeduction: record.otherDeduction,
          bankName: record.bankName,
          accountTitle: record.accountTitle,
          accountNumber: record.accountNumber,
          notes: record.notes,
        });
      }
    }

    const actionMap = { Approved: "approved", Declined: "declined", "Changes Requested": "changes_requested" };
    await logAction({ entityType: "Onboarding", entityId: record._id, action: actionMap[decision], performedBy: req.user._id, details: { reason: reason || null } });

    res.json(record);
  } catch (err) {
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
});

// POST /api/onboarding/:id/comments
router.post("/:id/comments", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ message: "Comment message is required" });

    const record = await Onboarding.findById(req.params.id);
    if (!record) return res.status(404).json({ message: "Onboarding record not found" });

    const isSubmitter = record.submittedBy.toString() === req.user._id.toString();
    const canSee = canAccessCompany(req.user, record.company);
    if (!isSubmitter && !(req.user.role.canApprove && canSee)) {
      return res.status(403).json({ message: "You don't have access to comment on this record" });
    }

    record.comments.push({ author: req.user._id, message: message.trim() });
    await record.save();

    await logAction({ entityType: "Onboarding", entityId: record._id, action: "commented", performedBy: req.user._id });

    await record.populate("comments.author", "fullName email");
    res.status(201).json(record.comments[record.comments.length - 1]);
  } catch (err) {
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
});

// GET /api/onboarding/:id/letter - generates and downloads the offer letter
// as a .docx, using the shared template with this record's real data.
// Available to HR, CEO, or the Team Lead who submitted it.
router.get("/:id/letter", async (req, res) => {
  try {
    const record = await Onboarding.findById(req.params.id).populate("company").populate("offer");
    if (!record) return res.status(404).json({ message: "Onboarding record not found" });

    const isSubmitter = record.submittedBy.toString() === req.user._id.toString();
    const isHRorCEO = ["HR", "CEO"].includes(req.user.role.name);
    if (!isSubmitter && !isHRorCEO) {
      return res.status(403).json({ message: "You don't have access to this letter" });
    }

    const buffer = await generateOfferLetterBuffer({
      company: record.company,
      offer: record.offer,
      onboarding: record,
    });

    const filename = `${record.employeeName.replace(/\s+/g, "_")}_${record.employmentType}_Letter.docx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ message: "Failed to generate letter", error: err.message });
  }
});

// POST /api/onboarding/:id/accountant-bank-decision - Accountant only,
// independent of Finance's decision below.
router.post("/:id/accountant-bank-decision", requireRole("Accountant"), async (req, res) => {
  try {
    const { decision, reason } = req.body;
    const validDecisions = ["Approved", "Declined", "Changes Requested"];
    if (!validDecisions.includes(decision)) {
      return res.status(400).json({ message: `decision must be one of: ${validDecisions.join(", ")}` });
    }
    if (decision !== "Approved" && !reason) {
      return res.status(400).json({ message: "A reason is required for Declined or Changes Requested" });
    }

    const record = await Onboarding.findById(req.params.id);
    if (!record) return res.status(404).json({ message: "Onboarding record not found" });
    if (record.bankDetailsStatus === "Not Started") {
      return res.status(400).json({ message: "Bank details can't be reviewed until the onboarding record itself is Approved" });
    }

    record.bankAccountantDecision = { decision, by: req.user._id, at: new Date(), reason: reason || "" };
    recomputeBankDetailsStatus(record);
    await record.save();

    await logAction({
      entityType: "Onboarding", entityId: record._id, action: `bank_accountant_${decision.toLowerCase().replace(" ", "_")}`,
      performedBy: req.user._id, details: { reason: reason || null },
    });

    await record.populate(ONBOARDING_POPULATE);
    res.json(record);
  } catch (err) {
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
});

// POST /api/onboarding/:id/finance-bank-decision - Finance only, independent
// of Accountant's decision above.
router.post("/:id/finance-bank-decision", requireRole("Finance"), async (req, res) => {
  try {
    const { decision, reason } = req.body;
    const validDecisions = ["Approved", "Declined", "Changes Requested"];
    if (!validDecisions.includes(decision)) {
      return res.status(400).json({ message: `decision must be one of: ${validDecisions.join(", ")}` });
    }
    if (decision !== "Approved" && !reason) {
      return res.status(400).json({ message: "A reason is required for Declined or Changes Requested" });
    }

    const record = await Onboarding.findById(req.params.id);
    if (!record) return res.status(404).json({ message: "Onboarding record not found" });
    if (record.bankDetailsStatus === "Not Started") {
      return res.status(400).json({ message: "Bank details can't be reviewed until the onboarding record itself is Approved" });
    }

    record.bankFinanceDecision = { decision, by: req.user._id, at: new Date(), reason: reason || "" };
    recomputeBankDetailsStatus(record);
    await record.save();

    await logAction({
      entityType: "Onboarding", entityId: record._id, action: `bank_finance_${decision.toLowerCase().replace(" ", "_")}`,
      performedBy: req.user._id, details: { reason: reason || null },
    });

    await record.populate(ONBOARDING_POPULATE);
    res.json(record);
  } catch (err) {
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
});

// PATCH /api/onboarding/:id/bank-details - Team Lead edits just the bank
// fields after a Decline/Changes Requested, then resubmits - resets both
// decisions back to Pending so Accountant and Finance re-review fresh.
router.patch("/:id/bank-details", async (req, res) => {
  try {
    const record = await Onboarding.findById(req.params.id);
    if (!record) return res.status(404).json({ message: "Onboarding record not found" });
    if (record.submittedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Only the person who created this record can edit its bank details" });
    }
    if (!["Declined", "Changes Requested"].includes(record.bankDetailsStatus)) {
      return res.status(400).json({ message: `Cannot edit bank details while status is "${record.bankDetailsStatus}"` });
    }

    const { bankName, accountTitle, accountNumber } = req.body;
    if (bankName !== undefined) record.bankName = bankName;
    if (accountTitle !== undefined) record.accountTitle = accountTitle;
    if (accountNumber !== undefined) record.accountNumber = accountNumber;

    record.bankAccountantDecision = { decision: null, by: null, at: null, reason: "" };
    record.bankFinanceDecision = { decision: null, by: null, at: null, reason: "" };
    record.bankDetailsStatus = "Pending";

    await record.save();

    await logAction({ entityType: "Onboarding", entityId: record._id, action: "bank_details_resubmitted", performedBy: req.user._id });

    await record.populate(ONBOARDING_POPULATE);
    res.json(record);
  } catch (err) {
    if (err.name === "ValidationError") return res.status(400).json({ message: err.message });
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
});

module.exports = router;