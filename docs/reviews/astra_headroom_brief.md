# Brief: the headroom allocation, and the order that irreversibility forces

You are being asked to solve the one genuinely open problem in an automatic colour-grading system. Everything
else in the programme is either measured or reduced to arithmetic. This is not. It has been described in the
project's own plan as "the actual unsolved problem", and it got one line.

Answer as a mathematician would: state the formulation, defend the objective, and give an algorithm. Do not
write code unless a snippet makes the method unambiguous. If you think the problem as posed is the wrong
problem, say so and pose the right one — that is a legitimate and welcome answer.

---

## The setting

A deterministic pass grades video in Adobe Premiere Pro. It reads one frame of a clip, computes scope
statistics, chooses values for a set of Lumetri controls, writes them, and confirms with a second read.
No human in the loop. It must run in a few seconds per clip, of which the arithmetic budget is single-digit
milliseconds.

All values below are on a 0–100 IRE scale read from an 8-bit Rec.709 frame. One 8-bit code is **0.392 IRE**
and two frames of the same shot a second apart differ by about that much, so **0.4 IRE is the noise floor**:
any distinction finer than that is not measurable and must not be optimised for.

The operator Premiere applies is `clamp(f(v), 0, 100)` **per channel**, and the clamp happens **before** any
percentile is taken. Clipping (a channel at 100) and flooring (a channel at 0) destroy information
irreversibly.

---

## The problem

