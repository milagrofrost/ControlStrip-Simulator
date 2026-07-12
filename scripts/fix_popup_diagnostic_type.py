from pathlib import Path

path = Path('src/ControlStrip.ts')
text = path.read_text()
old = "  onOpenWindowMenu?: (item: ControlStripItem, anchor: { screenLeft: number; screenTop: number; width: number }) => void;"
new = "  onOpenWindowMenu?: (item: ControlStripItem, anchor: { screenLeft: number; screenTop: number; width: number; debugJson: string }) => void;"
if old not in text:
    raise SystemExit('onOpenWindowMenu type not found')
path.write_text(text.replace(old, new, 1))
