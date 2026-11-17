import React from 'react';

interface BrandMarkProps {
  size?: number;
  active?: boolean;
}

export const BrandMark: React.FC<BrandMarkProps> = ({ size = 40, active = true }) => {
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <div className="absolute inset-0 rounded-full bg-primary/20 blur-md" />
      <div className="absolute inset-0 rounded-full border border-primary/40" />
      <div
        className={`absolute inset-[3px] rounded-full border border-dashed border-primary/50 ${
          active ? 'animate-orb-slow' : ''
        }`}
      />
      <div className="absolute inset-0 grid place-items-center">
        <div
          className={`rounded-full bg-primary ${active ? 'animate-orb' : ''}`}
          style={{ width: size * 0.3, height: size * 0.3 }}
        />
      </div>
    </div>
  );
};

interface SectionHeaderProps {
  label: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  label,
  title,
  description,
  actions,
}) => {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="mono-label">{label}</div>
        <h1 className="mt-1.5 font-heading text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {title}
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
};
