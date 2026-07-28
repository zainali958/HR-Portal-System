const express = require("express");
const router = express.Router();
const Offer = require("../models/Offer");
const requireAuth = require("../middleware/auth");
const { requireRole, scopeFilter, canAccessCompany, requireAnyRole } = require("../middleware/permissions");
const { logAction } = require("../utils/auditLog");

router.use(requireAuth);

const OFFER_POPULATE = [
  { path: "company" },
  { path: "submittedBy", select: "fullName email" },
  { path: "decisionBy", select: "fullName email" },
  { path: "hrApproval.by", model: "User", select: "fullName email" },
  { path: "ceoApproval.by", model: "User", select: "fullName email" },
  { path: "comments.author", select: "fullName email" },
];

async function populateOffer(offer) {
  return offer.populate(OFFER_POPULATE);
}

// GET /api/offers
router.get("/", async (req, res) => {
  try {
    const filter = scopeFilter(req.user);
    if (req.query.status) filter.status = req.query.status;

    const offers = await Offer.find(filter).sort({ createdAt: -1 }).populate(OFFER_POPULATE);
    res.json(offers);
  } catch (err) {
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
});

// GET /api/offers/:id
router.get("/:id", async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id).populate(OFFER_POPULATE);
    if (!offer || !canAccessCompany(req.user, offer.company._id)) {
      return res.status(404).json({ message: "Offer not found" });
    }
    res.json(offer);
  } catch (err) {
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
});

// POST /api/offers - Team Lead submits, goes straight into HR's queue
router.post("/", async (req, res) => {
  try {
    if (!req.user.company) {
      return res.status(400).json({ message: "Only Team Leads (with an assigned company) can submit offers" });
    }
    if (req.user.company.isActive === false) {
      return res.status(403).json({ message: "Your company is currently inactive - contact HR" });
    }

    const {
      candidateName, candidateEmail, candidatePhone,
      employmentType, designation, timings, jobDescription, kpis,
      proposedSalary, submit,
    } = req.body;

    if (!candidateName || !employmentType || !designation || !jobDescription) {
      return res.status(400).json({ message: "candidateName, employmentType, designation and jobDescription are required" });
    }
    if (employmentType !== "Intern" && (proposedSalary === undefined || proposedSalary === null || proposedSalary === "")) {
      return res.status(400).json({ message: "proposedSalary is required for Employee offers" });
    }

    const offer = await Offer.create({
      company: req.user.company._id,
      submittedBy: req.user._id,
      candidateName, candidateEmail, candidatePhone,
      employmentType, designation, timings, jobDescription,
      kpis: Array.isArray(kpis) ? kpis.filter(Boolean) : [],
      proposedSalary: employmentType === "Intern" ? undefined : proposedSalary,
      status: submit ? "Pending HR Review" : "Draft",
    });

    if (submit) {
      await logAction({ entityType: "Offer", entityId: offer._id, action: "submitted", performedBy: req.user._id });
    }

    await populateOffer(offer);
    res.status(201).json(offer);
  } catch (err) {
    if (err.name === "ValidationError") return res.status(400).json({ message: err.message });
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
});

// POST /api/offers/:id/submit - move Draft into HR's queue
router.post("/:id/submit", async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id);
    if (!offer) return res.status(404).json({ message: "Offer not found" });
    if (offer.submittedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Only the Team Lead who submitted this offer can record the candidate's response" });
    }
    if (offer.status !== "Draft") {
      return res.status(400).json({ message: `Cannot submit an offer that is currently "${offer.status}"` });
    }

    offer.status = "Pending HR Review";
    await offer.save();
    await logAction({ entityType: "Offer", entityId: offer._id, action: "submitted", performedBy: req.user._id });

    await populateOffer(offer);
    res.json(offer);
  } catch (err) {
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
});

