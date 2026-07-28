import client from "./client";

export async function getOffers(status) {
  const { data } = await client.get("/offers", { params: status ? { status } : {} });
  return data;
}

export async function getOffer(id) {
  const { data } = await client.get(`/offers/${id}`);
  return data;
}

export async function createOffer(payload) {
  const { data } = await client.post("/offers", payload);
  return data;
}

export async function updateOffer(id, payload) {
  const { data } = await client.patch(`/offers/${id}`, payload);
  return data;
}

export async function submitOffer(id) {
  const { data } = await client.post(`/offers/${id}/submit`);
  return data;
}

export async function hrDecideOffer(id, decision, reason) {
  const { data } = await client.post(`/offers/${id}/hr-decision`, { decision, reason });
  return data;
}

export async function ceoDecideOffer(id, decision, reason) {
  const { data } = await client.post(`/offers/${id}/ceo-decision`, { decision, reason });
  return data;
}

export async function shareOffer(id) {
  const { data } = await client.post(`/offers/${id}/share`);
  return data;
}

export async function commentOnOffer(id, message) {
  const { data } = await client.post(`/offers/${id}/comments`, { message });
  return data;
}

export async function recordCandidateResponse(id, response) {
  const { data } = await client.post(`/offers/${id}/candidate-response`, { response });
  return data;
}