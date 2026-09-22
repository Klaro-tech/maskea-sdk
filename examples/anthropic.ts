// Same pipeline, a completely different provider SDK/response shape --
// proves the "wraps rather than replaces" design actually holds across
// providers, not just OpenAI. Run with:
//   ANTHROPIC_API_KEY=sk-ant-... node --import tsx examples/anthropic.ts
import Anthropic from "@anthropic-ai/sdk"
import type { Message } from "@anthropic-ai/sdk/resources/messages"
import { Maskea, retries, budget, secrets, pii, logging } from "../src/index.js"

const anthropic = new Anthropic()

const maskea = new Maskea()
  .use(retries({ max: 3, backoff: "exponential" }))
  .use(budget({ maxMonthlyUsd: 50 }))
  .use(secrets({ mode: "mask" }))
  .use(pii({ mode: "mask" }))
  .use(logging({ format: "pretty" }))

const messages = maskea.wrap(anthropic.messages.create.bind(anthropic.messages))

async function main() {
  // See examples/openai.ts's comment -- same wrap()-through-.bind()
  // overload-erasure limitation, same fix.
  const response = (await messages({
    model: "claude-3-5-haiku-latest",
    max_tokens: 100,
    messages: [{ role: "user", content: "Say hello in five words." }],
    stream: false,
  })) as Message
  const block = response.content[0]
  console.log(block.type === "text" ? block.text : block)
}

main().catch(console.error)
