# Switchboard

**An AI phone receptionist for service businesses, with its guardrails in code instead of in the prompt.**

**Live:** https://switchboard-nine.vercel.app ([demo](https://switchboard-nine.vercel.app/demo), [agency dashboard](https://switchboard-nine.vercel.app/dashboard))

Switchboard answers calls for plumbers, HVAC shops and electricians. It takes the caller's details, quotes from the price book, books an open slot, texts a confirmation and hands emergencies to a person. A language model (Claude) understands the caller. Code decides every price, booking, transfer and text.

It's built for agencies that resell AI receptionists: one engine serves many client accounts, each defined by a config file, with a white-label dashboard across all of them.

| Page | What it shows |
| --- | --- |
| `/` | Case study, with a hero that replays a real engine run |
| `/demo` | Talk to the receptionist as a caller and watch every check, turn by turn. Includes a **fault injection** switch that simulates a jailbroken model |
| `/dashboard` | Agency view: calls, bookings, revenue, a text approval queue, and full transcripts with traces. Calls you place in the demo appear here |

## The problem

Business owners don't buy an AI receptionist for its voice. They buy the assurance it won't promise half off, book a slot that's already taken, or keep someone with a burst pipe on hold asking for their ZIP code. Most builds handle that with a longer prompt. A prompt is a request, not a rule.

## The approach: the model proposes, code decides

Each caller turn runs through the same pipeline (`src/lib/agent/engine.ts`):

1. **Interpret.** Claude reads the caller's message and returns a schema-validated *proposal*: intent, the details it heard, which offered slot was picked, and an optional short opener. It never writes the reply. If the call fails, is refused or takes longer than 8 seconds, a deterministic rules interpreter produces the proposal instead.
2. **Check.** Nine guardrails, each a pure function in `src/lib/agent/guardrails.ts`, review the proposal against the client's config and the live calendar.
3. **Act.** Code books, texts, transfers or queues for approval, and writes the reply from templates.
4. **Trace.** Every verdict, the raw proposal and the executed actions are returned with the turn and shown in the demo and the dashboard.

| Guardrail | Rule |
| --- | --- |
| Model health | Model errors, refusals and timeouts fall back to the rules interpreter. No dead air. |
| Field validation | Phone, ZIP, name and service are re-parsed and validated. Made-up values are dropped. |
| Escalation | Emergency phrases and requests for a person trigger a live transfer, decided by keyword rules. |
| Instruction override | A caller trying to rewrite the rules locks booking, discounts and texts for that turn. |
| Pricing authority | Prices come only from the price book. Discounts are blocked; wrong quotes are corrected. |
| Service area | ZIPs outside the client's list are declined with a referral. |
| Booking integrity | Books only an offered, open slot, with every required detail present. |
| Outbound texts | Only the confirmation template sends itself. Model-written texts wait for a human. |
| Reply scan | The model's opener is dropped if it mentions money, offers or promises. |

## Tests

```bash
npm test
```

64 tests cover the parsers, each guardrail, full conversations, the Claude interpreter (against a stubbed client), and model failure. The fault-injection suite tampers with the model's output on every turn for every client account (a 50% discount, a $49 quote, a taken slot, a spam text, invented details) and passes only if none of it reaches the caller.

## Running it

```bash
npm install
npm run dev
```

Open http://localhost:3000. No key is needed: without `ANTHROPIC_API_KEY` the app runs on the rules interpreter. To use Claude for language understanding:

```bash
cp .env.example .env.local   # then add your key
```

The API route is stateless (the client holds the call state), so it deploys to Vercel or any Node host with no database.

## Taking it to production

The demo uses text so anyone can try it in a browser. In production the same `runTurn` engine sits behind a voice provider's custom-LLM webhook (Retell, Vapi or Twilio ConversationRelay). `src/lib/availability.ts` is the seam for a real calendar (Google Calendar, Jobber, ServiceTitan), and the executed actions map onto CRM writes (GoHighLevel, HubSpot).

## Stack

Next.js 15 (App Router), TypeScript, Tailwind CSS 4, Zod, the Anthropic TypeScript SDK with structured outputs, and Vitest.

## Project layout

```
src/lib/agent/engine.ts        turn pipeline and reply composition
src/lib/agent/guardrails.ts    the checks, as pure functions
src/lib/agent/interpreters.ts  Claude interpreter, rules interpreter, fault injection
src/lib/agent/extract.ts       deterministic parsers for phones, ZIPs, names, slots
src/lib/tenants.ts             client accounts: services, price book, service area
src/lib/availability.ts        calendar stand-in
src/app/api/call/route.ts      stateless call endpoint
src/components/                demo console, trace panel, dashboard
```

The businesses are fictional. The engine, tests and traces are real.
