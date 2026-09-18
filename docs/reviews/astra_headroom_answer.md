**The right problem is constrained image correction, not allocation of one scalar “headroom” budget.** The budget is a set of per-pixel, per-channel constraints, and the wheel’s contribution is currently unknown.

A useful objective can be specified now. An exact optimum over all three instruments cannot honestly be promised under the stated measurement and computation limits. I would use a deterministic, one-candidate optimisation followed by pixel-space certification—and explicitly distinguish that from a global solver.

**A. Formulation**

First, two corrections to the premises.

A channel toe **is** a pivot-gain:

\[
T_x(v)=100+(v-100)\frac1{1-x}.
\]

The lift is also a gain about the same pivot:

\[
L_y(v)=100+(v-100)(1-y).
\]

Consequently, before clamping, toe and lift on the same channel collapse to one parameter:

\[
C_c(v)=100+k_c(v-100),\qquad k_c>0.
\]

Use a toe when \(k_c>1\), with \(x_c=1-1/k_c\); use a lift when \(k_c<1\), with \(y_c=1-k_c\). There is no reason to apply both and risk an unnecessary intermediate clamp.

Second, the anchored formula needs consistent units. Put \(a=100A\) in IRE and keep \(x\) normalised. Then

\[
M_x(v)=
\begin{cases}
a(v-100x)/(a-100x),&v<a,\\
v,&v\ge a,
\end{cases}
\]

before clamping. Solving \(M_x(p)=t\) gives

\[
x=\frac{a(p-t)}{100(a-t)}
 =\frac{A(p-t)}{100A-t}.
\]

The formula in the brief mixes normalised and IRE quantities. Moreover, this inversion applies to a scalar channel value; applying it directly to luma p1 is not generally valid when RGB components cross different branches.

Let \(I\) be the source sample. The decisions are

\[
\theta=(k_R,k_G,k_B,x,w,\pi),
\]

where \(w\) is the wheel setting and \(\pi\) the actual processing order. Freeze the anchor from the source reading. Let \(F_{\theta,\pi}(I)\) include **every intermediate clamp**.

Define output statistics:

- \(b\): luma p1.
- \(s\): luma p90 minus p10.
- \(d\): the vector of paired channel-bottom differences.
- \(m\): luma p50.

Use the project’s paired bottom measurements, not differences between independent channel percentiles. The repository explicitly records why the latter failed.

Freeze the colour target from the **original** reading:

\[
d^\star=
\begin{cases}
0,&\text{ordinary bottom},\\
\tfrac12d_0,&\text{coloured-bottom rule applies}.
\end{cases}
\]

Do not reclassify after correction or repeatedly halve the residual. The 20 IRE rule is a policy for preserving object colour, not proof that a surface is coloured.

For midtones, use an existing desired value if one exists; otherwise set \(m^\star=m_0\). That fallback means “preserve the current median,” not “the current median is aesthetically correct.”

I would minimise **acceptance violations**, with destruction prohibited separately. A concrete objective is

\[
\operatorname{lexmin}
\left(
\max(e_b,e_d,e_s,e_m),\
e_b+e_d+e_s+e_m,\
D
\right),
\]

where

\[
\begin{aligned}
e_b&=[|b-4|-0.4]_+,\\
e_d&=[\|d-d^\star\|_\infty-2]_+,\\
e_s&=[45-s]_+,\\
e_m&=[|m-m^\star|-\tau_m]_+,
\end{aligned}
\]

and \(D\) is mean absolute RGB displacement from the source, used only to break acceptance ties.

Quantise the violation values and \(D\) into 0.4 IRE bins before comparison. Resolve remaining ties by fewer active controls, then a fixed parameter order. Do not select a grade because its predicted improvement is 0.1 IRE.

This objective has a defensible meaning: **improve the worst unmet criterion first; once that is tied, reduce total unmet criteria; once those are tied, change less.** It stops rewarding extra contrast after spread reaches 45.

