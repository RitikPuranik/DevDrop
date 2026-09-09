"""
Dynamic Gemini Project Pool.

Business logic for scheduling requests across an arbitrary number of
Gemini projects/credentials. Persistence lives in
storage/gemini_pool_*.py; this package is everything above that layer:

- errors.py     — one central Gemini error classifier (Section 16)
- scoring.py    — deterministic candidate ranking (Section 9)
- scheduler.py  — eligibility + selection + lease + usage/health recording
                  (Sections 7-15)
- lifecycle.py  — add/remove/enable/disable/test (Sections 4, 21)

providers/gemini_pool_provider.py is the AIProvider that wires this
package into the existing provider abstraction — see that module for how
agents end up using this pool without ever knowing it exists (Section 32).
"""
