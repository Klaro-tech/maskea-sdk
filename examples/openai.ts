// Wraps a real OpenAI SDK call -- maskea never replaces the provider
// SDK, it wraps whatever call you already have. Run with:
//   OPENAI_API_KEY=sk-... node --import tsx examples/openai.ts
import OpenAI from "openai"
import type { ChatCompletion } from "openai/resources/chat/completions"
import { Maskea, retries, budget, secrets, pii, logging } from "../src/index.js"

const openai = new OpenAI()

const maskea = new Maskea()
  .use(retries({ max: 3, backoff: "exponential" }))
  .use(budget({ maxMonthlyUsd: 50 }))
  .use(secrets({ mode: "mask" }))
  .use(pii({ mode: "mask" }))
  .use(logging({ format: "pretty" }))

// .bind() is required here because chat.completions.create relies on
// `this` internally -- a plain function reference would lose that context.
// This is the one real caveat of "wrap any async function": methods on a
// class instance need to be bound first, same as passing them to
// setTimeout or .map() would.
const chat = maskea.wrap(openai.chat.completions.create.bind(openai.chat.completions))

async function main() {
  // wrap()'s type inference goes through Function.prototype.bind's own
  // (deliberately weak, per lib.es5.d.ts) signature, which loses OpenAI's
  // overload resolution for stream:true vs stream:false -- a real,
  // documented TypeScript limitation of wrapping overloaded methods
  // generically, not a maskea bug. Runtime behavior is unaffected;
  // this cast just restores the type your `stream: false` argument
  // already guarantees at runtime.
  const response = (await chat({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "Say hello in five words." }],
    stream: false,
  })) as ChatCompletion
  console.log(response.choices[0]?.message?.content)
}

main().catch(console.error)
