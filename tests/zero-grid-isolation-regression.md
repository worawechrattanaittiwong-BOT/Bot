# ZERO GRID isolation regression cases

1. Select AUTO before and after ZERO GRID integration; AUTO route and decision functions must remain available and unchanged.
2. Select RACE before and after ZERO GRID integration; RACE core section must be byte-identical.
3. Existing RACE basket ownership must still route to `ManageRaceBasket(momentum)`.
4. Existing AUTO basket management must still use `AutoManageOpenBasket(double momentum)`.
5. Adaptive basket additions must still route through `AdaptiveBasketAddAllowed(int direction)`.
6. Existing re-arm behavior must still expose `BrainV16RearmExistingBasket()`.
7. ZERO GRID must own only orders/positions tagged with the ZERO GRID comment prefix.
8. ZERO GRID routing may be added at shared dispatch points, but it must return before AUTO/RACE execution paths when ZERO GRID owns the cycle.
9. Switching away from ZERO GRID must not convert an existing AUTO/RACE basket into ZERO GRID ownership.
10. A failed isolation check blocks merge.
