import type { ServerLanguage } from "@/lib/api/code"

export const LANGUAGES: { id: ServerLanguage; name: string; file: string }[] = [
  { id: "nodejs", name: "JavaScript", file: "main.js" },
  { id: "typescript", name: "TypeScript", file: "main.ts" },
]

export const languageName = (id: ServerLanguage) => LANGUAGES.find((l) => l.id === id)?.name ?? id

/** Starting code for a stdin/stdout problem: read everything, call solve, print. Runs on Node.js 22. */
export const TEMPLATES: Record<ServerLanguage, string> = {
  nodejs: `const data = require("fs").readFileSync(0, "utf8");

function solve(data) {
  // TODO: parse data (the whole of stdin) and return the answer
  return "";
}

console.log(solve(data));
`,
  typescript: `declare const require: any;
const data: string = require("fs").readFileSync(0, "utf8");

function solve(data: string): string {
  // TODO: parse data (the whole of stdin) and return the answer
  return "";
}

console.log(solve(data));
`,
}
