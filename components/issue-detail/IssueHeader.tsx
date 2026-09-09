"use client";

import { StatusBadge } from "./StatusBadge";
import { SkeletonLine } from "./PanelSkeleton";
import type { IssueDetail, IssueDetailPanelProps } from "./types";

type HeaderProps = Pick<IssueDetailPanelProps, "issueKey" | "jiraBaseUrl" | "onClose"> & {
  f: IssueDetail["fields"] | undefined;
  loading: boolean;
};

export default function IssueHeader({ issueKey, jiraBaseUrl, onClose, f, loading }: HeaderProps) {
  return (
    <div className="px-5 pt-5 pb-4 border-b border-border shrink-0 bg-background">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Issue key + type */}
          <div className="flex items-center gap-2 mb-2.5 flex-wrap">
            {jiraBaseUrl ? (
              <a
                href={`${jiraBaseUrl}/browse/${issueKey}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-primary bg-indigo-50 dark:bg-indigo-950/60 border border-primary/30 px-2.5 py-1 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors"
              >
                {issueKey}
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 8L8 2M8 2H4M8 2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            ) : (
              <span className="inline-flex items-center text-xs font-mono font-bold text-primary bg-indigo-50 dark:bg-indigo-950/60 border border-primary/30 px-2.5 py-1 rounded-lg">
                {issueKey}
              </span>
            )}
            {f && (
              <span className="text-xs font-medium text-muted-foreground bg-accent border border-border px-2.5 py-1 rounded-lg">
                {f.issuetype.name}
              </span>
            )}
          </div>
          {/* Summary */}
          {f && (
            <h2 className="text-base font-semibold text-foreground leading-snug">
              {f.summary}
            </h2>
          )}
          {loading && !f && (
            <div className="space-y-2 mt-1">
              <SkeletonLine w="1/3" h="3" />
              <SkeletonLine w="4/5" h="5" />
            </div>
          )}
        </div>
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close panel"
          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export { StatusBadge };
