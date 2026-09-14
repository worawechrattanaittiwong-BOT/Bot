from pathlib import Path


def replace_between(path: str, start_marker: str, end_marker: str, replacement: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    start = text.find(start_marker)
    end = text.find(end_marker, start)
    if start < 0 or end < 0:
        raise SystemExit(f"target block not found in {path}: {start_marker}")
    text = text[:start] + replacement + text[end:]
    file.write_text(text, encoding="utf-8", newline="\n")


replace_between(
    "apps/web/app/dashboard/page.tsx",
    "  async function downloadInstallerForSlot(slotId: string) {",
    "\n\n  async function rebindDetectedAccount",
    '''  function submitInstallerDownload(code: string, version: string) {
    if (typeof document === "undefined") {
      throw new Error("เบราว์เซอร์ยังไม่พร้อมดาวน์โหลด SCENOVA Installer");
    }
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/installer-download";
    form.style.display = "none";
    const addField = (name: string, value: string) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.appendChild(input);
    };
    addField("code", code);
    addField("version", version);
    document.body.appendChild(form);
    form.submit();
    window.setTimeout(() => form.remove(), 1000);
  }

  async function downloadInstallerForSlot(slotId: string) {
    const result = await api("/bot/installers/windows", {
      method: "POST",
      body: JSON.stringify({ slotId: slotId || undefined })
    });
    const code = String(result?.code || "").trim();
    const version = String(result?.installerVersion || "").trim();
    if (!code || !version) {
      throw new Error("ยังไม่มี SCENOVA Windows Installer สำหรับบัญชีนี้");
    }
    submitInstallerDownload(code, version);
    return result;
  }'''
)

replace_between(
    "apps/web/components/Mt5ManualActionControls.tsx",
    "  function downloadInstaller() {",
    "\n\n  async function runOneClickUpdate",
    '''  async function downloadInstaller() {
    if (typeof document === "undefined" || !slotId) return false;
    const result = await api("/bot/installers/windows", {
      method: "POST",
      body: JSON.stringify({ slotId })
    });
    const code = String(result?.code || "").trim();
    const version = String(result?.installerVersion || installerVersion || "").trim();
    if (!code || !version) {
      throw new Error("ยังไม่มี SCENOVA Windows Installer สำหรับบัญชีนี้");
    }

    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/installer-download";
    form.style.display = "none";
    for (const [name, value] of [["code", code], ["version", version]]) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
    window.setTimeout(() => form.remove(), 1000);
    return true;
  }'''
)

controls = Path("apps/web/components/Mt5ManualActionControls.tsx")
controls_text = controls.read_text(encoding="utf-8")
controls_text = controls_text.replace("      downloadInstaller();\n", "      await downloadInstaller();\n")
controls.write_text(controls_text, encoding="utf-8", newline="\n")

runtime = Path("tools/windows-installer/Runtime.cs")
runtime_text = runtime.read_text(encoding="utf-8")
marker = "        return code.Length >= 12 ? code : null;"
if marker not in runtime_text:
    raise SystemExit("Runtime enrollment return not found")
if "duplicateMarker" not in runtime_text:
    addition = '''        // Browsers may append " (1)", " (2)", ... when the same
        // personalized installer is downloaded more than once. Strip only that
        // local duplicate suffix so the original enrollment code stays valid.
        var duplicateMarker = code.LastIndexOf(" (", StringComparison.Ordinal);
        if (duplicateMarker > 0 && code.EndsWith(")", StringComparison.Ordinal))
        {
            var suffix = code[(duplicateMarker + 2)..^1];
            if (int.TryParse(suffix, out _))
                code = code[..duplicateMarker].Trim();
        }

'''
    runtime_text = runtime_text.replace(marker, addition + marker, 1)
runtime.write_text(runtime_text, encoding="utf-8", newline="\n")

print("customer installer patch applied")
