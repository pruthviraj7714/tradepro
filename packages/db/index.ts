import { config as loadEnv } from "dotenv";
import path from "path";

loadEnv({ path: path.resolve(process.cwd(), ".env") });

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is missing");
}

const adapter = new PrismaPg({ connectionString });
export default new PrismaClient({ adapter });