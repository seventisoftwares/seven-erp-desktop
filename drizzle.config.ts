import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: ["./db/schema.ts", "./db/reporting-fiscal-schema.ts"],
  dialect: "sqlite",
});
