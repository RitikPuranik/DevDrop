# Skills benchmark (offline) - 2026-10-30

Unverified-license skills (ui-ux-pro-max, vercel-react-best-practices) enabled: no (default).

Token figures are estimates (characters / 4) of the text appended to system prompts. The code stage is multiplied by 5 UI source files (an assumption, not a measurement). Measured with the real library; no model was called.

| Case | Condition | requirements | design | architecture | code (per file) | integration | debug | deployment | total per site (est.) |
|---|---|---|---|---|---|---|---|---|---|
| portfolio | A baseline (no skills) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| portfolio | B + frontend-design only | 0 | 2698 | 0 | 0 | 0 | 0 | 0 | 2698 |
| portfolio | C + engineering skills only | 0 | 0 | 1413 | 1749 | 1111 | 1607 | 1074 | 13950 |
| portfolio | D full skills + design intelligence | 643 | 4008 | 2654 | 3291 | 1442 | 1607 | 1074 | 27883 |
| saas | A baseline (no skills) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| saas | B + frontend-design only | 0 | 2698 | 0 | 0 | 0 | 0 | 0 | 2698 |
| saas | C + engineering skills only | 0 | 0 | 1413 | 1749 | 1111 | 1607 | 1074 | 13950 |
| saas | D full skills + design intelligence | 643 | 4008 | 2659 | 3291 | 1442 | 1607 | 1074 | 27888 |
| restaurant | A baseline (no skills) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| restaurant | B + frontend-design only | 0 | 2698 | 0 | 0 | 0 | 0 | 0 | 2698 |
| restaurant | C + engineering skills only | 0 | 0 | 1413 | 1749 | 1111 | 1607 | 1074 | 13950 |
| restaurant | D full skills + design intelligence | 643 | 4008 | 2657 | 3291 | 1442 | 1607 | 1074 | 27886 |
| ecommerce | A baseline (no skills) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ecommerce | B + frontend-design only | 0 | 2698 | 0 | 0 | 0 | 0 | 0 | 2698 |
| ecommerce | C + engineering skills only | 0 | 0 | 1413 | 1749 | 1111 | 1616 | 1074 | 13959 |
| ecommerce | D full skills + design intelligence | 643 | 4008 | 2652 | 3272 | 1442 | 1616 | 1074 | 27795 |
| dashboard (custom) | A baseline (no skills) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| dashboard (custom) | B + frontend-design only | 0 | 2698 | 0 | 0 | 0 | 0 | 0 | 2698 |
| dashboard (custom) | C + engineering skills only | 0 | 0 | 1413 | 1749 | 1111 | 1616 | 1079 | 13964 |
| dashboard (custom) | D full skills + design intelligence | 643 | 4008 | 2652 | 3272 | 1442 | 1616 | 1079 | 27800 |
| blog | A baseline (no skills) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| blog | B + frontend-design only | 0 | 2698 | 0 | 0 | 0 | 0 | 0 | 2698 |
| blog | C + engineering skills only | 0 | 0 | 1413 | 1749 | 1111 | 1607 | 1074 | 13950 |
| blog | D full skills + design intelligence | 643 | 4008 | 2647 | 3291 | 1442 | 1607 | 1074 | 27876 |

Average estimated skill tokens added per generated site: A baseline (no skills): 0; B + frontend-design only: 2698; C + engineering skills only: 13954; D full skills + design intelligence: 27855.

## Design specification (condition D only)

| Case | variant | composition | sections | components | valid | required fields present |
|---|---|---|---|---|---|---|
| portfolio | case-study-stack | image-led | 6 | 6 | yes | 10/10 |
| saas | product-demo | content-led | 8 | 8 | yes | 10/10 |
| restaurant | story-led | image-led | 7 | 7 | yes | 10/10 |
| ecommerce | collection-story | image-led | 6 | 6 | yes | 10/10 |
| dashboard (custom) | sections-from-brief | content-led | 6 | 6 | yes | 10/10 |
| blog | magazine-front | content-led | 6 | 6 | yes | 10/10 |

Distinct page structures across 6 cases: 6. Spec generation deterministic: yes.
Resolver deterministic: yes.

## Not measured (require live Gemini generations and a browser)

- Build success rate: not run. No claim is made that conditions B-D improve it.
- Runtime (Playwright) success rate: not run. No claim is made that conditions B-D improve it.
- Visual consistency with requirements: not run. No claim is made that conditions B-D improve it.
- Responsive behaviour of generated pages: not run. No claim is made that conditions B-D improve it.
- Accessibility findings in generated pages: not run. No claim is made that conditions B-D improve it.
- Number of repair attempts: not run. No claim is made that conditions B-D improve it.
- Generation latency: not run. No claim is made that conditions B-D improve it.
- Dependency count of generated projects: not run. No claim is made that conditions B-D improve it.
- Real (provider-reported) token usage: not run. No claim is made that conditions B-D improve it.
