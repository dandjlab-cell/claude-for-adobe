# The sweep queue — everything still missing from the full picture

Derived 2026-09-18 from `src/lumetri_sweeps.json` (what exists) against `docs/color-full-table-plan.md`
revision 2 (what is planned). **The sweep file is the authority on any number; this is the queue.**

Status today: **9 controls have a form** (6 exact, 3 approximate), **~14 have nothing**, **0 of 6 named
interactions measured**.

19 items. 11 need a render. 4 need nothing but arithmetic on data already held.

---

## Group 0 — validity. Nothing above this is trustworthy without it

| # | sweep | render |
|---|---|---|
| 1 | **Repeatability** — one control, one setting, measured 3× on 3 frames | ~9 |
| 2 | **A held-out frame from a different camera/shoot** — re-run 3 known forms on it | ~3 |

Every accuracy figure in the repo is judged against a 0.4 IRE noise floor inferred from *one*
adjacent-frame pair, and nothing has ever been measured twice at the same setting, so §0's threshold has
no empirical basis at all. Every frame used so far is the same camera and the same shoot, so any
common-mode error in Premiere's BRAW handling is invisible to us.

These two decide whether the other seventeen mean anything. Cheap.

---

## Group 1 — the pass writes these blind, today

| # | sweep | why urgent | render |
|---|---|---|---|
| 3 | **Highlights wheel pad (hue/sat)** | `padsFor` writes it on every clip. No form. | yes |
| 4 | **HSL Secondary correction scalars** | `skinFor` writes them. No form. | yes |
| 5 | **Luma-vs-Sat roll-off** | `satCurveFor` writes it. Only its *black-end* effect was measured, and that was a negative result (`satRolloffBlacks`). | yes |

The sharp end: three controls reach the picture on every run with nothing measured behind them.

---

## Group 2 — finish the nine forms that are half-done

| # | sweep | state | render |
|---|---|---|---|
| 6 | **Exposure upward — the shoulder** | 0.985 at p1, 0.971 median, 0.926 p99, 0.886 max at +0.5 stops. Unmeasured as a curve. The reverted white-point change is blocked on this. | yes |
| 7 | **Highlights — parameterise the band** | form identified (median +12.6 vs p99 +7.8 — no gain can), no parameters | yes |
| 8 | **Shadows — refit without the degenerate pivot** | quoted P of 95–100 is ill-determined and must not be used | yes |
| 9 | **Contrast — refit** | residual 2.09, signed and monotone → approximate | yes |
| 10 | **Blacks — λ and strength on a second frame** | form confirmed, constant from one frame only | yes |
| 11 | **Shadows wheel luma — why the magnitude does not transfer** | 6.6 vs 9.4 IRE for the same move; disqualifies it as a form | yes |

---

## Group 3 — no render needed. Do these first, they are free

| # | work |
|---|---|
| 12 | **Temperature + Tint per-channel-gain fit** — try offline against the existing C220 block before spending a render. If it holds, #12 replaces two sweeps. |
| 13 | **The clamp model** — `clamp(f(v), 0, 100)` per channel *before* the percentile is taken. Every form in the file is an unclamped map. Clamping is what actually ends every form (blacks at −20, whites at +50, temperature at ±50, contrast at +100), it is irreversible, and **it is the only thing that genuinely fixes an order.** |
| 14 | **Band-membership shift** — bands are defined by luma *level*, so every tonal move reclassifies pixels between them. Distinct from the documented `readable` survivorship. Unmeasured. |
| 15 | **Commutation** — closed form `(kA−1)(kB−1)(PA−PB)`, constant in v. Arithmetic, not a sweep. Whites (P=0) and Contrast (P≈49.6) provably do not commute: −0.75 IRE at +50/+50, +1.27 IRE at −50/+100. |

13 and 14 are what the plan calls the real work: they are what makes an *order* provable rather than chosen.

---

## Group 4 — interactions. Zero of six measured

| # | pair | note |
|---|---|---|
| 16 | **Shadows wheel luma × the black balance** | **a live bug.** The wheel moves channel spacing up to 3.2 IRE and runs at step 5; `bottomsFor` set the spacing at step 3 and nothing re-reads. At the live C229 setting it removes ~1.5 IRE of red-minus-blue — the entire tolerance the balance was solved to. |
| 17 | **Pre-compensating `castCoupling`** | measured (3.1× under Shadows, 1.5× Whites, 1.1× Contrast); currently *discovered* by a render instead of predicted |
| 18 | **Channel toes × the Master curve** | share floor headroom; composition assumed, never checked |
| 19 | **Whites × Highlights** | both steer p99, now known to be different families |

**Test method:** compare B's fitted *parameters* (k, P, λ) with A set and unset. NOT B's IRE slope — that
is confounded, because B's slope changes whenever A changes B's input even under perfect composition.
Tolerance no tighter than the 0.4 IRE floor.

---

## Group 5 — controls the pass does not write

No form for any of these. Only worth sweeping if the pass should reach for them.

Master curve **top** point · Shadows/Midtones wheel pads · Midtones/Highlights wheel **luma** · global
Saturation · Vibrance · three of the five hue-vs curves · the whole Creative section · Vignette.

---

## Standing rules for any sweep in this queue

From `Measuring a Lumetri Control 2026-09-17` in the Brain vault — each of these produced a confident
wrong answer before it was caught:

- **Include the control's neutral as a row**, taken from the parameter's own spec (saturation's neutral is
  100, a wheel luma's is 0.5). Two runs were wasted sweeping from 0 on a control whose neutral is 0.5.
- **Never fit a pivot from p1 and p99 when p99 barely moves** — degenerate: `P = p99` then satisfies it for
  any k. Blacks returned P = 84.7 with p99 = 84.7 and Blacks is not a gain at all.
- **Fit on all recorded statistics**, then check against one held out of the fit. Two points and two
  unknowns fit exactly by construction, so agreement on them is never evidence.
- **Never take a gain from a statistic near the rails — in any table you depend on**, not just the one
  being fitted. A railed exposure table is what took a run from 5/18 to 0/18.
- **A uniform-sign residual is noise in the extraction, not a model error.** Do not refit.
- **Guard a cast reading on `readable`, not on a damage share.** The cast statistic goes blind and can
  invert as an end is crushed.
