from pathlib import Path

controller = Path("apps/api/src/bot.controller.ts")
text = controller.read_text()

old = '''    const instance = await this.getInstance(req.user.sub, slotId || null);
    if (instance.desired_state === "RUNNING" || instance.actual_state === "RUNNING") {
      throw new ConflictException(
        "การตั้งค่าถูกล็อกขณะบอทกำลังเริ่มหรือกำลังทำงาน · กดหยุดบอทและรอให้สถานะหยุดก่อนแก้ไข"
      );
    }
    const clean: Record<string, any> = {};
'''

new = '''    const instance = await this.getInstance(req.user.sub, slotId || null);

    // Keep strategy/risk settings immutable while Start is pending or the EA is
    // RUNNING. Daily Profit Target is the one intentional live exception: the
    // runtime contract already supports raising/disabling this target to release
    // a DAILY_PROFIT_LOCK, and integration cleanup also restores it while RUNNING.
    // Restrict the exception to this single key so callers cannot smuggle other
    // settings through the live-update path.
    const requestedSettingKeys = Object.keys(body).filter(
      (key) => body[key] !== undefined
    );
    const isLiveDailyProfitTargetEdit =
      requestedSettingKeys.length === 1 &&
      requestedSettingKeys[0] === "dailyProfitTargetMoney";

    if (
      (instance.desired_state === "RUNNING" || instance.actual_state === "RUNNING") &&
      !isLiveDailyProfitTargetEdit
    ) {
      throw new ConflictException(
        "การตั้งค่าถูกล็อกขณะบอทกำลังเริ่มหรือกำลังทำงาน · กดหยุดบอทและรอให้สถานะหยุดก่อนแก้ไข"
      );
    }
    const clean: Record<string, any> = {};
'''

if old not in text:
    raise SystemExit("expected settings-lock block not found; refusing unsafe patch")

controller.write_text(text.replace(old, new, 1))

# One-shot cleanup: the workflow commits these deletions together with the fix.
for temporary in (
    Path(".github/workflows/apply-daily-profit-settings-lock-fix.yml"),
    Path("scripts/apply-daily-profit-settings-lock-fix.py"),
):
    if temporary.exists():
        temporary.unlink()
