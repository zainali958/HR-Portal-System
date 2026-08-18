// Run with: node scripts/backfillEmployeeSubmittedBy.js
//
// Fixes a gap for Employee records created before the "Employees list is
// scoped to who actually submitted them" restriction existed: those older
// documents were saved without a submittedBy field at all, so a Unit
// Manager who genuinely submitted (and can see) the Offer/Onboarding for
// that person doesn't see them in the Employees Registry, since that page
// filters on submittedBy specifically.
//
// Safe to re-run - only touches Employee documents where submittedBy is
// missing, and fills it in from the linked Onboarding record's
// submittedBy, which is the real source of truth for "who added this
// person" (Offers/Onboarding already display it correctly).

require("dotenv").config();
const connectDB = require("../config/db");
const Employee = require("../models/Employee");
const Onboarding = require("../models/Onboarding");

async function backfill() {
  await connectDB();

  const affected = await Employee.find({ submittedBy: { $exists: false } });
  console.log(`Found ${affected.length} Employee record(s) missing submittedBy.`);

  let fixed = 0;
  let skipped = 0;

  for (const employee of affected) {
    const onboarding = await Onboarding.findById(employee.onboarding);
    if (!onboarding || !onboarding.submittedBy) {
      console.log(`  Skipping ${employee.employeeName} (${employee._id}) - no linked Onboarding record with a submitter found. Fix this one manually.`);
      skipped += 1;
      continue;
    }

    employee.submittedBy = onboarding.submittedBy;
    // validateBeforeSave: false because some legacy records may be missing
    // other now-required fields too (e.g. fatherName/cnic on very old test
    // data) - this script's only job is fixing submittedBy, not enforcing
    // the full current schema on old rows.
    await employee.save({ validateBeforeSave: false });
    console.log(`  Fixed ${employee.employeeName} (${employee._id}) -> submittedBy = ${onboarding.submittedBy}`);
    fixed += 1;
  }

  console.log(`\nDone. Fixed ${fixed}, skipped ${skipped}.`);
  process.exit(0);
}

backfill().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
