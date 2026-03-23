import type { Metadata } from "next";
import LegalLayout from "@/components/LegalLayout";

export const metadata: Metadata = {
  title: "Privacy Policy — TaskGraph",
  description: "How TaskGraph collects, uses, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" lastUpdated="23 March 2026">
      <h2>1. Who we are</h2>
      <p>
        TaskGraph is a personal project operated by Rasmus Skriver (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;), based in Denmark. If you have any questions about this policy, please contact us at{" "}
        <a href="mailto:skriver@live.dk">skriver@live.dk</a>.
      </p>

      <h2>2. What data we collect</h2>
      <p>
        We collect only the minimum data necessary to provide the service:
      </p>
      <ul>
        <li>
          <strong>Atlassian OAuth tokens</strong> — when you sign in with your Atlassian account, we receive an access token and a refresh token. These are stored exclusively in an encrypted, server-side HTTP-only session cookie and are never written to a database or logged.
        </li>
        <li>
          <strong>Jira site URL and email address</strong> — used to identify your Jira workspace and display your name/avatar in the UI. Not stored beyond the active session.
        </li>
        <li>
          <strong>Jira issue data</strong> — issue keys, summaries, statuses, assignees, and dependency links are fetched on demand from the Atlassian REST API and rendered directly in your browser. We do not persist this data on our servers.
        </li>
      </ul>
      <p>
        We do <strong>not</strong> collect analytics data, advertising identifiers, or any data unrelated to the core function of visualizing your Jira tasks.
      </p>

      <h2>3. How we use your data</h2>
      <p>Your data is used solely to:</p>
      <ul>
        <li>Authenticate requests to the Atlassian API on your behalf.</li>
        <li>Render the dependency graph in your browser.</li>
        <li>Maintain your session across page reloads (via the encrypted cookie).</li>
      </ul>
      <p>We do not sell, share, or disclose your data to any third parties except Atlassian, which is required to fulfil the service.</p>

      <h2>4. Third-party services</h2>
      <p>
        TaskGraph integrates with <strong>Atlassian</strong> (Jira Cloud) via their official OAuth 2.0 flow. By using TaskGraph, you are also subject to{" "}
        <a href="https://www.atlassian.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">
          Atlassian&apos;s Privacy Policy
        </a>
        . We do not use any other third-party analytics, tracking, or data-processing services.
      </p>

      <h2>5. Cookies</h2>
      <p>
        We use a single <strong>HTTP-only, secure, encrypted session cookie</strong> named <code>taskgraph-session</code>. This cookie contains your Atlassian OAuth tokens and is required for the application to function. It is not used for advertising or tracking and expires when your session ends or after a fixed period of inactivity.
      </p>
      <p>We do not use any tracking cookies, advertising cookies, or third-party cookies.</p>

      <h2>6. Data retention</h2>
      <p>
        Your OAuth tokens are held in the session cookie for as long as your session is active. When you sign out, the cookie is deleted immediately. No Jira data is stored on our servers at any time.
      </p>

      <h2>7. Your rights (GDPR)</h2>
      <p>
        If you are located in the European Economic Area, you have rights under the General Data Protection Regulation (GDPR), including the right to access, rectify, or erase personal data we hold about you, and the right to object to or restrict processing.
      </p>
      <p>
        Because we do not store personal data beyond your active session cookie, exercising most of these rights is as simple as signing out. For any remaining questions or requests, contact us at{" "}
        <a href="mailto:skriver@live.dk">skriver@live.dk</a>.
      </p>

      <h2>8. Data security</h2>
      <p>
        All communication between your browser and TaskGraph uses HTTPS. Session cookies are encrypted at rest using a server-side secret key and are marked <code>HttpOnly</code> and <code>Secure</code> to prevent client-side access. We take reasonable precautions to protect the data in transit and at rest, though no system is completely secure.
      </p>

      <h2>9. Children&apos;s privacy</h2>
      <p>
        TaskGraph is not directed at children under the age of 16 and we do not knowingly collect personal data from children. If you believe a child has provided us with personal data, please contact us at{" "}
        <a href="mailto:skriver@live.dk">skriver@live.dk</a> and we will delete it.
      </p>

      <h2>10. Changes to this policy</h2>
      <p>
        We may update this Privacy Policy from time to time. When we do, we will update the &ldquo;Last updated&rdquo; date at the top of this page. Continued use of TaskGraph after changes are posted constitutes acceptance of the revised policy.
      </p>

      <h2>11. Contact</h2>
      <p>
        For privacy-related questions or requests, contact Rasmus Skriver at{" "}
        <a href="mailto:skriver@live.dk">skriver@live.dk</a>.
      </p>
    </LegalLayout>
  );
}
