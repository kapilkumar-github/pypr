// Prints a fresh extension key pair's public key and ID. The ID stays the same across machines when the public key is
// in the manifest, which is what the API's EXTENSION_IDS and the OAuth-style redirect URI depend on.
import { generateKeyPairSync, createHash } from "node:crypto"
const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
const der = publicKey.export({ type: "spki", format: "der" })
const id = [...createHash("sha256").update(der).digest().subarray(0, 16)].map((b) => String.fromCharCode(97 + (b >> 4)) + String.fromCharCode(97 + (b & 15))).join("")
console.log(JSON.stringify({ id, key: der.toString("base64") }, null, 2))
