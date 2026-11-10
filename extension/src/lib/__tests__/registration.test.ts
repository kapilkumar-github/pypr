import { describe, expect, it } from "vitest"
import { BUNDLED_SITES } from "../adapters"
import { createConfig } from "../configs"
import { planRegistration } from "../registration"

const mine = (url: string, extra: object = {}) => ({ ...createConfig(new URL(url)).config, ...extra })
const on = { autoLauncher: true }

describe("content script registration", () => {
  it("registers nothing until access is granted", () => {
    expect(planRegistration([mine("https://a.com/jobs/1")], () => false, on).matches).toBeNull()
    expect(planRegistration(BUNDLED_SITES, () => false, on).matches).toBeNull()
  })
  it("registers exactly the granted origins", () => {
    const granted = new Set(["https://a.com/*"])
    const plan = planRegistration([mine("https://a.com/jobs/1"), mine("https://b.com/jobs/1")], (p) => granted.has(p), on)
    expect(plan.matches).toEqual(["https://a.com/*"])
  })
  it("follows revocation, disabling and the launcher setting", () => {
    const c = mine("https://a.com/jobs/1")
    expect(planRegistration([c], () => true, on).matches).toEqual(["https://a.com/*"])
    expect(planRegistration([c], () => false, on).matches).toBeNull()
    expect(planRegistration([{ ...c, enabled: false }], () => true, on).matches).toBeNull()
    expect(planRegistration([c], () => true, { autoLauncher: false }).matches).toBeNull()
    expect(planRegistration([{ ...c, patterns: [] }], () => true, on).matches).toBeNull()
  })
  it("only covers subdomains the user approved", () => {
    const c = mine("https://a.com/jobs/1", { hosts: [{ host: "a.com", subdomains: true }] })
    expect(planRegistration([c], () => true, on).matches).toEqual(["https://*.a.com/*", "https://a.com/*"])
    expect(planRegistration([mine("https://a.com/jobs/1")], () => true, on).matches).toEqual(["https://a.com/*"])
  })
})
