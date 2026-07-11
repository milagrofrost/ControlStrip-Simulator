from pathlib import Path

control_strip = Path('src/ControlStrip.ts')
text = control_strip.read_text()
old = "  pane.setAttribute('aria-label', item.label);\n  pane.title = item.error ? `${item.label}: ${item.error}` : item.label;\n"
new = "  pane.setAttribute('aria-label', item.error ? `${item.label}: ${item.error}` : item.label);\n"
if old not in text:
    raise SystemExit('pane tooltip block not found')
control_strip.write_text(text.replace(old, new, 1))

css = Path('src/ControlStrip.css')
css_text = css.read_text()
needle = '''.control-strip__pane {
  position: relative;
  box-sizing: border-box;
  width: 27px;
  min-width: 27px;
  max-width: 27px;
  height: 24px;
  background-repeat: no-repeat;
  background-position: 0 0;
  background-size: auto;
}
'''
replacement = '''.control-strip__pane {
  position: relative;
  box-sizing: border-box;
  width: 27px;
  min-width: 27px;
  max-width: 27px;
  height: 24px;
  background-repeat: no-repeat;
  background-position: 0 0;
  background-size: auto;
  cursor: pointer;
}
'''
if needle not in css_text:
    raise SystemExit('pane CSS block not found')
css_text = css_text.replace(needle, replacement, 1)
icon_needle = '''.control-strip__icon {
  position: absolute;
'''
icon_replacement = '''.control-strip__icon {
  position: absolute;
  pointer-events: none;
  user-select: none;
'''
if icon_needle not in css_text:
    raise SystemExit('icon CSS block not found')
css.write_text(css_text.replace(icon_needle, icon_replacement, 1))
