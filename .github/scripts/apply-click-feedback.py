from pathlib import Path

path = Path('src/ControlStrip.ts')
text = path.read_text()

text = text.replace(
    "const longPressDelayMs = 500;\nconst defaultSnapBackDelayMs = 10000;",
    "const longPressDelayMs = 500;\nconst clickFeedbackDurationMs = 500;\nconst clickFeedbackFirstReleaseMs = 120;\nconst clickFeedbackSecondPressMs = 210;\nconst clickFeedbackSecondReleaseMs = 330;\nconst defaultSnapBackDelayMs = 10000;",
    1,
)

text = text.replace(
    "  let contentResizeFrame: number | null = null;\n  const eventController = new AbortController();",
    "  let contentResizeFrame: number | null = null;\n  const paneActivationLocks = new Set<string>();\n  const clickFeedbackPressedItems = new Set<string>();\n  const clickFeedbackTimers = new Map<string, number[]>();\n  const eventController = new AbortController();",
    1,
)

text = text.replace(
    "        element.classList.toggle('is-pressed', pressedPart === part);\n        element.style.backgroundImage = `url(\"${getPaneAsset(item, pressedPart === part)}\")`;",
    "        const isPressed = pressedPart === part || clickFeedbackPressedItems.has(itemId);\n        element.classList.toggle('is-pressed', isPressed);\n        element.style.backgroundImage = `url(\"${getPaneAsset(item, isPressed)}\")`;",
    1,
)

marker = "  const closeWindowMenu = (): void => {"
insert = """  const clearClickFeedback = (itemId: string): void => {
    for (const timer of clickFeedbackTimers.get(itemId) ?? []) {
      window.clearTimeout(timer);
    }
    clickFeedbackTimers.delete(itemId);
    clickFeedbackPressedItems.delete(itemId);
    paneActivationLocks.delete(itemId);
    updatePressedVisuals();
  };

  const startClickFeedback = (item: ControlStripItem): boolean => {
    if (paneActivationLocks.has(item.id)) {
      return false;
    }

    paneActivationLocks.add(item.id);
    clickFeedbackPressedItems.add(item.id);
    updatePressedVisuals();

    const timers = [
      window.setTimeout(() => {
        clickFeedbackPressedItems.delete(item.id);
        updatePressedVisuals();
      }, clickFeedbackFirstReleaseMs),
      window.setTimeout(() => {
        clickFeedbackPressedItems.add(item.id);
        updatePressedVisuals();
      }, clickFeedbackSecondPressMs),
      window.setTimeout(() => {
        clickFeedbackPressedItems.delete(item.id);
        updatePressedVisuals();
      }, clickFeedbackSecondReleaseMs),
      window.setTimeout(() => {
        clickFeedbackTimers.delete(item.id);
        clickFeedbackPressedItems.delete(item.id);
        paneActivationLocks.delete(item.id);
        updatePressedVisuals();
      }, clickFeedbackDurationMs)
    ];

    clickFeedbackTimers.set(item.id, timers);
    return true;
  };

"""
if marker not in text:
    raise SystemExit('closeWindowMenu marker not found')
text = text.replace(marker, insert + marker, 1)

text = text.replace(
    "      if (item) {\n        activatePane(item, options);\n      }",
    "      if (item && startClickFeedback(item)) {\n        activatePane(item, options);\n      }",
    1,
)

text = text.replace(
    "      const item = activePanePress.item;\n      activePanePress = null;\n      clearPressedPart();\n      activatePane(item, options);\n      return;",
    "      const item = activePanePress.item;\n      activePanePress = null;\n      clearPressedPart();\n      if (startClickFeedback(item)) {\n        activatePane(item, options);\n      }\n      return;",
    1,
)

text = text.replace(
    "      if (event.button !== 0) {\n        return;\n      }\n\n      const rect = pane.getBoundingClientRect();",
    "      if (event.button !== 0) {\n        return;\n      }\n\n      if (paneActivationLocks.has(item.id)) {\n        event.preventDefault();\n        return;\n      }\n\n      const rect = pane.getBoundingClientRect();",
    1,
)

text = text.replace(
    "    clearLongPressTimer();\n    clearSnapBackTimer();\n    if (contentResizeFrame !== null) {",
    "    clearLongPressTimer();\n    clearSnapBackTimer();\n    for (const itemId of [...clickFeedbackTimers.keys()]) {\n      clearClickFeedback(itemId);\n    }\n    if (contentResizeFrame !== null) {",
    1,
)

path.write_text(text)
