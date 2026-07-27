# Fastlane agent rules

## User notifications and confirmations

- Never introduce native browser dialogs: `alert()`, `window.alert()`, `confirm()`, `window.confirm()`, `prompt()`, or `window.prompt()`.
- Use the shared `ToastViewport` and `ToastMessage` implementation from `components/ui/toast.tsx` for success, error, warning, and non-blocking feedback.
- For destructive confirmation, use a warning toast with explicit primary and secondary `ToastAction` buttons.
- If an action requires typed user input, use an accessible application modal/dialog for the input, then report the result with a toast. A toast must not be used as a substitute for an input form.
- Keep toast messages specific, concise, and written in Vietnamese to match the current interface.
- Before completing UI work, verify that no native dialogs were added:

  ```powershell
  rg -n "\b(window\s*\.\s*)?(alert|confirm|prompt)\s*\(" . --glob '!node_modules/**' --glob '!.next/**' --glob '!AGENTS.md'
  ```
## Interactive UI animation

- Rows, cards, or list items that open a detail popup must provide immediate pressed-state feedback when clicked.
- Detail popups and modals must animate both entry and exit. Reuse Framer Motion (`AnimatePresence` and `motion`) when it is already available in the project.
- Keep animations subtle and fast: fade the backdrop and use a small translate/scale transition for the dialog. Do not add animations that delay the user's action.
- Preserve keyboard activation and focus-visible styles when adding pointer animations.