The pass must move a clip's **black point** — luma p1 — down to a target of about 4 IRE, and must also level
the three channel bottoms with respect to each other (a "black balance": a warm bottom has red sitting well
above blue, and the colorist's move is to bring them to a common meeting level).

It has **three instruments**, and they all spend the **same finite budget**: the distance between the lowest
channel's own p1 and zero. Spend too much and a channel floors, which is irreversible and visibly worse than
leaving the black point high.

### Instrument 1 — per-channel curve toes and lifts (RGB Curves)

Measured forms, exact (worst out-of-sample residual 0.153 and 0.28 IRE):

- toe, by position `x`:  `out = (v − 100x) / (1 − x)`
- lift, by position `y`: `out = 100y + v(1 − y)`

The toe's fixed point is at the **top** (100), so every level below comes down and spacing *widens* by
`1/(1−x)`. The lift raises a channel's floor and clips nothing.

The three channel toes **compose exactly** — verified identical to the digit on six rows. That is a genuine
three-way separability proof and the only one in the project.

These are the instrument for *balance* (moving channels relative to each other). Using them also moves the
black point, which is the coupling that makes this an allocation problem rather than three separate ones.

### Instrument 2 — the Master curve bottom point

Same measured line as the channel toe when unanchored. In practice the pass writes it **anchored**: the curve
is `(x,0) → (A,A) → (0.8,0.8) → (1,1)`, where `A = clamp(p50/100, 0.3, 0.6)`. Measured: above the anchor the
curve is the identity; below it, the straight line from `(x,0)` to `(A,A)`. Predicting the swept four-point
spline with that form is accurate to **0.24 IRE**, so the anchor changes the midtones, not the black end.

The bottom point that puts p1 at target `t`:
- unanchored: `x = (p1 − t) / (100 − t)`
- anchored at `A`: `x = A(p1 − t) / (A − t)`

Currently hard-capped at `x ≤ 0.25`. This is the instrument for the **black point**. It is achromatic: it
cannot level the channels, and applied to an unlevel bottom it lowers the lowest channel fastest, so it
spends the budget on the channel that has least of it.

### Instrument 3 — the Shadows colour wheel's luma

An offset — Lumetri's nearest thing to a Lift. Measured properties:

- It **clips about 20× less** than a curve toe for the same black-point movement, and drags the midtones
  instead. So it is *cheap in budget* and *expensive in midtone position*.
- Its **magnitude does not transfer between frames**: the same move gave 6.6 IRE on one frame and 9.4 on
  another. By the project's own definition this disqualifies it as a form — it must be measured per frame or
  bounded, not predicted.
- It **changes channel spacing** by up to **3.2 IRE, in a frame-dependent direction.** Paired red-minus-blue
  from neutral: one frame 2.4 → 0.8, another 13.0 → 9.8, a third 29.4 → 30.6.

### The live defect this creates

The pass currently runs: black balance (channel toes) at step 3 → Master bottom point at step 4 → Shadows
wheel luma at step 5, with nothing re-reading in between. At a real measured setting the wheel removed
~1.5 IRE of red-minus-blue — **the entire tolerance the black balance had been solved to**. The instrument
that exists to *finish* the job is partly undoing it.

That is a symptom. The disease is that these three were never made to compete for one budget in one equation.

---

## What the system currently does, and why it is not a solution

A fixed order with hard caps: channel toes first (each capped by its own channel's p1 with a margin), then
the Master bottom point (capped at 0.25 and by the lowest channel's remaining room), then the wheel luma,
but **only where the curve gave up** at its cap.

There is no objective function anywhere in this. Nobody has written down what is being minimised or subject
to what. The order was chosen by reasoning about colorist practice, and the caps were chosen to stop the
worst outcomes. It is a heuristic wearing the clothes of a method.

---

## What "good" means here — the acceptance criteria the pass is judged on

These are the project's own, and they are what an objective must be built from:

1. **Black point** at ~4 IRE. Above ~6 the picture reads flat and milky.
2. **Nothing floored, nothing clipped**, beyond whatever the untouched source already had.
3. **Channel bottoms meet** within about 2 IRE — *unless* the bottom is a coloured surface. When the parade
   ends are more than 20 IRE off neutral, that is the objects' own colour, not a cast, and the canon
   deliberately corrects only **half** of it and says so out loud. Forcing such a bottom to neutral is a
   worse error than leaving it.
4. **Body spread** (p90 − p10) at least ~45, or the picture reads flat.
5. Midtones not dragged away from where they should sit. This is the wheel luma's cost and is currently
   unpriced.

Criteria 1–4 are measured per frame and are the pass's scorecard. Today it balances 4 clips out of 18.

---

## What is asked of you

### A. The formulation

State it properly:

- **Decision variables.** Three channel toe/lift positions, a Master bottom point, a wheel luma offset — or
  a different parameterisation if you can justify one.
- **The objective.** What is minimised? Candidates the project has not chosen between: distance of the
  realised statistics from the acceptance targets; information destroyed (floored/clipped pixel mass);
  total distortion of the tone curve; some perceptual weighting. Pick one and defend it. Say explicitly what
  it does with criterion 3 (the coloured-bottom half-correction), which is a *target that depends on the
  reading*, not a fixed goal.
- **The constraints.** Include the irreversibility of clamping. Note that a floor constraint written on a
  percentile is not the same as one written on pixel mass, and say which you mean and why.
- Is it convex? Separable? If not, what structure does it have that an algorithm can exploit?

### B. The order

Given that clipping and flooring are irreversible and everything else is recoverable, **derive** the correct
order of operations rather than choosing one. Relevant facts you may use:

- For two controls of the form `f(v) = P + (v − P)k`, the two orders differ by `(kA − 1)(kB − 1)(PA − PB)`,
  **constant in level**. This is already proven and verified. So for pivot-gains the reversible part of
  ordering is fully understood; 24 of 36 realistic combinations of two such controls exceed the noise floor,
  worst 3.355 IRE.
- The three channel toes compose exactly (proven).
- The curve toes are *not* pivot-gains in the above sense — their fixed point is at the top of the range.
- The wheel luma is an offset whose magnitude is frame-dependent.

Does irreversibility actually fix a unique order here, or only a partial order? If only partial, what breaks
the remaining ties?

### C. The algorithm

It must run in single-digit milliseconds per clip and be deterministic — the same reading must always produce
the same grade. A 120,000-pixel sample of the frame is available and a full forward evaluation on it
(apply an operation to the pixels, recompute every statistic) costs about 6 ms, so a **small number** of
forward evaluations is affordable but a search is not.

Say how many forward evaluations your method needs and what it does when the budget is insufficient to meet
all targets — which is the common case, not the exception.

### D. The frame-dependent instrument

The wheel luma's magnitude does not transfer between frames. Options: measure it live with one forward
evaluation; bound it and treat the bound as the constraint; eliminate it from the allocation and use it only
as a residual corrector; or something better. Its 3.2 IRE spacing side-effect must be priced either way —
currently it is free in the model and expensive in reality.

---

## Constraints on your answer

- **Do not propose anything that requires a measurement the project does not have.** If your method needs a
  quantity nobody has measured, say exactly what would have to be measured and how, and give a fallback that
  works without it.
- **Do not optimise below 0.4 IRE.** Any objective whose optimum is determined by differences smaller than
  the noise floor is fitting noise.
- **Do not assume a statistic-space model is valid.** Predicting one percentile from another is known to be
  structurally wrong here: two images with identical percentiles respond differently to the same control, and
  a chain of such predictions can reach a state corresponding to no real image. That failure reached
  production. Pixel-space forward evaluation is available and is the trusted path.
- Be adversarial about your own formulation. If the honest answer is that the objective cannot be pinned down
  without a subjective judgement someone has to make, identify precisely what that judgement is and what the
  smallest number of parameters is that encodes it.

Return: the formulation, the order derivation, the algorithm, what you would measure next, and where you are
least confident.
