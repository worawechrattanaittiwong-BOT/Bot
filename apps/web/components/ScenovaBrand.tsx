type ScenovaBrandProps = {
  className?: string;
};

export function ScenovaBrand({ className = "" }: ScenovaBrandProps) {
  return (
    <img
      className={("scenova-brand-logo " + className).trim()}
      src="/assets/scenova-brand-logo-v1.png"
      width={2172}
      height={724}
      alt="SCENOVA"
    />
  );
}
