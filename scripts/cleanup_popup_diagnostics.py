from pathlib import Path
import re

control = Path('src/ControlStrip.ts')
text = control.read_text()
text = text.replace('; debugJson: string', '')
text = text.replace('    debugJson: string;\n', '')
text = text.replace(',\n          debugJson: anchorRect.debugJson', '')
text = text.replace(',\n          debugJson: anchorRect.debugJson\n', '\n')
text = re.sub(
    r',\n\s*debugJson: JSON\.stringify\(\{.*?\n\s*\}\)\n\s*\};',
    '\n      };',
    text,
    count=1,
    flags=re.S,
)
control.write_text(text)

model = Path('src/controlStripModel.ts')
text = model.read_text()
text = text.replace('  debugJson: string;\n', '')
text = text.replace(',\n    debugJson: anchor.debugJson', '')
model.write_text(text)

lib = Path('src-tauri/src/lib.rs')
text = lib.read_text()
text = text.replace('    debug_json: String,\n', '')
text = re.sub(
    r'\n\s*let parent_position = window\.outer_position\(\).*?let parent_size = window\.outer_size\(\).*?;\n',
    '\n',
    text,
    count=1,
    flags=re.S,
)
text = re.sub(
    r'\n\s*eprintln!\("CONTROL_STRIP_POPUP_DEBUG BEGIN"\);.*?eprintln!\("native monitor \{monitor_debug\}"\);\n',
    '\n',
    text,
    count=1,
    flags=re.S,
)
text = text.replace('    let mut monitor_debug = String::from("none");\n', '')
text = re.sub(
    r'\n\s*monitor_debug = format!\(.*?\);',
    '',
    text,
    count=1,
    flags=re.S,
)
text = text.replace(
    '    // The Linux webview reports 0x0 geometry until GTK/X11 maps the window.\n'
    '    // Show it first, return control to the event loop, and then reinforce the\n'
    '    // requested physical geometry twice in case the window manager adjusts it.\n',
    '    // GTK/X11 may ignore geometry set before a transparent popup is mapped.\n'
    '    // Show it first, then reapply size and position twice after mapping; the\n'
    '    // second pass handles window managers that adjust placement after creation.\n'
)
lib.write_text(text)
