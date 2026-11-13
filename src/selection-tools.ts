import type { Comment } from './commentManager';

/** Shared by source, reading view and rendered tables. Colors are never raw CSS. */
export function markPresentation(comment: Comment, opacity: number): { className: string; style: string } {
    const fallback = comment.markType === 'text-color' ? '#dc2626' : '#ffc800';
    const color = /^#[0-9a-f]{6}$/i.test(comment.color || '') ? comment.color! : fallback;
    const r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
    const alpha = Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : .2;
    return {
        className: `sidenote-highlight${comment.isOrphaned ? ' orphaned' : ''} sidenote-mark-${comment.markType || 'highlight'}`,
        style: `--sidenote-text-color: ${color}; --sidenote-highlight-color: rgba(${r}, ${g}, ${b}, ${alpha}); ` +
            `--sidenote-highlight-hover: rgba(${r}, ${g}, ${b}, ${Math.min(alpha + .15, 1)}); ` +
            `--sidenote-highlight-border: rgba(${r}, ${g}, ${b}, ${Math.min(alpha + .4, 1)});`
    };
}
