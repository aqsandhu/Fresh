export function BrandLogo({
  size,
  className,
}: {
  size?: string;
  className?: string;
}) {
  return (
    <div data-testid="brand-logo" data-size={size} className={className}>
      FreshBazar
    </div>
  );
}

export default BrandLogo;
