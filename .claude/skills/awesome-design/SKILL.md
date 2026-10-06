---
name: awesome-design
description: Library of 74 DESIGN.md design systems reverse-engineered from popular sites (Stripe, Linear, Vercel, Revolut, Wise, Coinbase, Notion, Apple...). Use when the user wants the UI to look like a known product, asks for a design system / DESIGN.md, or wants consistent colors, typography, spacing and component styling for the frontend.
---

# Awesome Design (DESIGN.md library)

Source: https://github.com/VoltAgent/awesome-design-md (MIT, see LICENSE).

Each folder in `design-md/<site>/DESIGN.md` (relative to this skill) describes one product's
visual language: color tokens, typography, spacing, radii, shadows, component patterns and voice.

## How to use

1. Pick the design system that matches the user's request. If they did not name one, suggest
   2-3 that fit the product (for this finance app: `stripe`, `revolut`, `wise`, `coinbase`,
   `kraken`, `mastercard`, `linear.app`, `vercel` are good fits) and ask.
2. Read only the chosen `design-md/<site>/DESIGN.md` — do not load several at once.
3. Translate its tokens into the project's styling layer (CSS variables / Tailwind theme) first,
   then apply them to components. Keep light and dark mode tokens if the file defines both.
4. If the user wants it as the project's permanent reference, copy it to `DESIGN.md` at the
   repo root (or `frontend/DESIGN.md`) and adapt brand names/logos — never ship another
   company's logo or trademarked assets.

## Available systems

airbnb airtable apple binance bmw bmw-m bugatti cal claude clay clickhouse cohere coinbase composio cursor dell-1996 elevenlabs expo ferrari figma framer hashicorp hp ibm intercom kraken lamborghini linear.app lovable mastercard meta minimax mintlify miro mistral.ai mongodb nike nintendo-2001 notion nvidia ollama opencode.ai pinterest playstation posthog raycast renault replicate resend revolut runwayml sanity sentry shopify slack spacex spotify starbucks stripe supabase superhuman tesla theverge together.ai uber vercel vodafone voltagent warp webflow wired wise x.ai zapier 
