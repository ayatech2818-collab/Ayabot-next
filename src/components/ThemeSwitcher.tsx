"use client";

import { useTheme, type ThemePreference } from "../hooks/useTheme";
import { MonitorIcon, MoonIcon, SunIcon } from "./icons";
import styles from "./ThemeSwitcher.module.css";

const OPTIONS: { value: ThemePreference; label: string; Icon: typeof SunIcon }[] = [
  { value: "system", label: "System", Icon: MonitorIcon },
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
];

export default function ThemeSwitcher() {
  const { preference, setPreference } = useTheme();

  return (
    <div className={styles.switcher} role="radiogroup" aria-label="Color theme">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={preference === value}
          aria-label={`${label} theme`}
          title={`${label} theme`}
          className={styles.option}
          onClick={() => setPreference(value)}
        >
          <Icon size={16} strokeWidth={1.9} />
        </button>
      ))}
    </div>
  );
}
