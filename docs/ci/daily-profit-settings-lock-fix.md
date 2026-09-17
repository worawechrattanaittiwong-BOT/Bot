# Daily Profit live target regression

`dailyProfitTargetMoney` is intentionally allowed as the only live settings update while Start is pending or the EA is RUNNING.

This exception preserves the existing DAILY_PROFIT_LOCK recovery contract: raising or disabling the Daily Profit target can clear a stale SAFE_STOP and request Start again. All other strategy and risk settings remain locked while the bot is starting or running.

This file also provides a user-authored push after the one-shot hotfix commit so the normal CI and Integration Smoke workflows validate the final main branch state.
