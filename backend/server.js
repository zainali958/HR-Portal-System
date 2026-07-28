require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const connectDB = require("./config/db");

// Explicitly register every model before anything uses .populate() on it.
// Without this, a model only gets registered with Mongoose the first time
// its own file is require()'d somewhere - and populate("role") / populate
// ("company") need Role and Company registered even though routes/auth.js
// never directly requires those files itself.
require("./models/Role");
require("./models/Company");
require("./models/User");
require("./models/Offer");
require("./models/AuditLog");
require("./models/Onboarding");
require("./models/Employee");
require("./models/PayrollCycle");

const authRoutes = require("./routes/auth");
const companyRoutes = require("./routes/companies");
const userRoutes = require("./routes/users");
const offerRoutes = require("./routes/offers");
const onboardingRoutes = require("./routes/onboarding");
const employeeRoutes = require("./routes/employees");
const payrollRoutes = require("./routes/payroll");

const app = express();

app.use(helmet());

// CORS locked to an explicit allow-list, not wide open - same pattern as
// the Prepreneurship portal.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim());
app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://hr-portal-system-48q3.vercel.app"
  ],
  credentials: true
}));

app.use(express.json());

// Rate limit login attempts specifically - brute-force protection on the
// single most sensitive route in the app.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: "Too many login attempts, please try again later" },
});
app.use("/api/auth/login", loginLimiter);

app.use("/api/auth", authRoutes);
app.use("/api/companies", companyRoutes);
app.use("/api/users", userRoutes);
app.use("/api/offers", offerRoutes);
app.use("/api/onboarding", onboardingRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/payroll", payrollRoutes);

app.get("/", (req, res) => {
  res.json({ status: "AmanorX HR Portal API is running" });
});

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});