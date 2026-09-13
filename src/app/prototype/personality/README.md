This prototype has moved into the existing app at `/personalities`. See [the current README](../../personalities/README.md). Old variant links redirect to the corresponding view.

# Personality curves prototype

Question: which view makes it easiest to compare real Big Five results against a reference curve?

Run `pnpm prototype:personality`, then visit http://localhost:3016/prototype/personality.

- `?variant=A` focuses on one trait, with everyone on the same curve.
- `?variant=B` stacks all five curves beside the selected person's results.
- `?variant=C` compares percentiles in a sortable matrix with a curve inspector.
- `?variant=D` ranks people by their root-mean-square z-score across all five traits, with signed trait distances for the selected person.
- `?variant=E` lets any scored person be the reference and ranks everyone else by their RMS trait differences. Click a match to inspect both profiles or open that person's ranked list. The reference remains available even when candidate filters hide them.

Closest-person distance uses `sqrt(sum(((candidate_trait - reference_trait) / reference_sd_trait) ** 2) / 5)`. It compares the full profiles, not the difference between their aggregate distances from the population means. Smaller is closer. Self matches and incomplete profiles are excluded, and ties sort by name. Both people use the selected snapshot preference with the existing fallback. Candidate filters never redefine the standard deviations.

Overall distance uses `sqrt(sum(z_trait ** 2) / 5)` relative to the saved reference means. Every trait has equal weight; positive and negative deviations do not cancel. Only complete, finite five-trait profiles qualify. The ranking respects person filters and snapshot preference. This is a descriptive distance in trait SD units, not a joint population z-score, percentile, or estimate of rarity. It does not adjust for trait correlations.

Use the floating arrows or the left and right keyboard arrows to switch views. Selections survive view switches. Reload resets selections. Each plotted dot and name can select a person. The source preference chooses one snapshot per person and falls back to their only result when there is no alternative.

This is throwaway code on `friends-curve-prototype`. No design has been selected for promotion. The route returns 404 outside development. The server binds to loopback. The import reads only local files and writes to gitignored `data/personality-prototype/snapshot.json`. Production file tracing excludes that directory. Personal results are not source code and must not be committed.

The importer reads workbook XML with Python's standard library and extracts two literal dictionaries from the old notebook using AST parsing. It never executes notebook cells, macros, or result URLs. Source locations appear in the interface. Test dates are unknown. The notebook's short name Gabi maps explicitly to Gabi Grengez. Other directory rows retain their own identities, including duplicate names among rows with no scores.

The reference means and standard deviations match across the directory and notebook. The older curve workbook has the same values on a 100-point scale; multiplying by 1.2 reproduces the saved 120-point reference. Cross-provider calibration is an inherited assumption, not a validated fact. Percentiles use a normal approximation to those saved norms. They are not empirical population percentiles or ranks among friends. No assessment result is averaged or silently overwritten.

The 120-point score ceiling comes from the notebook. Missing scores are excluded from curves, and overlapping dots stack vertically. Vertical dot placement has no statistical meaning. The normal curve extends beyond possible raw scores because it is an unbounded reference approximation.

Field Notes evaluation: this development-only tool fails quality-bar test 1, which requires a discovery for visitors. It has no visitor entry point, so no achievement is added.

Validation uses typechecking, targeted lint, HTTP compilation checks, and direct numerical comparison against the notebook. Browser inspection was not requested.
