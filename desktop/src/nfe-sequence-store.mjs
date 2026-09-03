import { randomInt } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const digits = (value) => String(value ?? "").replace(/\D/g, "");
const issuerScope = (value) => digits(value) || "legacy";

export function createNfeSequenceStore({ dataDir }) {
  const filePath = path.join(dataDir, "fiscal-documents", "nfe-sequences.json");
  let operationChain = Promise.resolve();
  async function readState() { try { const parsed = JSON.parse(await readFile(filePath, "utf8")); return parsed && typeof parsed === "object" ? { sequences: {}, reservations: {}, ...parsed } : { sequences: {}, reservations: {} }; } catch { return { sequences: {}, reservations: {} }; } }
  async function writeState(state) { await mkdir(path.dirname(filePath), { recursive: true }); const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`; await writeFile(temporary, JSON.stringify(state, null, 2), { encoding: "utf8", mode: 0o600 }); await rename(temporary, filePath); }
  function serialized(operation) { const run = operationChain.then(operation, operation); operationChain = run.then(() => undefined, () => undefined); return run; }

  async function reserve({ draftId, environment, series, startingNumber, issuerTaxId = "" }) {
    return serialized(async () => {
      const id = String(draftId || "").trim(); if (!id) throw new Error("Rascunho NF-e inválido para reserva de numeração.");
      const env = environment === "production" ? "production" : "homologation"; const serie = Number(digits(series) || 0); if (!Number.isInteger(serie) || serie < 0 || serie > 999) throw new Error("Série NF-e deve estar entre 0 e 999.");
      const start = Number(digits(startingNumber) || 0); if (!Number.isInteger(start) || start < 1 || start > 999999999) throw new Error("Configure o próximo número de NF-e válido antes de reservar numeração.");
      const issuer = issuerScope(issuerTaxId); const state = await readState(); state.sequences ||= {}; state.reservations ||= {};
      const reservationKey = `${issuer}:${env}:${serie}:${id}`; const legacyReservationKey = `${env}:${serie}:${id}`;
      let existing = state.reservations[reservationKey];
      if (!existing && issuer !== "legacy" && state.reservations[legacyReservationKey]) {
        existing = { ...state.reservations[legacyReservationKey], issuerTaxId: issuer };
        state.reservations[reservationKey] = existing; delete state.reservations[legacyReservationKey]; await writeState(state);
      }
      if (existing) { if (!existing.issuedAt) { existing.issuedAt = existing.reservedAt || new Date().toISOString(); existing.updatedAt = new Date().toISOString(); await writeState(state); } return { ...existing }; }
      const sequenceKey = `${issuer}:${env}:${serie}`; const legacySequenceKey = `${env}:${serie}`;
      const scopedNext = Number(state.sequences[sequenceKey]?.nextNumber) || 0; const legacyNext = issuer === "legacy" ? 0 : Number(state.sequences[legacySequenceKey]?.nextNumber) || 0;
      const next = Math.max(start, scopedNext || start, legacyNext || start); if (next > 999999999) throw new Error("A numeração NF-e da série atingiu o limite de 9 dígitos.");
      const reservedAt = new Date().toISOString(); const reservation = { draftId: id, issuerTaxId: issuer === "legacy" ? "" : issuer, environment: env, series: serie, number: next, numericCode: String(randomInt(0, 100000000)).padStart(8, "0"), issuedAt: reservedAt, reservedAt, status: "reserved" };
      state.reservations[reservationKey] = reservation; state.sequences[sequenceKey] = { issuerTaxId: reservation.issuerTaxId, environment: env, series: serie, nextNumber: next + 1, updatedAt: reservedAt }; await writeState(state); return { ...reservation };
    });
  }

  async function mark({ draftId, environment, series, status, accessKey = null, protocol = null, issuerTaxId = "" }) {
    return serialized(async () => {
      const env = environment === "production" ? "production" : "homologation"; const serie = Number(digits(series) || 0); const issuer = issuerScope(issuerTaxId); const id = String(draftId || "").trim(); const state = await readState(); state.reservations ||= {};
      const key = `${issuer}:${env}:${serie}:${id}`; const legacyKey = `${env}:${serie}:${id}`; let current = state.reservations[key]; let actualKey = key;
      if (!current && issuer !== "legacy" && state.reservations[legacyKey]) { current = state.reservations[legacyKey]; actualKey = key; delete state.reservations[legacyKey]; }
      if (!current) return null;
      const next = { ...current, issuerTaxId: issuer === "legacy" ? (current.issuerTaxId || "") : issuer, status: String(status || current.status), accessKey: accessKey || current.accessKey || null, protocol: protocol || current.protocol || null, updatedAt: new Date().toISOString() };
      state.reservations[actualKey] = next; await writeState(state); return { ...next };
    });
  }
  async function status() { await operationChain; return readState(); }
  return { reserve, mark, status };
}
