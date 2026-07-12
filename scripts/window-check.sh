#!/usr/bin/env bash
set -euo pipefail

# Requires:
#   sudo apt install xdotool x11-utils jq

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

quoted_value() {
  local value="$1"

  if [[ "$value" =~ ^[^=]+=\ \"(.*)\"$ ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
  fi
}

emit_windows() {
  local id properties line
  local has_normal skip_taskbar skip_pager title fallback_title wm_class_instance wm_class_name wm_class_key pid

  # Do not use xdotool's --onlyvisible filter here. Minimized windows are still
  # running application windows and must remain available to the Control Strip.
  while IFS= read -r id; do
    [ -n "$id" ] || continue

    properties="$(
      xprop -id "$id" \
        _NET_WM_WINDOW_TYPE \
        _NET_WM_STATE \
        _NET_WM_NAME \
        WM_NAME \
        WM_CLASS \
        _NET_WM_PID \
        2>/dev/null || true
    )"

    has_normal=0
    skip_taskbar=0
    skip_pager=0
    title=""
    fallback_title=""
    wm_class_instance=""
    wm_class_name=""
    pid=""

    while IFS= read -r line; do
      case "$line" in
        _NET_WM_WINDOW_TYPE*)
          [[ "$line" == *"_NET_WM_WINDOW_TYPE_NORMAL"* ]] && has_normal=1
          ;;
        _NET_WM_STATE*)
          [[ "$line" == *"_NET_WM_STATE_SKIP_TASKBAR"* ]] && skip_taskbar=1
          [[ "$line" == *"_NET_WM_STATE_SKIP_PAGER"* ]] && skip_pager=1
          ;;
        "_NET_WM_NAME(UTF8_STRING) = "*)
          title="$(quoted_value "$line")"
          ;;
        "WM_NAME(STRING) = "*)
          fallback_title="$(quoted_value "$line")"
          ;;
        "WM_CLASS(STRING) = "*)
          # Usually: WM_CLASS(STRING) = "Navigator", "firefox"
          if [[ "$line" =~ ^WM_CLASS\(STRING\)\ =\ \"(.*)\",\ \"(.*)\"$ ]]; then
            wm_class_instance="${BASH_REMATCH[1]}"
            wm_class_name="${BASH_REMATCH[2]}"
          fi
          ;;
        "_NET_WM_PID(CARDINAL) = "*)
          pid="${line#*= }"
          [[ "$pid" =~ ^[0-9]+$ ]] || pid=""
          ;;
      esac
    done <<< "$properties"

    [ "$has_normal" -eq 1 ] || continue
    [ "$skip_taskbar" -eq 0 ] || continue
    [ "$skip_pager" -eq 0 ] || continue

    [ -n "$title" ] || title="$fallback_title"

    # Shell components can opt out of Control Strip task tracking by exact title.
    is_excluded_title "$title" && continue

    wm_class_key="$wm_class_name"
    [ -n "$wm_class_key" ] || wm_class_key="$wm_class_instance"
    is_excluded_wm_class "$wm_class_key" && continue

    jq -n \
      --arg id "$id" \
      --arg title "$title" \
      --arg wm_class_instance "$wm_class_instance" \
      --arg wm_class "$wm_class_name" \
      --arg pid "$pid" \
      '{
        id: $id,
        title: $title,
        wm_class_instance: $wm_class_instance,
        wm_class: $wm_class,
        pid: ($pid | if . == "" then null else tonumber end)
      }'
  done < <(xdotool search --name . 2>/dev/null || true)
}

emit_windows | jq -s '.'
