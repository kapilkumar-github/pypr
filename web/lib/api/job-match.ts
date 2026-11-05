import type { AiRequirements } from "@/lib/resume/job-match"
import { runJob } from "./client"

/** Reads a posting's requirements with AI on the API (20–60 s). */
export async function analyzePosting(posting: string): Promise<AiRequirements> {
  const job = await runJob<{ requirements: AiRequirements }>("/job-analyses", "/job-analyses", { posting })
  return job.requirements
}