// PATCH /api/offers/:id - edit while Draft or Changes Requested. Resubmitting
// ALWAYS restarts at "Pending HR Review" - even if it was CEO who requested
// changes - so HR re-verifies before it goes back to CEO. Safer than
// skipping straight back to the CEO stage.
router.patch("/:id", async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id);
    if (!offer) return res.status(404).json({ message: "Offer not found" });
    if (offer.submittedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Only the person who created this offer can edit it" });
    }
    if (!["Draft", "Changes Requested"].includes(offer.status)) {
      return res.status(400).json({ message: `Cannot edit an offer that is currently "${offer.status}"` });
    }

    const editableFields = [
      "candidateName", "candidateEmail", "candidatePhone", "employmentType",
      "designation", "timings", "jobDescription", "kpis", "proposedSalary",
    ];
    const changes = [];
    for (const field of editableFields) {
      if (req.body[field] !== undefined && JSON.stringify(req.body[field]) !== JSON.stringify(offer[field])) {
        changes.push({ field, oldValue: offer[field], newValue: req.body[field] });
        offer[field] = req.body[field];
      }
    }
    if (offer.employmentType === "Intern") offer.proposedSalary = undefined;

    const wasChangesRequested = offer.status === "Changes Requested";
    if (wasChangesRequested && req.body.resubmit) {
      offer.status = "Pending HR Review";
      offer.hrApproval = {};
      offer.ceoApproval = {};
    }

    await offer.save();

    if (changes.length > 0) {
      await logAction({ entityType: "Offer", entityId: offer._id, action: "edited", performedBy: req.user._id, details: { changes } });
    }
    if (wasChangesRequested && req.body.resubmit) {
      await logAction({ entityType: "Offer", entityId: offer._id, action: "resubmitted", performedBy: req.user._id });
    }

    await populateOffer(offer);
    res.json(offer);
  } catch (err) {
    if (err.name === "ValidationError") return res.status(400).json({ message: err.message });
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
});

// Shared logic for both stage-decision routes below - only difference is
// which status it requires going in, which status it moves to on approval,
// and which stage-approval field it stamps.
async function makeStageDecision(req, res, { requiredStatus, approvedStatus, approvalField }) {
  const { decision, reason } = req.body;
  const validDecisions = ["Approved", "Declined", "Changes Requested"];
  if (!validDecisions.includes(decision)) {
    return res.status(400).json({ message: `decision must be one of: ${validDecisions.join(", ")}` });
  }
  if ((decision === "Declined" || decision === "Changes Requested") && !reason) {
    return res.status(400).json({ message: "A reason is required for Declined or Changes Requested" });
  }

  const existing = await Offer.findById(req.params.id);
  if (!existing) return res.status(404).json({ message: "Offer not found" });
  if (existing.submittedBy.toString() === req.user._id.toString()) {
    return res.status(403).json({ message: "You cannot approve your own submission" });
  }

  const newStatus = decision === "Approved" ? approvedStatus : decision;
  const update = {
    status: newStatus,
    decisionReason: reason || "",
    decisionBy: req.user._id,
    decisionAt: new Date(),
  };
  if (decision === "Approved") {
    // Dot-notation, not a nested object assignment - guarantees MongoDB
    // sets these two leaf fields directly with no subdocument-casting
    // ambiguity, which is what silently dropped "by" before.
    update[`${approvalField}.by`] = req.user._id;
    update[`${approvalField}.at`] = new Date();
  }
  if (reason) {
    update.$push = { comments: { author: req.user._id, message: reason } };
  }

  // Atomic: only succeeds if the offer is STILL at the exact stage this
  // route expects - prevents the same race condition fixed earlier, now
  // per-stage instead of one global "Pending".
  const offer = await Offer.findOneAndUpdate(
    { _id: req.params.id, status: requiredStatus },
    update,
    { new: true }
  ).populate(OFFER_POPULATE);

  if (!offer) {
    return res.status(409).json({ message: "This offer's status has already changed - refresh to see the current status" });
  }

  const actionMap = { Approved: "approved", Declined: "declined", "Changes Requested": "changes_requested" };
  await logAction({
    entityType: "Offer", entityId: offer._id, action: `${actionMap[decision]}_${approvalField.replace("Approval", "")}`,
    performedBy: req.user._id, details: { reason: reason || null },
  });

  res.json(offer);
}

