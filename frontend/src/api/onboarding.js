import client from "./client";

// NOTE: this file assumes your Onboarding routes follow the same pattern as
// Offers (GET /api/onboarding, GET /api/onboarding/:id, POST /api/onboarding,
// POST /api/onboarding/:id/decision) based on what your PowerShell test showed.
// If your actual route paths differ, this is the only file that needs to change.

export async function getOnboardingRecords(status) {
  const { data } = await client.get("/onboarding", { params: status ? { status } : {} });
  return data;
}

export async function getOnboardingRecord(id) {
  const { data } = await client.get(`/onboarding/${id}`);
  return data;
}

// payload matches the fields from your tested request:
// offerId, employeeName, fatherName, cnic, dateOfJoining, employmentStatus,
// grossSalary, allowances, deductions, bankName, accountTitle, accountNumber, submit
export async function createOnboarding(payload) {
  const { data } = await client.post("/onboarding", payload);
  return data;
}

export async function decideOnboarding(id, decision, reason) {
  const { data } = await client.post(`/onboarding/${id}/decision`, { decision, reason });
  return data;
}
export async function downloadOfferLetter(id, filename) {
  const { data } = await client.get(`/onboarding/${id}/letter`, { responseType: "blob" });
  const url = window.URL.createObjectURL(new Blob([data]));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename || "Offer_Letter.docx");
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
export async function accountantBankDecision(id, decision, reason) {
  const { data } = await client.post(`/onboarding/${id}/accountant-bank-decision`, { decision, reason });
  return data;
}

export async function financeBankDecision(id, decision, reason) {
  const { data } = await client.post(`/onboarding/${id}/finance-bank-decision`, { decision, reason });
  return data;
}

export async function updateBankDetails(id, payload) {
  const { data } = await client.patch(`/onboarding/${id}/bank-details`, payload);
  return data;
}