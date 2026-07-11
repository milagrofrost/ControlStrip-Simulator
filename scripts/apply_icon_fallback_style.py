from pathlib import Path

control_strip = Path('src/ControlStrip.ts')
text = control_strip.read_text()
text = text.replace(
    "  icon.className = 'control-strip__icon';\n  if (item.icon) {",
    "  icon.className = ['control-strip__icon', item.icon ? 'has-image' : 'has-text']\n    .filter(Boolean)\n    .join(' ');\n  if (item.icon) {",
    1,
)
text = text.replace(
    "function getPlaceholderIcon(label: string): string {\n  return label.trim().charAt(0).toUpperCase() || '?';\n}",
    "function getPlaceholderIcon(label: string): string {\n  const trimmed = label.trim();\n  return trimmed.slice(0, 2) || '?';\n}",
    1,
)
control_strip.write_text(text)

css = Path('src/ControlStrip.css')
css_text = css.read_text()
old = '''.control-strip__icon {
  position: absolute;
  left: 50%;
  top: 50%;
  display: grid;
  width: 13px;
  height: 13px;
  place-items: center;
  transform: translate(-50%, -50%);
  border: 1px solid #111;
  background: #fff;
  color: #111;
  font-family: Geneva, Arial, sans-serif;
  font-size: 8px;
  font-weight: 700;
  line-height: 1;
}

.control-strip__icon-image {
  display: block;
  max-width: 11px;
  max-height: 11px;
}
'''
new = '''.control-strip__icon {
  position: absolute;
  left: 50%;
  top: 50%;
  display: grid;
  place-items: center;
  transform: translate(-50%, -50%);
  color: #111;
  font-family: Geneva, Arial, sans-serif;
  font-size: 8px;
  font-weight: 700;
  line-height: 1;
}

.control-strip__icon.has-text {
  width: 13px;
  height: 13px;
  border: 1px solid #111;
  background: rgb(255 255 255 / 50%);
}

.control-strip__icon.has-image {
  width: 16px;
  height: 16px;
}

.control-strip__icon-image {
  display: block;
  width: 16px;
  height: 16px;
  object-fit: contain;
}
'''
if old not in css_text:
    raise SystemExit('icon CSS block not found')
css.write_text(css_text.replace(old, new, 1))
