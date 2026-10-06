## Apple HIG — Design Rules (applies to ALL projects)

Follow Apple's Human Interface Guidelines in every UI we build:
native apps, web, and also visual material (offers, vignettes, graphics).
Native Apple apps follow HIG strictly. Everything else applies the same
principles, adapted to the medium.

### Principles
- Clarity: legible text, simple icons, purposeful decoration only.
- Deference: content first, UI stays out of the way.
- Depth: use layering, motion and hierarchy to show structure.

### Layout & touch
- Interactive targets at least 44x44 pt (also on web/mobile).
- Respect safe areas and generous margins; avoid cramped layouts.
- Use standard patterns: tab bar, navigation stack, sheets, familiar gestures.

### Typography
- Native: SF Pro with Dynamic Type (text must scale).
- Web/other: system font stack (-apple-system, system-ui, sans-serif);
  clear size hierarchy, no tiny text.

### Color & appearance
- Support light AND dark mode in every UI.
- Use semantic colors, not hard-coded values.
- Contrast at least 4.5:1 for body text.
- Never rely on color alone to convey meaning.

### Accessibility
- Labels for VoiceOver / aria-labels on all controls.
- Respect Reduce Motion; keep animations subtle and purposeful.
- Everything usable without precise gestures.

### Before finishing any UI task
Check: touch targets, dark mode, text scaling, contrast, labels.
Flag any deliberate deviation from HIG and explain why.