// POST /api/offers/:id/hr-decision - HR-only, first stage
router.post("/:id/hr-decision", requireRole("HR"), async (req, res) => {
  try {
    await makeStageDecision(req, res, {
      requiredStatus: "Pending HR Review",
      approvedStatus: "Pending CEO Review",
      approvalField: "hrApproval",
    });
  } catch (err) {
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
});

// POST /api/offers/:id/ceo-decision - CEO-only, second stage. Approval here
// is what actually produces the offer letter (status becomes "Approved").
router.post("/:id/ceo-decision", requireRole("CEO"), async (req, res) => {
  try {
    await makeStageDecision(req, res, {
      requiredStatus: "Pending CEO Review",
      approvedStatus: "Approved",
      approvalField: "ceoApproval",
    });
  } catch (err) {
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
});

// POST /api/offers/:id/share - HR marks the offer letter as shared with
// the Team Lead. Separate explicit step, not automatic on CEO approval.
router.post("/:id/share", requireRole("HR"), async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id);
    if (!offer) return res.status(404).json({ message: "Offer not found" });
    if (offer.status !== "Approved") {
      return res.status(400).json({ message: "Only an Approved offer (with the letter generated) can be shared" });
    }

    offer.sharedWithTeamLead = true;
    offer.sharedAt = new Date();
    offer.letterGeneratedAt = offer.letterGeneratedAt || new Date();
    await offer.save();

    await logAction({ entityType: "Offer", entityId: offer._id, action: "shared_with_team_lead", performedBy: req.user._id });

    await populateOffer(offer);
    res.json(offer);
  } catch (err) {
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
});

// POST /api/offers/:id/comments
router.post("/:id/comments", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ message: "Comment message is required" });

    const offer = await Offer.findById(req.params.id);
    if (!offer) return res.status(404).json({ message: "Offer not found" });

    const isSubmitter = offer.submittedBy.toString() === req.user._id.toString();
    const canSee = canAccessCompany(req.user, offer.company);
    const canComment = ["HR", "CEO"].includes(req.user.role.name);
    if (!isSubmitter && !(canComment && canSee)) {
      return res.status(403).json({ message: "You don't have access to comment on this offer" });
    }

    offer.comments.push({ author: req.user._id, message: message.trim() });
    await offer.save();

    await logAction({ entityType: "Offer", entityId: offer._id, action: "commented", performedBy: req.user._id });

    await offer.populate("comments.author", "fullName email");
    res.status(201).json(offer.comments[offer.comments.length - 1]);
  } catch (err) {
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
});

// POST /api/offers/:id/candidate-response
router.post("/:id/candidate-response", async (req, res) => {
  try {
    const { response } = req.body;
    if (!["Accepted", "Declined"].includes(response)) {
      return res.status(400).json({ message: 'response must be "Accepted" or "Declined"' });
    }

    const offer = await Offer.findById(req.params.id);
    if (!offer) return res.status(404).json({ message: "Offer not found" });
    if (offer.status !== "Approved") {
      return res.status(400).json({ message: "Candidate response can only be recorded once the offer letter is Approved" });
    }
    if (offer.submittedBy.toString() !== req.user._id.toString() && !["HR", "CEO"].includes(req.user.role.name)) {
      return res.status(403).json({ message: "You don't have access to update this offer" });
    }

    offer.candidateResponse = response;
    await offer.save();

    await logAction({ entityType: "Offer", entityId: offer._id, action: "candidate_response", performedBy: req.user._id, details: { response } });

    await populateOffer(offer);
    res.json(offer);
  } catch (err) {
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
});

module.exports = router;