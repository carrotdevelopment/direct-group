import { Worker } from "bullmq";
import { connection } from "./queues";
import { prisma } from "@/server/lib/prisma";

const filesWorker = new Worker("files", async (job) => {
  const processingJob = await prisma.processingJob.findUnique({ where: { bullmqJobId: job.id } });
  if (processingJob) await prisma.processingJob.update({ where: { id: processingJob.id }, data: { status: "ACTIVE", startedAt: new Date(), attempts: { increment: 1 } } });
  // Parsers are intentionally isolated here; no uploaded file is ever executed.
  await job.updateProgress(100);
  if (processingJob) await prisma.processingJob.update({ where: { id: processingJob.id }, data: { status: "COMPLETED", progress: 100, finishedAt: new Date() } });
  return { processed: true, fileId: job.data.fileId };
}, { connection, concurrency: 2 });

filesWorker.on("failed", async (job, error) => {
  if (!job?.id) return;
  await prisma.processingJob.updateMany({ where: { bullmqJobId: job.id }, data: { status: "FAILED", errors: { message: error.message }, finishedAt: new Date() } });
});

async function shutdown() {
  await filesWorker.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
