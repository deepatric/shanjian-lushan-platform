import type { PropsWithChildren, ReactNode } from 'react';
import type { PlaceType, ReviewStatus } from '../types/domain';

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand-mark ${compact ? 'compact' : ''}`} aria-label="山鉴-庐山抗战文化景观数字平台">
      <span className="brand-mountain" aria-hidden="true">
        <img className="brand-logo-light" src={`${import.meta.env.BASE_URL}assets/brand/shanjian-logo-mark-b.webp`} alt="" />
        <img className="brand-logo-dark" src={`${import.meta.env.BASE_URL}assets/brand/shanjian-logo-mark-b-dark.webp`} alt="" />
      </span>
      <div className="brand-copy">
        <strong className="brand-title"><span>山</span><span>鉴</span></strong>
        {!compact && <small>庐山抗战文化景观数字平台</small>}
      </div>
    </div>
  );
}

export function Button({
  children,
  variant = 'primary',
  onClick,
  type = 'button',
  disabled,
}: PropsWithChildren<{ variant?: 'primary' | 'secondary' | 'ghost'; onClick?: () => void; type?: 'button' | 'submit'; disabled?: boolean }>) {
  return (
    <button className={`btn btn-${variant}`} onClick={onClick} type={type} disabled={disabled}>
      {children}
    </button>
  );
}

export function Panel({ title, meta, children, className = '', actions }: PropsWithChildren<{ title?: string; meta?: string; className?: string; actions?: ReactNode }>) {
  return (
    <section className={`panel ${className}`}>
      {(title || meta) && (
        <header className="panel-header">
          <div>
            {meta && <span className="eyebrow">{meta}</span>}
            {title && <h2>{title}</h2>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function TextField({ label, placeholder, value, onChange, type = 'text' }: { label: string; placeholder?: string; value?: string; onChange?: (value: string) => void; type?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} placeholder={placeholder} value={value ?? ''} readOnly={!onChange} onChange={(event) => onChange?.(event.target.value)} />
    </label>
  );
}

export function TextArea({ label, placeholder, value, onChange }: { label: string; placeholder?: string; value?: string; onChange?: (value: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea placeholder={placeholder} value={value ?? ''} readOnly={!onChange} onChange={(event) => onChange?.(event.target.value)} />
    </label>
  );
}

export function StatusBadge({ status }: { status: ReviewStatus }) {
  const labels: Record<ReviewStatus, string> = { pending: '待审核', approved: '已通过', rejected: '已驳回' };
  return <span className={`status status-${status}`}>{labels[status]}</span>;
}

export function TypeBadge({ type }: { type: PlaceType }) {
  const labels: Record<PlaceType, string> = { battle: '战斗地点', event: '事件地点', heritage: '遗址地点' };
  return <span className={`type-badge type-${type}`}>{labels[type]}</span>;
}

export function EmptyState({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}

export function FeedbackDialog({
  open,
  title,
  message,
  tone = 'success',
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  tone?: 'success' | 'warning' | 'error' | 'info';
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="feedback-overlay" role="presentation" onClick={onClose}>
      <section className={`feedback-dialog feedback-${tone}`} role="dialog" aria-modal="true" aria-labelledby="feedback-title" onClick={(event) => event.stopPropagation()}>
        <span className="feedback-mark" aria-hidden="true">{tone === 'success' ? '✓' : tone === 'info' ? 'i' : '!'}</span>
        <div>
          <h2 id="feedback-title">{title}</h2>
          <p>{message}</p>
        </div>
        <button type="button" className="feedback-close" onClick={onClose}>确定</button>
      </section>
    </div>
  );
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  renderActions,
}: {
  columns: Array<{ key: keyof T | string; label: string; render?: (row: T) => ReactNode }>;
  rows: T[];
  renderActions?: (row: T) => ReactNode;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => <th key={String(column.key)}>{column.label}</th>)}
            {renderActions && <th>操作</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((column) => <td key={String(column.key)}>{column.render ? column.render(row) : String(row[column.key as keyof T] ?? '')}</td>)}
              {renderActions && <td className="row-actions">{renderActions(row)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
