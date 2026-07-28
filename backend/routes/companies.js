const express = require("express");
const router = express.Router();
const Company = require("../models/Company");
const requireAuth = require("../middleware/auth");
const { requirePermission } = require("../middleware/permissions");

router.use(requireAuth); // every route below requires a logged-in user

// GET /api/companies - any logged-in user can see the list (needed for
// dropdowns, e.g. HR picking which company a new Unit Manager belongs to).
router.get("/", async (req, res) => {
  try {
    const companies = await Company.find({ isActive: true }).sort({ name: 1 });
    res.json(companies);
  } catch (err) {
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
});

// POST /api/companies - add a new company. This is the "no code change
// needed" mechanism Shafaat asked for: adding company #15 is just this.
router.post("/", requirePermission("canManageCompanies"), async (req, res) => {
  try {
    const { name, sheetTabName } = req.body;
    if (!name) return res.status(400).json({ message: "Company name is required" });

    const company = await Company.create({ name, sheetTabName: sheetTabName || name });
    res.status(201).json(company);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "A company with this name already exists" });
    }
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
});

// PATCH /api/companies/:id - edit a company, or deactivate it (soft delete -
// we never hard-delete a company since offers/employees reference it).
router.patch("/:id", requirePermission("canManageCompanies"), async (req, res) => {
  try {
    const { name, sheetTabName, isActive } = req.body;
    const company = await Company.findByIdAndUpdate(
      req.params.id,
      { ...(name && { name }), ...(sheetTabName && { sheetTabName }), ...(isActive !== undefined && { isActive }) },
      { new: true, runValidators: true }
    );
    if (!company) return res.status(404).json({ message: "Company not found" });
    res.json(company);
  } catch (err) {
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
});

module.exports = router;