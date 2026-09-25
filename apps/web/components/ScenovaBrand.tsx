import { SCENOVA_MASTER_LOGO } from "../lib/brand";

type ScenovaBrandProps = {
  className?: string;
};

export function ScenovaBrand({ className = "" }: ScenovaBrandProps) {
  return (
    <img
      className={("scenova-brand-logo " + className).trim()}
      src={SCENOVA_MASTER_LOGO}
      width={2172}
      height={724}
      alt="SCENOVA"
    />
  );
}
