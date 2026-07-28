import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createOffer } from "../api/offers";

const STEPS = ["Candidate", "Role Details", "KPIs & Salary", "Review"];

export default function OfferWizardPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    candidateName: "",
    candidateEmail: "",
    candidatePhone: "",
    employmentType: "Employee",
    designation: "",
    timings: "",
    jobDescription: "",
    kpis: [""],
    proposedSalary: "",
  });

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function updateKpi(index, value) {
    setForm((prev) => {
      const kpis = [...prev.kpis];
      kpis[index] = value;
      return { ...prev, kpis };
    });
  }

  function addKpi() {
    setForm((prev) => ({ ...prev, kpis: [...prev.kpis, ""] }));
  }

  function removeKpi(index) {
    setForm((prev) => ({ ...prev, kpis: prev.kpis.filter((_, i) => i !== index) }));
  }

  function next() {
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function back() {
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleSubmit(submitNow) {
    setError("");

    if (form.employmentType !== "Intern" && !form.proposedSalary) {
      setError("Proposed salary is required for Employee offers.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        ...form,
        kpis: form.kpis.map((k) => k.trim()).filter(Boolean),
        proposedSalary: form.employmentType === "Intern" ? undefined : Number(form.proposedSalary) || undefined,
        submit: submitNow,
      };
      const offer = await createOffer(payload);
      navigate(`/offers/${offer._id}`);
    } catch (err) {
      const message = err.response && err.response.data && err.response.data.message
        ? err.response.data.message
        : "Failed to save offer";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-content">
      <p className="eyebrow">New Offer</p>
      <h1>Propose a Hire</h1>

      <div className="wizard-steps">
        {STEPS.map((label, i) => (
          <div key={label} className={i === step ? "wizard-step active" : i < step ? "wizard-step done" : "wizard-step"}>
            {i + 1}. {label}
          </div>
        ))}
      </div>

      <div className="card">
        {step === 0 && (
          <div>
            <label>
              Candidate Name
              <input value={form.candidateName} onChange={(e) => updateField("candidateName", e.target.value)} required />
            </label>
            <label>
              Candidate Email
              <input type="email" value={form.candidateEmail} onChange={(e) => updateField("candidateEmail", e.target.value)} />
            </label>
            <label>
              Candidate Phone
              <input value={form.candidatePhone} onChange={(e) => updateField("candidatePhone", e.target.value)} />
            </label>
            <label>
              Employment Type
              <select value={form.employmentType} onChange={(e) => updateField("employmentType", e.target.value)}>
                <option value="Employee">Employee</option>
                <option value="Intern">Intern (unpaid)</option>
              </select>
            </label>
          </div>
        )}

        {step === 1 && (
          <div>
            <label>
              Designation
              <input value={form.designation} onChange={(e) => updateField("designation", e.target.value)} required />
            </label>
            <label>
              Timings
              <input value={form.timings} onChange={(e) => updateField("timings", e.target.value)} placeholder="e.g. Mon-Fri, 10am-6pm" />
            </label>
            <label>
              Job Description
              <textarea
                value={form.jobDescription}
                onChange={(e) => updateField("jobDescription", e.target.value)}
                rows={6}
                required
              />
            </label>
          </div>
        )}

        {step === 2 && (
          <div>
            <label>KPIs</label>
            {form.kpis.map((kpi, i) => (
              <div key={i} className="kpi-row">
                <input value={kpi} onChange={(e) => updateKpi(i, e.target.value)} placeholder={`KPI ${i + 1}`} />
                {form.kpis.length > 1 && (
                  <button type="button" className="btn-secondary" onClick={() => removeKpi(i)}>Remove</button>
                )}
              </div>
            ))}
            <button type="button" className="btn-secondary" onClick={addKpi}>+ Add another KPI</button>

            {form.employmentType !== "Intern" && (
              <label style={{ marginTop: "1.2rem" }}>
                Proposed Salary
                <input
                  type="number"
                  value={form.proposedSalary}
                  onChange={(e) => updateField("proposedSalary", e.target.value)}
                  min="0"
                  required
                />
              </label>
            )}
            {form.employmentType === "Intern" && (
              <p className="muted" style={{ marginTop: "1.2rem" }}>
                Interns are unpaid - no salary field for this offer.
              </p>
            )}
          </div>
        )}

        {step === 3 && (
          <div>
            <h3>Review</h3>
            <dl className="review-list">
              <dt>Candidate</dt><dd>{form.candidateName} ({form.employmentType})</dd>
              <dt>Designation</dt><dd>{form.designation}</dd>
              <dt>Timings</dt><dd>{form.timings || "-"}</dd>
              <dt>Job Description</dt><dd className="pre-wrap">{form.jobDescription}</dd>
              <dt>KPIs</dt>
              <dd>
                <ul>
                  {form.kpis.filter(Boolean).map((k, i) => <li key={i}>{k}</li>)}
                </ul>
              </dd>
              {form.employmentType !== "Intern" && (
                <>
                  <dt>Proposed Salary</dt><dd>{form.proposedSalary || "-"}</dd>
                </>
              )}
            </dl>
          </div>
        )}

        {error && <p className="msg error">{error}</p>}

        <div className="wizard-actions">
          {step > 0 && <button type="button" className="btn-secondary" onClick={back}>Back</button>}
          {step < STEPS.length - 1 && (
            <button type="button" className="btn-primary" onClick={next}>Continue</button>
          )}
          {step === STEPS.length - 1 && (
            <>
              <button type="button" className="btn-secondary" onClick={() => handleSubmit(false)} disabled={submitting}>
                Save as Draft
              </button>
              <button type="button" className="btn-primary" onClick={() => handleSubmit(true)} disabled={submitting}>
                {submitting ? "Submitting..." : "Submit for Approval"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}