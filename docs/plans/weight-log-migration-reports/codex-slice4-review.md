No high-severity findings. The endpoint looks sound; the remaining issues are in the Shortcuts.

- **Medium — Travel can defeat deduplication.** [build_shortcut.py:1204](/Users/chappyasel/Desktop/Agents/apple-health/shortcut/build_shortcut.py:1204) formats existing timestamps without a fixed time zone; line 1252 creates new samples at local 07:00. A November 5 sample written in Tokyo becomes November 4 when checked in New York. November 5 can be written again, and November 4 incorrectly skipped. **Fix:** use one stable time zone for both timestamp creation and date-key extraction, or preserve the original calendar-date identity.

- **Medium — The 60-day Find can block recovery indefinitely.** [build_shortcut.py:1289](/Users/chappyasel/Desktop/Agents/apple-health/shortcut/build_shortcut.py:1289). After more than 60 days without a Health sample, a new website weigh-in still encounters the documented “No Samples Found” modal. Unattended runs cannot reach the write that would restore progress. **Fix:** skip Find for empty website responses; use an empty-safe lookup or a broader historical lookup after explicit bootstrap.

- **Low — Backfill deduplication expires.** [build_shortcut.py:251](/Users/chappyasel/Desktop/Agents/apple-health/shortcut/build_shortcut.py:251). After November 13, 2028, the earliest supported samples start falling outside the rolling 3,700-day lookup. Repeating 2018 then creates duplicates. **Fix:** cover the requested year explicitly, or reject backfills outside the lookup’s coverage.

- **Low — Structural validation accepts a broken duplicate guard.** [build_shortcut.py:2541](/Users/chappyasel/Desktop/Agents/apple-health/shortcut/build_shortcut.py:2541). Replacing the contains operand with unrelated literal text still passes `structural_check`, confirmed in memory. The [date test:84](/Users/chappyasel/Desktop/Agents/apple-health/shortcut/test_build_shortcut.py:84) checks serialized syntax, not parsing behavior. **Fix:** validate operand/output references and add mutation cases; verify date parsing and round-tripping before bulk writes.

Checked and found sound:

- Dedicated server-only token; unset/empty configuration fails closed. Authentication precedes validation and database access. Digest comparison exposes no token-prefix timing leak.
- Inclusive range validation handles leap years, invalid dates, reversed bounds, and the 366-day limit. SQL and response projection expose only date and pounds.
- Dynamic execution and private/no-store headers prevent normal route/CDN caching. Generated HEAD inherits authentication. Automatic OPTIONS returns method metadata only, though its advertised methods include refused writes.
- Other Weight Log procedures remain owner-only.
- Both plists match their builders. All original **210 actions remain unchanged**. Writes specify only Weight in `lb`; mirror-token fields and import defaults are empty.
- ISO date formatting matches the endpoint’s `YYYY-MM-DD` representation. [Apple documentation](https://support.apple.com/en-euro/guide/shortcuts/apdfd459e13d/ios)

Review used source inspection and in-memory checks. No files changed, live requests, or database writes. iOS parsing of `<date> 07:00` remains unverified.