It also contains a subjective choice. Equal IRE deficits are treated as equally serious. Mathematics cannot establish that a 3 IRE spread deficit is equivalent to a 3 IRE black-point error.

The smallest explicit numerical parameter for this proposed policy is \(\tau_m\), the tolerated median displacement. A conservative fallback is 0.4 IRE. If equal weighting is rejected, four competing errors require three relative weights. Those are editorial choices, not quantities to infer from the sweep data.

For irreversibility, require **zero newly railed source-interior samples at every stage**:

\[
N_{\rm new}(\theta,\pi)
=
\#\{(i,c):0<I_{ic}<100,\ 
\exists j:\ I^{(j)}_{ic}\in\{0,100\}\}=0.
\]

In an 8-bit implementation, use the actual endpoint-code convention.

This is deliberately stronger than “the final floored percentage did not increase.” An aggregate count can hide newly destroyed pixels by lifting previously floored ones. A final-only check can hide flooring followed by a lift.

A p1 constraint is weaker still: it can permit destruction of almost the entire lowest 1%. Under literal “nothing new floored,” the limiting observation is the lowest positive sample, not p1.

This constraint is a guarantee about the **sample under the model**, not every pixel in the clip. Sample coverage, model error and other frames remain limitations.

The full problem is neither convex nor separable. Channel maps are separable, but luma ranking, paired-band membership, the Master curve, shared acceptance criteria and the wheel couple them. It has exploitable low-dimensional, piecewise-smooth structure: within fixed percentile ranks and curve branches, derivatives are straightforward. Across those boundaries, the objective changes pieces.

**B. What order actually follows**

Irreversibility does **not** establish a universal total order. It rules out destructive trajectories.

A simple example illustrates the distinction:

- Start with values 1 and 2.
- Subtract 3, clamp, then add 3: both become 3.
- Add 3, then subtract 3: they remain 1 and 2.

Here the lift must precede the downward move if those fixed moves are to preserve information. Near the upper rail, the corresponding argument can require a downward move before an upward one.

The derived rule is:

> Every prefix of the processing chain must preserve the protected samples. Among chains satisfying that condition, choose by the output objective.

That is a state-dependent feasibility restriction, not a universal “balance first” or “black point first.”

Several ordering decisions then follow:

1. **Collapse same-channel toe/lift combinations.** Their common pivot makes the unclamped combination one gain. Avoid the unnecessary intermediate rail risk.
2. **The three channel operations can run in any order.** They act on different components.
3. **Channel curves and anchored Master generally do not commute.** Within their affine branches, use the pivot commutator; across the anchor, evaluate the piecewise maps. Neither order is universally superior.
4. **If the wheel is used without a predictive model, measure its realised result before solving the final balance.** This is an information dependency, not a theorem that wheel-first always preserves more information.

The remaining ties are broken by acceptance error, then distortion, then implementation simplicity.

Also, changing parameter write order does not change Lumetri’s processing order. The repository records that alternative processing orders require stacked instances. Any proposed order must describe those instances, not the order of API calls.

**C. A deterministic algorithm within the budget**

At approximately 6 ms per complete forward evaluation, a strict single-digit-millisecond budget allows **one complete candidate evaluation**. Two already cost approximately 12 ms before optimisation.

I would use this bounded procedure:

1. **Freeze the source targets and baseline score.** Record the paired-bottom target, anchor, median target, percentile-support pixels and relevant band membership.
2. **Disable the wheel initially:** \(w=0\).
3. **Choose one supported processing order**, initially the existing Master-then-channel order in the forward model.
4. **Construct one local linear programme** jointly proposing the three channel gains and Master strength.
5. **Forward-evaluate that one candidate on the complete sample**, checking every intermediate rail event and recomputing all statistics and band membership.
6. **Accept only a safe, measurably better candidate. Otherwise retain the baseline.** Do not spend an unbudgeted second evaluation trying a reduced step.

