import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { getOffer } from "../api/offers";
import { createOnboarding } from "../api/onboarding";
import { getCompanies } from "../api/companies";
import { useAuth } from "../context/AuthContext";

export default function OnboardingFormPage() {
  const [searchParams] = useSearchParams();
  const offerId = searchParams.get("offerId");
  const isExistingEmployee = !offerId;
  const navigate = useNavigate();
  const { user, isHR, isCEO } = useAuth();
  const canPickCompany = isHR || isCEO; // Unit Managers are locked to their own company

  const [offer, setOffer] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState("");
  const [designation, setDesignation] = useState("");
  const [loadError, setLoadError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    employeeName: "",
    fatherName: "",
    cnic: "",
    contactNumber: "",
    reportsTo: "",
    employmentType: "Full-Time",
    dateOfJoining: "",
    employmentStatus: "Active",
    jdOnFile: false,
    basicSalary: "",
    houseRentAllowance: "",
    medicalAllowance: "",
    conveyanceAllowance: "",
    otherAllowance: "",
    incomeTaxDeduction: "",
    eobiDeduction: "",
    otherDeduction: "",
    bankName: "",
    accountTitle: "",
    accountNumber: "",
    notes: "",
  });

  useEffect(() => {
    if (!isExistingEmployee) {
      getOffer(offerId)
        .then((data) => {
          setOffer(data);
          // An Offer's employmentType is only "Employee" or "Intern" - if it
          // was an Intern offer, lock Onboarding's employmentType to Intern
          // too. Otherwise default to Full-Time, but the Unit Manager can
          // still pick Part-Time.
          setForm((prev) => ({
            ...prev,
            employeeName: data.candidateName,
            contactNumber: data.candidatePhone || "",
            employmentType: data.employmentType === "Intern" ? "Intern" : "Full-Time",
          }));
        })
        .catch(() => setLoadError("Could not load the linked offer."));
      return;
    }

    // Existing-employee path - HR/CEO need a company to pick from; a Unit
    // Manager is locked to their own, so no need to fetch the full list.
    if (canPickCompany) {
      getCompanies()
        .then(setCompanies)
        .catch(() => setLoadError("Failed to load companies"));
    }
  }, [offerId, isExistingEmployee, canPickCompany]);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  const cnicPattern = /^\d{5}-\d{7}-\d$/;
  const isIntern = form.employmentType === "Intern";
  const offerIsIntern = offer && offer.employmentType === "Intern";

  // Live preview of the sheet's own formula columns, so the Unit Manager
  // sees Gross/Total Deductions/Net Payable before submitting - matches
  // exactly what the backend will compute and store.
  const num = (v) => Number(v) || 0;
  const grossSalary = isIntern
    ? 0
    : num(form.basicSalary) + num(form.houseRentAllowance) + num(form.medicalAllowance) +
      num(form.conveyanceAllowance) + num(form.otherAllowance);
  const totalDeductions = isIntern
    ? 0
    : num(form.incomeTaxDeduction) + num(form.eobiDeduction) + num(form.otherDeduction);
  const netPayable = grossSalary - totalDeductions;

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitError("");

    if (!cnicPattern.test(form.cnic)) {
      setSubmitError("CNIC must be in the format 00000-0000000-0");
      return;
    }
    if (!isIntern && !form.basicSalary) {
      setSubmitError("Basic Salary is required for Full-Time/Part-Time employees");
      return;
    }
    if (isExistingEmployee) {
      if (!designation.trim()) {
        setSubmitError("Designation is required");
        return;
      }
      if (canPickCompany && !companyId) {
        setSubmitError("Company is required");
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        ...(isExistingEmployee
          ? { designation: designation.trim(), ...(canPickCompany ? { companyId } : {}) }
          : { offerId }),
        employeeName: form.employeeName,
        fatherName: form.fatherName,
        cnic: form.cnic,
        contactNumber: form.contactNumber,
        reportsTo: form.reportsTo,
        employmentType: form.employmentType,
        dateOfJoining: form.dateOfJoining,
        employmentStatus: form.employmentStatus,
        jdOnFile: form.jdOnFile,
        notes: form.notes,
        submit: true,
        ...(isIntern
          ? {}
          : {
              basicSalary: num(form.basicSalary),
              houseRentAllowance: num(form.houseRentAllowance),
              medicalAllowance: num(form.medicalAllowance),
              conveyanceAllowance: num(form.conveyanceAllowance),
              otherAllowance: num(form.otherAllowance),
              incomeTaxDeduction: num(form.incomeTaxDeduction),
              eobiDeduction: num(form.eobiDeduction),
              otherDeduction: num(form.otherDeduction),
              bankName: form.bankName,
              accountTitle: form.accountTitle,
              accountNumber: form.accountNumber,
            }),
      };
      const record = await createOnboarding(payload);
      navigate(`/onboarding/${record._id}`);
    } catch (err) {
      const message = err.response && err.response.data && err.response.data.message
        ? err.response.data.message
        : "Failed to save onboarding record";
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) return <div className="page-content"><p className="msg error">{loadError}</p></div>;

  return (
    <div className="page-content">
      <p className="eyebrow">Onboarding</p>
      {isExistingEmployee ? (
        <>
          <h1>Add Existing Employee</h1>
          <p className="muted">
            For staff who already work here but never went through the Offer pipeline in this system.
          </p>
        </>
      ) : (
        <>
          <h1>Onboard {offer ? offer.candidateName : "Candidate"}</h1>
          {offer && (
            <p className="muted">
              {offer.company ? offer.company.name : ""} — {offer.designation}
            </p>
          )}
        </>
      )}

      <form onSubmit={handleSubmit} className="card">
        {isExistingEmployee && (
          <>
            <h3>Role</h3>
            {canPickCompany ? (
              <label>
                Company
                <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} required>
                  <option value="">Select a company...</option>
                  {companies.map((c) => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))}
                </select>
              </label>
            ) : (
              <label>
                Company
                <input value={user?.company || ""} disabled />
              </label>
            )}
            <label>
              Designation
              <input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Senior Software Engineer" required />
            </label>
          </>
        )}

        <h3>Personal Details</h3>
        <label>
          Full Name
          <input value={form.employeeName} onChange={(e) => updateField("employeeName", e.target.value)} required />
        </label>
        <label>
          Father's Name
          <input value={form.fatherName} onChange={(e) => updateField("fatherName", e.target.value)} required />
        </label>
        <label>
          CNIC <span className="optional">(format: 00000-0000000-0)</span>
          <input
            value={form.cnic}
            onChange={(e) => updateField("cnic", e.target.value)}
            placeholder="12345-1234567-1"
            required
          />
        </label>
        <label>
          Contact Number
          <input value={form.contactNumber} onChange={(e) => updateField("contactNumber", e.target.value)} placeholder="0300-0000000" />
        </label>

        <h3>Employment Details</h3>
        <label>
          Reports To
          <input value={form.reportsTo} onChange={(e) => updateField("reportsTo", e.target.value)} placeholder="e.g. COO, Team Lead name" required />
        </label>
        <label>
          Employment Type
          <select
            value={form.employmentType}
            onChange={(e) => updateField("employmentType", e.target.value)}
            disabled={offerIsIntern}
          >
            <option value="Full-Time">Full-Time</option>
            <option value="Part-Time">Part-Time</option>
            <option value="Intern">Intern</option>
          </select>
        </label>
        {offerIsIntern && (
          <p className="muted" style={{ marginTop: "-0.6rem" }}>
            Locked to Intern - the linked offer was submitted as an internship.
          </p>
        )}
        <label>
          Date of Joining
          <input type="date" value={form.dateOfJoining} onChange={(e) => updateField("dateOfJoining", e.target.value)} required />
        </label>
        <label>
          Employment Status
          <select value={form.employmentStatus} onChange={(e) => updateField("employmentStatus", e.target.value)}>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </label>
        <label className="checkbox-label">
          <input type="checkbox" checked={form.jdOnFile} onChange={(e) => updateField("jdOnFile", e.target.checked)} />
          Job Description is on file
        </label>

        {isIntern ? (
          <p className="muted">This is an internship - no salary, deductions, or bank details are collected.</p>
        ) : (
          <>
            <h3>Salary Breakdown</h3>
            <label>
              Basic Salary
              <input type="number" value={form.basicSalary} onChange={(e) => updateField("basicSalary", e.target.value)} min="0" required />
            </label>
            <label>
              House Rent Allowance
              <input type="number" value={form.houseRentAllowance} onChange={(e) => updateField("houseRentAllowance", e.target.value)} min="0" />
            </label>
            <label>
              Medical Allowance
              <input type="number" value={form.medicalAllowance} onChange={(e) => updateField("medicalAllowance", e.target.value)} min="0" />
            </label>
            <label>
              Conveyance Allowance
              <input type="number" value={form.conveyanceAllowance} onChange={(e) => updateField("conveyanceAllowance", e.target.value)} min="0" />
            </label>
            <label>
              Other Allowance
              <input type="number" value={form.otherAllowance} onChange={(e) => updateField("otherAllowance", e.target.value)} min="0" />
            </label>

            <h3>Deductions</h3>
            <label>
              Income Tax Deduction
              <input type="number" value={form.incomeTaxDeduction} onChange={(e) => updateField("incomeTaxDeduction", e.target.value)} min="0" />
            </label>
            <label>
              EOBI Deduction
              <input type="number" value={form.eobiDeduction} onChange={(e) => updateField("eobiDeduction", e.target.value)} min="0" />
            </label>
            <label>
              Other Deduction
              <input type="number" value={form.otherDeduction} onChange={(e) => updateField("otherDeduction", e.target.value)} min="0" />
            </label>

            <div className="calc-summary">
              <div><span>Gross Salary</span><strong>{grossSalary.toLocaleString()}</strong></div>
              <div><span>Total Deductions</span><strong>{totalDeductions.toLocaleString()}</strong></div>
              <div><span>Net Payable</span><strong>{netPayable.toLocaleString()}</strong></div>
            </div>

            <h3>Bank Details</h3>
            <label>
              Bank Name
              <input value={form.bankName} onChange={(e) => updateField("bankName", e.target.value)} />
            </label>
            <label>
              Account Title
              <input value={form.accountTitle} onChange={(e) => updateField("accountTitle", e.target.value)} />
            </label>
            <label>
              Account Number / IBAN
              <input value={form.accountNumber} onChange={(e) => updateField("accountNumber", e.target.value)} />
            </label>
          </>
        )}

        <label>
          Notes <span className="optional">(optional)</span>
          <textarea value={form.notes} onChange={(e) => updateField("notes", e.target.value)} rows={2} />
        </label>

        {submitError && <p className="msg error">{submitError}</p>}

        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? "Submitting..." : "Submit for Approval"}
        </button>
      </form>
    </div>
  );
}
