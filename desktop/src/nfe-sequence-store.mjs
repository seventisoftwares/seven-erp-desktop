import { randomInt } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const digits = (value) => String(value ?? "").replace(/\D/g, "");

export function createNfeSequenceStore({ dataDir }) {
  const filePath = path.join(dataDir, "fiscal-documents", "nfe-sequences.json");
  let writeChain = Promise.resolve();

  async function readState() {
    try {
      const parsed = JSON.parse(await readFile(filePath, "utf8"));
      return parsed && typeof parsed === "object" ? parsed : { sequences: {}, reservations: {} };
    } catch { return { sequences: {}, reservations: {} }; }
  }

  async function writeState(state) {
    writeChain = writeChain.then(async () => {
      await mkdir(path.dirname(filePath), { recursive: true });
      const temporary = `${filePath}.${process.pid}.tmp`;
      await writeFile(temporary, JSON.stringify(state, null, 2), { encoding: "utf8", mode: 0o600 });
      await rename(temporary, filePath);
    });
    return writeChain;
  }

  async function reserve({ draftId, environment, series, startingNumber }) {
    const id = String(draftId || "").trim();
    if (!id) throw new Error("Rascunho NF-e inválido para reserva de numeração.");
    const env = environment === "production" ? "production" : "homologation";
    const serie = Number(digits(series) || 0);
    if (!Number.isInteger(serie) || serie < 0 || serie > 999) throw new Error("Série NF-e deve estar entre 0 e 999.");
    const start = Number(digits(startingNumber) || 0);
    if (!Number.isInteger(start) || start < 1 || start > 999999999) throw new Error("Configure o próximo número de NF-e válido antes de reservar numeração.");

    const state = await readState();
    state.sequences ||= {}; state.reservations ||= {};
    const reservationKey = `${env}:${serie}:${id}`;
    if (state.reservations[reservationKey]) return state.reservations[reservationKey];

    const sequenceKey = `${env}:${serie}`;
    const next = Math.max(start, Number(state.sequences[sequenceKey]?.nextNumber) || start);
    if (next > 999999999) throw new Error("A numeração NF-e da série atingiu o limite de 9 dígitos.");
    const reservation = {
      draftId: id,
      environment: env,
      series: serie,
      number: next,
      numericCode: String(randomInt(0, 100000000)).padStart(8, "0"),
      reservedAt: new Date().toISOString(),
      status: "reserved",
    };
    state.reservations[reservationKey] = reservation;
    state.sequences[sequenceKey] = { nextNumber: next + 1, updatedAt: reservation.reservedAt };
    await writeState(state);
    return reservation;
  }

  async function mark({ draftId, environment, series, status, accessKey = null, protocol = null }) {
    const env = environment === "production" ? "production" : "homologation";
    const serie = Number(digits(series) || 0);
    const state = await readState();
    const key = `${env}:${serie}:${String(draftId || "").trim()}`;
    const current = state.reservations?.[key];
    if (!current) return null;
    const next = { ...current, status: String(status || current.status), accessKey: accessKey || current.accessKey || null, protocol: protocol || current.protocol || null, updatedAt: new Date().toISOString() };
    state.reservations[key] = next;
    await writeState(state);
    return next;
  }

  async function status() { return readState(); }
  return { reserve, mark, status };
}
