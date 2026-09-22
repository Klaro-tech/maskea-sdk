import { randomUUID } from "node:crypto"
import type { KlaroContext, Middleware } from "./types.js"

/**
 * Root of the middleware pipeline. `.use()` composes like Express; `.wrap()`
 * takes the developer's own AI call (whatever provider it happens to hit)
 * and returns a function with the same signature that runs through every
 * registered middleware first. Nothing here talks to the network or a
 * cloud account -- every middleware in this package (see src/middleware/)
 * runs entirely in-process, per the "SDK must continue to provide value
 * even if the customer never creates a cloud account" principle.
 */
export class Maskea {
  private readonly middlewares: Middleware[] = []

  use(mw: Middleware<any, any>): this {
    this.middlewares.push(mw)
    return this
  }

  wrap<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => Promise<TResult>
  ): (...args: TArgs) => Promise<TResult> {
    return async (...args: TArgs): Promise<TResult> => {
      const ctx: KlaroContext = {
        callId: randomUUID(),
        startedAt: Date.now(),
        attempt: 1,
        meta: {},
      }

      // Build the chain right-to-left so the FIRST .use() call runs
      // OUTERMOST (sees the call first, sees the response last) -- matches
      // Express middleware ordering, where app.use(a).use(b) runs a's
      // pre-logic, then b's, then the handler, then b's post-logic, then
      // a's post-logic.
      const chain = this.middlewares.reduceRight<(args: TArgs) => Promise<TResult>>(
        (next, mw) => (a: TArgs) => mw(a as unknown[], next as any, ctx) as Promise<TResult>,
        (a: TArgs) => fn(...a)
      )

      return chain(args)
    }
  }
}
