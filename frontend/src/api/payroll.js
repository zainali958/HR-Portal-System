import client from "./client";

export async function getPayrollCycles(status) {
  const { data } = await client.get("/payroll", { params: status ? { status } : {} });
  return data;
}

export async function getPayrollCycle(id) {
  const { data } = await client.get(`/payroll/${id}`);
  return data;
}

export async function createPayrollCycle(payload) {
  const { data } = await client.post("/payroll", payload);
  return data;
}

// Previews the attendance-based deduction for one employee before the
// cycle is submitted, so HR can see the breakdown and adjust if needed.
export async function previewAttendance(employeeId, month, attendanceFile, leaveFile) {
  const { data } = await client.post("/payroll/parse-attendance", { employeeId, month, attendanceFile, leaveFile });
  return data;
}

export async function financeDecidePayroll(id, decision, reason) {
  const { data } = await client.post(`/payroll/${id}/finance-decision`, { decision, reason });
  return data;
}

export async function accountantDecidePayroll(id, decision, reason) {
  const { data } = await client.post(`/payroll/${id}/accountant-decision`, { decision, reason });
  return data;
}

export async function ceoDecidePayroll(id, decision, reason) {
  const { data } = await client.post(`/payroll/${id}/ceo-decision`, { decision, reason });
  return data;
}

export async function escalatePayroll(id, reason) {
  const { data } = await client.post(`/payroll/${id}/escalate`, { reason });
  return data;
}

export async function resolvePayrollEscalation(id) {
  const { data } = await client.post(`/payroll/${id}/resolve-escalation`);
  return data;
}

export async function escalatePayrollToCEO(id) {
  const { data } = await client.post(`/payroll/${id}/escalate-to-ceo`);
  return data;
}
