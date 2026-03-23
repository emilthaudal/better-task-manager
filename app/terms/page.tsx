import type { Metadata } from "next";
import LegalLayout from "@/components/LegalLayout";

export const metadata: Metadata = {
  title: "Terms of Service — TaskGraph",
  description: "Terms governing your use of TaskGraph.",
};

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" lastUpdated="23 March 2026">
      <h2>1. Acceptance of terms</h2>
      <p>
        By accessing or using TaskGraph (&ldquo;the Service&rdquo;), you agree to be bound by these Terms of Service (&ldquo;Terms&rdquo;). If you do not agree to these Terms, do not use the Service. The Service is operated by Rasmus Skriver (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;), based in Denmark.
      </p>

      <h2>2. Description of the Service</h2>
      <p>
        TaskGraph is a web application that connects to your Atlassian Jira Cloud workspace via OAuth 2.0 and renders interactive dependency graphs of your Jira issues. The Service is provided free of charge for personal and internal business use.
      </p>

      <h2>3. Eligibility</h2>
      <p>
        You must be at least 16 years old and have a valid Atlassian account to use the Service. By using the Service you represent that you meet these requirements.
      </p>

      <h2>4. Permitted use</h2>
      <p>You may use the Service for lawful purposes only. You agree not to:</p>
      <ul>
        <li>Use the Service in any way that violates applicable laws or regulations, including Danish law and EU law.</li>
        <li>Attempt to gain unauthorized access to any part of the Service or any connected systems.</li>
        <li>Reverse-engineer, decompile, or otherwise attempt to extract the source code of the Service (beyond what is publicly available on GitHub).</li>
        <li>Use the Service to process data you are not authorized to access.</li>
        <li>Interfere with or disrupt the integrity or performance of the Service.</li>
      </ul>

      <h2>5. Third-party services</h2>
      <p>
        The Service relies on Atlassian&apos;s Jira Cloud APIs. Your use of Jira is governed by{" "}
        <a href="https://www.atlassian.com/legal/customer-agreement" target="_blank" rel="noopener noreferrer">
          Atlassian&apos;s Customer Agreement
        </a>{" "}
        and related policies. We are not responsible for the availability or conduct of Atlassian&apos;s services.
      </p>

      <h2>6. Intellectual property</h2>
      <p>
        The source code of TaskGraph is available on{" "}
        <a href="https://github.com/sumsar01/better-task-manager" target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
        . Your Jira data remains your property and that of your organization. We claim no ownership over any data fetched from your Jira workspace.
      </p>

      <h2>7. Disclaimer of warranties</h2>
      <p>
        The Service is provided <strong>&ldquo;as is&rdquo;</strong> and <strong>&ldquo;as available&rdquo;</strong> without warranties of any kind, either express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, accuracy, or non-infringement. We do not warrant that the Service will be uninterrupted, error-free, or free of harmful components.
      </p>

      <h2>8. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by applicable law, we shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising out of or relating to your use of, or inability to use, the Service — including but not limited to loss of data, loss of profits, or business interruption — even if we have been advised of the possibility of such damages.
      </p>
      <p>
        Our total liability to you for any claim arising out of these Terms or the Service shall not exceed the amount you paid to us in the twelve months preceding the claim (which, as the Service is free, is zero).
      </p>

      <h2>9. Indemnification</h2>
      <p>
        You agree to indemnify and hold harmless Rasmus Skriver and any contributors to the project from any claims, losses, damages, or costs (including reasonable legal fees) arising from your use of the Service or your violation of these Terms.
      </p>

      <h2>10. Changes to the Service</h2>
      <p>
        We reserve the right to modify, suspend, or discontinue the Service at any time without notice. We are not liable to you or any third party for any modification, suspension, or discontinuance.
      </p>

      <h2>11. Changes to these Terms</h2>
      <p>
        We may revise these Terms at any time by updating this page. The &ldquo;Last updated&rdquo; date at the top reflects the most recent revision. Continued use of the Service after any change constitutes your acceptance of the new Terms.
      </p>

      <h2>12. Governing law and jurisdiction</h2>
      <p>
        These Terms are governed by and construed in accordance with the laws of Denmark, without regard to its conflict-of-law principles. Any disputes arising under these Terms shall be subject to the exclusive jurisdiction of the courts of Denmark.
      </p>

      <h2>13. Contact</h2>
      <p>
        Questions about these Terms can be directed to Rasmus Skriver at{" "}
        <a href="mailto:skriver@live.dk">skriver@live.dk</a>.
      </p>
    </LegalLayout>
  );
}
