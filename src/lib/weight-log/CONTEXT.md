# Weight Log

Chappy's bodyweight history since 2018, organized into bulk, cut, and maintenance phases with a weekly plan for each, plus his DEXA scans. The site is where he records it; the Weight Log spreadsheet is a read-only archive.

## Language

### Weighing

**Weigh-in**:
One bodyweight reading in pounds on a calendar day.
_Avoid_: Reading, entry, measurement

"Entry" survives only as the name of the Log Weight Shortcut's way in: `WEIGHT_LOG_ENTRY_TOKEN` and the "Entry from a Shortcut" section of `docs/weight-log.md`. It never names a weigh-in. The Shortcut's body is a weigh-in request (`WeighInRequest`).

**Week**:
Seven calendar days starting on a Monday, the unit of the plan and of averaging.
_Avoid_: Row

**Weekly average**:
The mean of a week's weigh-ins after dropping the highest and lowest when the week has three or more.
_Avoid_: Average weight, mean

**Excluded weigh-in**:
A weigh-in that stays on record but does not count toward its week's weekly average.
_Avoid_: Deleted weigh-in, outlier

### Planning

**Phase**:
A bounded stretch of weeks with one goal: bulk, cut, or maintenance. Phases never overlap.
_Avoid_: Tab, cycle, block

**Plan**:
A phase's target for each of its weeks.
_Avoid_: Projection, forecast, trend

**Target**:
The weekly average Chappy currently intends to reach in a given week.
_Avoid_: Goal weight, plan weight

**Original target**:
A week's target as first written when its phase began, never revised afterward.
_Avoid_: OG target, baseline

**Set point**:
A bodyweight Chappy treats as a long-term reference level, independent of any phase.
_Avoid_: Goal, target

### Body composition

**Scan**:
One DEXA total-body measurement of weight, lean mass, fat mass, and bone mineral content on a date.
_Avoid_: Body-fat test, Fit3D

**Body-fat estimate**:
The site's daily body-fat percentage between and after scans, derived from scans and weigh-ins.
_Avoid_: Bull/Bear, est bf%

## Relationships

- **Weight Log → Weightlifting**: Strength at Bodyweight reads weigh-ins to estimate bodyweight on each training day.
- **Weight Log → Apple Health**: weigh-ins are copied one way into Apple Health as Weight samples. Health never writes back.
- **Weight Log → Apple Health warehouse** (`~/Desktop/Agents/apple-health`): reads weigh-ins and phases from the Weight Log as its authoritative body mass.
- **Log Weight Shortcut → Weight Log**: writes the day's weigh-in with its own token, never deletes.
- **Weight Log spreadsheet → Weight Log**: imported once at cutover. Fit3D, SizeStream, tape measurements, and the FFMI sheet stay in the archive only.
