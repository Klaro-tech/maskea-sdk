// Runs Maskea's detector over dataset.json and writes predictions-maskea.json. Needs `npm run build` first.
import fs from "node:fs"
import { detectPii } from "../../dist/middleware/pii.js"

const dir = new URL(".", import.meta.url).pathname
const SET = process.env.SET ?? ""
const docs = JSON.parse(fs.readFileSync(dir + `dataset${SET}.json`, "utf8"))
const ALL = ["email", "phone", "ssn", "credit_card", "aadhaar", "pan", "gstin", "ifsc", "upi", "in_phone", "name", "address"]
const LABEL = { email: "EMAIL", phone: "PHONE", in_phone: "PHONE", ssn: "SSN", credit_card: "CARD", aadhaar: "AADHAAR", pan: "PAN", gstin: "GSTIN", ifsc: "IFSC", upi: "UPI", name: "PERSON", address: "LOCATION" }
const mode = process.argv[2] ?? "all"
const types = mode === "default" ? undefined : ALL
const out = docs.map((d) => detectPii(d.text, types).map((m) => ({ type: LABEL[m.type], start: m.start, end: m.end })))
fs.writeFileSync(dir + `predictions-maskea-${mode}${SET}.json`, JSON.stringify(out))
console.log(`maskea (${mode}): ${out.flat().length} predictions over ${docs.length} documents`)
