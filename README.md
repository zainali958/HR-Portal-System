# AmanorX HR Portal — Foundation (Step 1)

This is the first layer: **Companies, Roles, Users, and Auth.** The Offer
workflow, Onboarding, audit trail, letter generation, and Google Sheets sync
come next, once built on top of this foundation.

## What's built here

- **Companies** stored in the database, not hardcoded — adding company #15
  is a data change (`POST /api/companies`), never a code change.
- **Roles** (HR, COO, CEO, Unit Manager) stored as data with permission
  flags (`canApprove`, `canCreateUsers`, `canViewAllCompanies`,
  `canManageCompanies`) — business logic checks these flags, never a
  hardcoded `if (role === "HR")`.
- **Users** — one login per person, created only by HR (no public sign-up
  anywhere). Passwords are bcrypt-hashed, never stored in plain text.
- **Auth + scoping** — JWT login, and a `scopeFilter()` / `canAccessCompany()`
  helper (`middleware/permissions.js`) that any future route must use to
  enforce "Unit Managers only see their own company" **on the server**, not
  by hiding UI buttons.

## Run it

```bash
cd backend
npm install
cp .env.example .env
```

Fill in `.env`: `MONGO_URI` (e.g. `mongodb://localhost:27017/amanorx-hr-portal`),
and a `JWT_SECRET` (generate with
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).

**Seed the starting data** (roles, placeholder companies, one HR test login):
```bash
npm run seed
```
This prints an HR test login (`hr@amanorx.test` / `ChangeMe123!`) — change
that password before this goes anywhere near real use.

**Start the server:**
```bash
npm run dev
```

Test the login:
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"hr@amanorx.test","password":"ChangeMe123!"}'
```
You should get back a token and user info with `role: "HR"`.

## Reminder — use only test data

Per Shafaat's brief: **no real CNICs, no real bank accounts, no real
salaries — not even your own** — while this is being built and tested.

## Still to build (in order)

1. Offer model + workflow (submit, approve/decline/request-changes, comment
   thread, letter generation)
2. Onboarding model (unlocked only after offer approved + accepted)
3. Audit log (who did what, when, old value → new value)
4. Google Sheets sync via Apps Script (shared-secret protected)
5. Frontend for all of the above, with company/role-based views
