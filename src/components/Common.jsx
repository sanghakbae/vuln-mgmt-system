import { badgeMap } from '../data/ui';

export function Card({ children, className = '' }) {
  return <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</div>;
}

export function Badge({ children }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-sm font-semibold ${badgeMap[children] || 'bg-slate-100 text-slate-700'}`}>
      {children}
    </span>
  );
}

export function SectionHeader({ title, desc, action }) {
  return (
    <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <div className="text-lg font-semibold">{title}</div>
        <div className="text-xs text-slate-500">{desc}</div>
      </div>
      {action}
    </div>
  );
}

export function KpiGrid({ items, toneMap }) {
  return (
    <section className={`grid gap-4 ${items.length === 3 ? 'grid-cols-3' : 'grid-cols-4'}`}>
      {items.map((item) => (
        <Card key={item.title} className={`p-4 sm:p-5 w-full ${toneMap[item.tone]}`}>
          <div className="text-xs font-medium text-slate-500">{item.title}</div>
          <div className="mt-2 text-2xl sm:text-4xl font-bold tracking-tight">{item.value}</div>
          <div className="mt-1 sm:mt-2 text-xs text-slate-500">{item.sub}</div>
        </Card>
      ))}
    </section>
  );
}
