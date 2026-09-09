"use client";

import { adfToHtml } from "@/lib/adfToHtml";
import { SectionHeader, Section } from "./StatusBadge";
import type { IssueDetail } from "./types";

interface IssueDescriptionProps {
  description: IssueDetail["fields"]["description"];
}

export default function IssueDescription({ description }: IssueDescriptionProps) {
  const descHtml = description ? adfToHtml(description) : null;
  return (
    <Section>
      <SectionHeader title="Description" />
      {descHtml ? (
        <div
          className="adf-content text-sm text-foreground leading-relaxed"
          dangerouslySetInnerHTML={{ __html: descHtml }}
        />
      ) : (
        <p className="text-sm text-muted-foreground italic">No description provided.</p>
      )}
    </Section>
  );
}
