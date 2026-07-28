const express = require("express");
const bcrypt = require("bcryptjs");
const router = express.Router();
const User = require("../models/User");
const requireAuth = require("../middleware/auth");
const { requirePermission } = require("../middleware/permissions");

router.use(requireAuth);
router.use(requirePermission("canCreateUsers")); // HR-only for all routes below

// GET /api/users - HR sees every account, to manage the group's logins
router.get("/", async (req, res) => {
  try {
    const users = await User.find().populate("role").populate("company").sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
});

// POST /api/users - create a new login. Password is hashed here, never
// stored or logged in plain text.
router.post("/", async (req, res) => {
  try {
    const { fullName, email, password, roleId, companyId } = req.body;

    if (!fullName || !email || !password || !roleId) {
      return res.status(400).json({ message: "fullName, email, password and roleId are required" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      fullName,
      email,
      passwordHash,
      role: roleId,
      company: companyId || null,
    });

    const populated = await user.populate(["role", "company"]);
    res.status(201).json({
      id: populated._id,
      fullName: populated.fullName,
      email: populated.email,
      role: populated.role.name,
      company: populated.company ? populated.company.name : null,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "An account with this email already exists" });
    }
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
});

// PATCH /api/users/:id - deactivate an account (someone leaves the group).
// We never delete users - historical audit log entries need their name.
router.patch("/:id", async (req, res) => {
  try {
    const { isActive, roleId, companyId } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      {
        ...(isActive !== undefined && { isActive }),
        ...(roleId && { role: roleId }),
        ...(companyId !== undefined && { company: companyId || null }),
      },
      { new: true }
    ).populate(["role", "company"]);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
});

module.exports = router;