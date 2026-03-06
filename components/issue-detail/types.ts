import type { AdfNode } from "@/lib/adfToHtml";
import type { JiraStatus, JiraIssueType, JiraUser, JiraIssueLink } from "@/lib/jira";

export interface IssueComment {
  id: string;
  author: JiraUser;
  body: AdfNode | null;
  created: string;
  updated: string;
}

export interface IssueDetail {
  id: string;
  key: string;
  fields: {
    summary: string;
    status: JiraStatus;
    issuetype: JiraIssueType;
    assignee: JiraUser | null;
    priority?: { name: string };
    labels?: string[];
    description: AdfNode | null;
    comment?: { comments: IssueComment[] };
    issuelinks?: JiraIssueLink[];
    parent?: { key: string; fields: { summary: string } };
    subtasks?: Array<{ key: string; fields: { summary: string; status: JiraStatus } }>;
    customfield_10016?: number | null;
    customfield_10028?: number | null;
  };
}

export interface IssueDetailPanelProps {
  issueKey: string;
  jiraBaseUrl: string;
  onClose: () => void;
  onNavigate?: (key: string) => void;
}
