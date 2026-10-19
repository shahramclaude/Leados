import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import jsxA11y from "eslint-plugin-jsx-a11y";

export default defineConfig([
  // Keep the starter on the flat config export that actually runs under the pinned ESLint/Next toolchain.
  ...nextCoreWebVitals,
  // Explicitly wire in eslint-plugin-jsx-a11y's strict ruleset so accessibility is a build-breaking
  // lint gate (not just the subset eslint-config-next enables implicitly). eslint-config-next already
  // registers the "jsx-a11y" plugin object, so only the rule severities are merged in here —
  // re-declaring the `plugins` key would throw a "Cannot redefine plugin" config error.
  {
    rules: jsxA11y.flatConfigs.strict.rules,
  },
  {
    rules: {
      // The strict preset is intentionally noisy for autoFocus in app-shell overlays (modal/drawer/command
      // palette) where focus-trapping on open is the correct, accessible behaviour. Keep it a warning
      // instead of silencing it entirely so regressions are still visible.
      "jsx-a11y/no-autofocus": "warn",
      // Restore the standard ARIA listbox/menu authoring pattern (ul[role=listbox] > li[role=option], etc.)
      // that eslint-plugin-jsx-a11y's own "recommended" preset allows but "strict" does not pass options
      // for. Combobox, DropdownMenu and CommandPalette all rely on this pattern.
      "jsx-a11y/no-noninteractive-element-to-interactive-role": [
        "error",
        {
          ul: ["listbox", "menu", "menubar", "radiogroup", "tablist", "tree", "treegrid"],
          ol: ["listbox", "menu", "menubar", "radiogroup", "tablist", "tree", "treegrid"],
          li: ["menuitem", "menuitemradio", "menuitemcheckbox", "option", "row", "tab", "treeitem"],
          table: ["grid"],
          td: ["gridcell"],
          fieldset: ["radiogroup", "presentation"],
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
