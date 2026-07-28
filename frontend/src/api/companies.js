import client from "./client";

export async function getCompanies() {
  const { data } = await client.get("/companies");
  return data;
}