#!/usr/bin/env bash
set -euo pipefail

# Requires:
#   sudo apt install xdotool x11-utils jq

windows_json="[]"
config_file="${XDG_DATA_HOME:-$HOME/.local/share}/control-strip/config.yaml"
excluded_titles=()
excluded_wm_classes=()

# Read exact window titles from:
# window_filters:
#   exclude_titles:
#     - "AtEase"
#     - "clippy"
#
# This intentionally parses only the simple window_filters.exclude_titles list,
# avoiding another runtime dependency just to read the existing YAML config.
if [ -f "$config_file" ]; then
  mapfile -t excluded_titles < <(
    awk '
      /^[[:space:]]*window_filters:[[:space:]]*$/ {
        in_window_filters = 1
        in_exclude_titles = 0
        next
      }
      in_window_filters && /^[[:space:]]+exclude_titles:[[:space:]]*$/ {
        in_exclude_titles = 1
        next
      }
      in_window_filters && in_exclude_titles && /^[[:space:]]+-[[:space:]]*/ {
        value = $0
        sub(/^[[:space:]]*-[[:space:]]*/, "", value)
        sub(/[[:space:]]+#.*$/, "", value)
        gsub(/^[[:space:]\"'"'"']+|[[:space:]\"'"'"']+$/, "", value)
        if (value != "") print value
        next
      }
      in_window_filters && in_exclude_titles && $0 !~ /^[[:space:]]*$/ {
        in_exclude_titles = 0
      }
      in_window_filters && /^[^[:space:]]/ {
        in_window_filters = 0
        in_exclude_titles = 0
      }
    ' "$config_file"
  )
  mapfile -t excluded_wm_classes < <(
    awk '
      /^[[:space:]]*window_filters:[[:space:]]*$/ { in_window_filters = 1; in_exclude = 0; next }
      in_window_filters && /^[[:space:]]+exclude_wm_classes:[[:space:]]*$/ { in_exclude = 1; next }
      in_window_filters && in_exclude && /^[[:space:]]+-[[:space:]]*/ {
        value = $0
        sub(/^[[:space:]]*-[[:space:]]*/, "", value)
        sub(/[[:space:]]+#.*$/, "", value)
        gsub(/^[[:space:]"'"'"']+|[[:space:]"'"'"']+$/, "", value)
        if (value != "") print tolower(value)
        next
      }
      in_window_filters && in_exclude && $0 !~ /^[[:space:]]*$/ { in_exclude = 0 }
      in_window_filters && /^[^[:space:]]/ { in_window_filters = 0; in_exclude = 0 }
    ' "$config_file"
  )
fi

is_excluded_wm_class() {
  local candidate="${1,,}"
  local excluded
  for excluded in "${excluded_wm_classes[@]}"; do
    if [ "$candidate" = "$excluded" ]; then return 0; fi
  done
  return 1
}

is_excluded_title() {
  local candidate="$1"
  local excluded

  for excluded in "${excluded_titles[@]}"; do
    if [ "$candidate" = "$excluded" ]; then
      return 0
    fi
  done

  return 1
}

# Do not use xdotool's --onlyvisible filter here. Minimized windows are still
# running application windows and must remain available to the Control Strip.
for id in $(xdotool search --name . 2>/dev/null || true); do
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

  # Shell components can opt out of Control Strip task tracking by exact title.
  is_excluded_title "$title" && continue

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

  wm_class_key="$wm_class_name"
  [ -n "$wm_class_key" ] || wm_class_key="$wm_class_instance"
  is_excluded_wm_class "$wm_class_key" && continue

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
