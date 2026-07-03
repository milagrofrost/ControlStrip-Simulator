#!/usr/bin/env bash
set -euo pipefail

# Requires:
#   sudo apt install xdotool x11-utils jq

windows_json="[]"

for id in $(xdotool search --onlyvisible --name . 2>/dev/null || true); do
  type_raw="$(xprop -id "$id" _NET_WM_WINDOW_TYPE 2>/dev/null || true)"
  state_raw="$(xprop -id "$id" _NET_WM_STATE 2>/dev/null || true)"
  name_raw="$(xprop -id "$id" _NET_WM_NAME 2>/dev/null || true)"
  class_raw="$(xprop -id "$id" WM_CLASS 2>/dev/null || true)"
  pid_raw="$(xprop -id "$id" _NET_WM_PID 2>/dev/null || true)"

  # Keep only normal app windows.
  echo "$type_raw" | grep -q "_NET_WM_WINDOW_TYPE_NORMAL" || continue

  # Skip things that explicitly ask not to appear in taskbars/pagers.
  echo "$state_raw" | grep -q "_NET_WM_STATE_SKIP_TASKBAR" && continue
  echo "$state_raw" | grep -q "_NET_WM_STATE_SKIP_PAGER" && continue

  # Extract title.
  title="$(
    echo "$name_raw" \
      | sed -n 's/^_NET_WM_NAME(UTF8_STRING) = "\(.*\)"$/\1/p'
  )"

  # Fallback if _NET_WM_NAME is missing.
  if [ -z "$title" ]; then
    title="$(
      xprop -id "$id" WM_NAME 2>/dev/null \
        | sed -n 's/^WM_NAME(STRING) = "\(.*\)"$/\1/p'
    )"
  fi

  # Extract WM_CLASS.
  # Usually: WM_CLASS(STRING) = "Navigator", "firefox"
  wm_class_instance="$(
    echo "$class_raw" \
      | sed -n 's/^WM_CLASS(STRING) = "\(.*\)", "\(.*\)"$/\1/p'
  )"

  wm_class_name="$(
    echo "$class_raw" \
      | sed -n 's/^WM_CLASS(STRING) = "\(.*\)", "\(.*\)"$/\2/p'
  )"

  # Extract PID if present.
  pid="$(
    echo "$pid_raw" \
      | sed -n 's/^_NET_WM_PID(CARDINAL) = \([0-9]*\)$/\1/p'
  )"

  windows_json="$(
    jq \
      --arg id "$id" \
      --arg title "$title" \
      --arg wm_class_instance "$wm_class_instance" \
      --arg wm_class "$wm_class_name" \
      --arg pid "$pid" \
      '. + [{
        id: $id,
        title: $title,
        wm_class_instance: $wm_class_instance,
        wm_class: $wm_class,
        pid: ($pid | if . == "" then null else tonumber end)
      }]' \
      <<< "$windows_json"
  )"
done

jq '.' <<< "$windows_json"
