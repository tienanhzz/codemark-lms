---
name: animate-ui
description: Apply purposeful, accessible motion to LMS interfaces using Animate UI where the selected frontend stack supports it, guided by the project's design system.
---

# Animate UI integration

Use this guidance when designing or implementing LMS interface motion.

## Roles of the design tools

- If UI/UX Pro Max is available and approved for use, use it for the product's visual direction, layout, component hierarchy, typography, color, and accessibility requirements. Otherwise follow the project's design system and product requirements.
- Use Animate UI only as an optional implementation layer for interaction and transition primitives. It must not determine page structure, override the approved design system, or introduce motion for its own sake.
- If the application framework or component primitives are incompatible, implement the approved design with the existing stack instead of adding a new framework or replacing primitives.

## Integration constraints

- The application framework is not selected. Before adding Animate UI, confirm the framework, React/Vue version, component primitives, and Motion compatibility.
- Pin the package and all relevant versions. Never use a floating `@latest` install or run the upstream CLI as an automatic project-wide migration.
- Review every generated or copied diff manually. Do not vendor upstream component source or redistribute the components as a standalone bundle.
- Check the current source pin, license, dependencies, and distribution terms in [`../../../SOURCE_AUDIT.md`](../../../SOURCE_AUDIT.md) before adoption. The audited upstream license includes the Commons Clause.

## Motion and accessibility

- Animate only to clarify state changes, feedback, navigation, or hierarchy. Keep essential information available without animation.
- Respect the user's reduced-motion preference; remove or substantially reduce nonessential movement when it is enabled.
- Preserve keyboard operation, focus order, semantic controls, screen-reader announcements, and touch interaction. Do not make hover the only trigger or feedback.
- Keep transitions brief and non-blocking. Avoid animation that delays form submission, grading, autosave status, exam controls, or other time-sensitive tasks.
- Prefer transform and opacity for decorative motion; avoid costly layout animation on dense tables, long lists, and editor content.

## Review checklist

Before accepting a motion change, verify:

1. The behavior supports the interaction and follows the approved design direction.
2. Reduced-motion mode and keyboard/touch use remain usable.
3. Focus, validation errors, loading/saved states, and screen-reader output remain clear.
4. The change works at narrow and wide viewport sizes without affecting performance or task completion.
