import client from "./client";

export async function getEmployees(status) {
  const { data } = await client.get("/employees", { params: status ? { status } : {} });
  return data;
}

export async function getEmployee(id) {
  const { data } = await client.get(`/employees/${id}`);
  return data;
}

export async function updateEmployee(id, payload) {
  const { data } = await client.patch(`/employees/${id}`, payload);
  return data;
}