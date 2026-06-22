import { Queue } from "bullmq";

export const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };
const defaultJobOptions = { attempts: 3, backoff: { type: "exponential" as const, delay: 2_000 }, removeOnComplete: 500, removeOnFail: 1_000 };

export const filesQueue = new Queue("files", { connection, defaultJobOptions });
export const aiQueue = new Queue("ai", { connection, defaultJobOptions });
export const tangoQueue = new Queue("tango", { connection, defaultJobOptions });
export const stockQueue = new Queue("stock", { connection, defaultJobOptions });
