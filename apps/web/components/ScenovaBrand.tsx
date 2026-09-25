import { SCENOVA_MASTER_MARK } from "../lib/brand";

type ScenovaBrandProps = {
  className?: string;
};

export function ScenovaBrand({ className = "" }: ScenovaBrandProps) {
  return (
    <svg
      className={("scenova-brand-logo " + className).trim()}
      viewBox="0 0 1080 300"
      role="img"
      aria-label="SCENOVA"
      preserveAspectRatio="xMinYMid meet"
    >
      <title>SCENOVA</title>
      <image
        href={SCENOVA_MASTER_MARK}
        x="0"
        y="20"
        width="260"
        height="260"
        preserveAspectRatio="xMidYMid meet"
      />
      <text
        x="304"
        y="194"
        fill="currentColor"
        fontFamily="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
        fontSize="118"
        fontWeight="800"
        letterSpacing="18"
      >
        SCENOVA
      </text>
    </svg>
  );
}