Here is the local programme precisely enough to implement.

Write

\[
u_c=k_c-1,\qquad q=\frac{a}{a-100x}=1+h.
\]

Around identity, the pixel-space first-order change for either composition order is

\[
\Delta v_{ic}
=(v_{ic}-100)u_c
+\mathbf1_{v_{ic}<a}(v_{ic}-a)h.
\]

Build local statistic expressions from these **pixel derivatives**, holding the current percentile support and band membership fixed for proposal generation. For ties, use a deterministic convention. Express the hinge errors and minimax objective using ordinary LP slack variables.

Constrain control ranges, impose provisional rail constraints, and cap the predicted per-channel displacement—for example at 2 IRE for an initial conservative trust region. That cap is a numerical design choice, not a measured guarantee.

This gives a small, bounded-dimensional proposal problem. The complete pixel evaluation then decides whether rank changes, branch crossings and composition terms invalidate its predicted benefit. Evaluate the **serialized control values**, including whatever rounding the writer performs.

This is not the old statistic-space model: the local approximation comes from the actual image, and **no predicted statistic becomes accepted state**. Only the fully transformed image supplies the acceptance decision.

But it is also not an exact optimiser. It can reject a useful direction, stall at a rank boundary or miss a substantially better grade. A failed candidate means “no certified improvement found within this computation budget,” not “the targets are infeasible.”

The inexpensive proposal stage still needs benchmarking; the supplied 6 ms figure does not prove that proposal plus certification fits below 10 ms. If it does not, retain the baseline rather than claim a timing guarantee.

When targets compete, the stated minimax objective determines the compromise. Destruction never purchases better blacks. Report the remaining deficits separately: black point, residual colour, spread and median displacement.

For a stronger optimisation guarantee, relax one requirement: permit more evaluations, a restricted exact problem, or precomputed policies validated offline. The supplied facts do not justify a global optimum in one evaluation.

**D. The wheel**

For the strict-budget version, **exclude it**.

A software forward evaluation cannot measure an unknown Premiere response. One live render at one wheel setting measures that setting on that frame; it does not identify a transferable response curve or justify interpolation elsewhere.

Likewise, the observed 3.2 IRE spacing change is not an established worst-case bound. It cannot support robust optimisation as though it were one.

If one additional live render is affordable, the defensible alternative is:

1. Apply one predetermined wheel setting to the original source state.
2. Read its actual pixels.
3. Reject and restore it if it creates new damage or violates the chosen midtone allowance.
4. Treat the accepted wheel result as the input for subsequent curve allocation.
5. Keep the original colour target and midtone reference.

Its spacing side-effect then enters the measured balance error, and its median displacement enters \(e_m\). Neither is free.

Restoring parameters can recover the original render because the source remains available. What cannot recover information is adding downstream controls to an already clamped intermediate image.

This optional procedure costs an extra live render and is a different operating mode. It should not be disguised as a 6 ms arithmetic evaluation.

**What I would measure next**

- **Repeatability on the same frame and settings.** Separate render variation from adjacent-frame content variation.
- **Composed Master/channel behaviour in both supported orders**, especially near the anchor and rails. Individual-control residuals do not certify composition.
- **The exact endpoint convention and serialization error.** Quantisation can turn a nominally positive value into endpoint code zero.
- **Wheel baseline plus at least two nearby settings on the same frame**, recording pixels, paired colour differences and median displacement. This tests whether even a local response is usable.
- **Proposal-plus-certification runtime and acceptance rate** on the 18 clips, followed by held-out footage.

**Where I am least confident**

The weakest point is the one-candidate local proposal, particularly when the darkest pixels change rank. It gives bounded work and a trustworthy acceptance decision, but may improve too few clips.

The more fundamental uncertainty is aesthetic: the half-correction rule and desired median are policies. No allocation algorithm can deduce them from headroom. Make those choices explicit, then judge the solver on whether it respects them—not merely whether it reaches 4 IRE.
