"use client"

import { useEffect } from "react"

import { runCode, type CodeTest, type Files, type Language, type RunResult } from "@/lib/code/runner"

export type VerifyInput = { language: Language; starter: Files; solution: Files; tests: CodeTest[] }
export type VerifyOutput = { starter: RunResult; solution: RunResult[] }

/**
 * Used by `backend/cmd/codegen` (headless Chrome) to check a generated problem with the same runner learners use:
 * the starter must fail, the solution must pass, twice. It runs only what the caller passes in, inside the sandbox.
 */
export function VerifyHarness() {
  useEffect(() => {
    const w = window as unknown as { __verify?: (input: VerifyInput) => Promise<VerifyOutput>; __verifyReady?: boolean }
    w.__verify = async (input) => ({
      starter: await runCode(input.language, input.starter, input.tests),
      solution: [await runCode(input.language, input.solution, input.tests), await runCode(input.language, input.solution, input.tests)],
    })
    w.__verifyReady = true
  }, [])
  return <p className="p-4 text-sm text-muted-foreground">Problem verifier</p>
}
