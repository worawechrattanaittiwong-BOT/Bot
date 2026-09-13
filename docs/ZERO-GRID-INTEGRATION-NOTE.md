# ZERO GRID integration note

ZERO GRID may add shared dispatch checks only where required to select the engine. These checks must not change existing AUTO/RACE calculations, thresholds, lot logic, rescue logic or exit rules.

The intended control flow is:

`ZERO_GRID selected -> ZERO GRID handler -> return`

Otherwise the existing flow continues unchanged:

`RACE selected/owned -> existing RACE handler`

`AUTO/ASSISTED/MANUAL -> existing handlers`

No existing engine is allowed to adopt positions or pending orders tagged as ZERO GRID, and ZERO GRID is not allowed to adopt existing positions from another engine.
