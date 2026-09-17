from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EA = ROOT / "mt5/FastBasketBot.mq5"
text = EA.read_text(encoding="utf-8")


def replace_once(old: str, new: str):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"expected exactly one safety block, found {count}: {old[:120]!r}")
    text = text.replace(old, new, 1)


# A new flat cycle must never inherit the previous cycle's flip budget.
replace_once(
'''      ResetFlipLockRuntime(g_flipLockLastFlipAt==0);
      if(!NewModeOperationalEntryAllowed())''',
'''      ResetFlipLockRuntime(true);
      if(!NewModeOperationalEntryAllowed())'''
)

# Once armed, losing the protected floor must bank what remains instead of
# silently holding a winner until it can become a loser.
replace_once(
'''   if(profit>triggerProfit || profit<protectedFloor)
   {
      g_executionStatus=profit<protectedFloor
         ? "FLIP_LOCK_PROTECTED_FLOOR_LOST"
         : "FLIP_LOCK_ARMED";
      return;
   }
   if(TimeCurrent()-g_flipLockLastFlipAt<g_flipLockCooldownSeconds)''',
'''   if(profit<protectedFloor)
   {
      if(CloseAllBasket("FLIP_LOCK_PROTECTED_FLOOR"))
      {
         ResetTrail();
         ResetFlipLockRuntime(true);
         g_executionStatus="FLIP_LOCK_PROFIT_BANKED";
      }
      else
         g_executionStatus="FLIP_LOCK_FLOOR_CLOSE_RETRY";
      return;
   }
   if(profit>triggerProfit)
   {
      g_executionStatus="FLIP_LOCK_ARMED";
      return;
   }
   if(TimeCurrent()-g_flipLockLastFlipAt<g_flipLockCooldownSeconds)'''
)

# The configured value means actual opposite-side reopens. After the allowed
# count has been used, the next trigger banks the current leg without reopening.
replace_once(
'''   g_flipLockLastFlipAt=TimeCurrent();
   g_flipLockFlips++;
   ResetTrail();
   g_flipLockPeakProfit=0.0;
   g_flipLockArmed=false;

   if(g_flipLockFlips>g_flipLockMaxFlips)
   {
      g_executionStatus="FLIP_LOCK_MAX_FLIPS_BANKED";
      return;
   }
   if(!NewModeOperationalEntryAllowed())''',
'''   g_flipLockLastFlipAt=TimeCurrent();
   ResetTrail();
   g_flipLockPeakProfit=0.0;
   g_flipLockArmed=false;

   if(g_flipLockFlips>=g_flipLockMaxFlips)
   {
      g_executionStatus="FLIP_LOCK_MAX_FLIPS_BANKED";
      return;
   }
   g_flipLockFlips++;
   if(!NewModeOperationalEntryAllowed())'''
)

EA.write_text(text, encoding="utf-8")
print("production mode safety hardening applied")
