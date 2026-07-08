import React from 'react';
import { privacyContactEmail } from '../../lib/legal';

export const TermsContent = () => (
  <>
    <p>
      These Terms govern access to YUM Network, including its public website and authorized
      reporting workspace. By using the service, you agree to these Terms, our Privacy Policy, and the applicable
      terms of any third-party platforms you choose to connect.
    </p>
    <p>
      The service helps authorized users connect supported platforms, organize content operations, and review
      channel, messaging, and performance data. When you choose to connect a platform, that provider presents its
      own consent flow and you may deny or revoke access at any time.
    </p>
    <p>
      You may use the service only for lawful business purposes, with authority to connect each account, and in
      accordance with applicable law and the policies of each platform you connect. The private workspace is
      available only to users authorized by the service administrator.
    </p>
    <p>Your responsibilities:</p>
    <ul>
      <li>Keep account credentials confidential and use only your assigned access.</li>
      <li>Connect only platforms and accounts for which you have permission to grant access.</li>
      <li>Do not bypass security controls, permissions, or platform rate limits.</li>
      <li>Do not use the service to publish harmful, deceptive, or unauthorized content.</li>
    </ul>
    <p>
      You can disconnect a platform connection from the management area. Disconnecting revokes the stored
      authorization; deleting a connection may also remove its associated local records. Requests for account or
      data deletion can also be sent to <a href={`mailto:${privacyContactEmail}`}>{privacyContactEmail}</a>.
    </p>
    <p>
      The service is provided on an "as is" and "as available" basis to the extent permitted by law. We may
      suspend or terminate access for security, policy, or operational reasons, and may update these Terms by
      publishing a revised version on this page.
    </p>
    <p>
      Questions about these Terms can be sent to <a href={`mailto:${privacyContactEmail}`}>{privacyContactEmail}</a>.
    </p>
  </>
);

export const PrivacyContent = () => (
  <>
    <p>
      This Privacy Policy explains how YUM Network collects, uses, retains, and deletes information
      when you use our website, private workspace, and any supported platform connection.
    </p>
    <h2>Information we collect</h2>
    <p>
      We collect the information needed to operate the service: workspace account details (name, email, and role),
      support messages, and operational records such as assignments and reports. If you choose to connect a
      platform, we collect the data approved through that platform&apos;s consent flow, which may include account
      identifiers, profile details, public metrics, messages, and media metadata depending on the platform and
      scopes granted.
    </p>
    <h2>How we use platform data</h2>
    <p>
      We use this data only to connect the authorized platform, synchronize approved content or messaging data,
      display dashboards, assign ownership, and generate internal reports. We do not sell personal information or
      use platform data for advertising or to build unrelated user profiles.
    </p>
    <h2>Sharing and security</h2>
    <ul>
      <li>Access and refresh tokens are processed server-side, encrypted at rest, and never displayed in the workspace.</li>
      <li>Access is limited to authorized workspace users and service providers that host or secure the service.</li>
      <li>We do not share platform data with third parties except as needed to operate the service, comply with law, or with your direction.</li>
    </ul>
    <p>
      We use reasonable administrative and technical safeguards. No system can guarantee absolute security, so you
      should protect your workspace credentials and promptly report suspected misuse.
    </p>
    <h2>Retention and deletion</h2>
    <p>
      We retain platform connection data and synchronized reporting data while the connected workspace is active.
      Disconnecting a platform revokes its authorization and deletes stored tokens. Deleting a connection may remove
      its local channel, message, order, or reporting records depending on the platform. We retain limited backup and
      security logs for up to 90 days, unless a longer period is required by law or needed to resolve a security
      incident.
    </p>
    <h2>Your choices and rights</h2>
    <p>
      Depending on applicable law, you may request access to, correction of, export of, restriction of, or deletion
      of your personal information. You may also revoke platform access in that platform&apos;s settings or from the
      management area. To make a request, email <a href={`mailto:${privacyContactEmail}`}>{privacyContactEmail}</a>{' '}
      from the account concerned. We may verify your identity and respond within 30 days, subject to applicable law.
    </p>
    <p>
      This policy may change as the service evolves. The latest version is published here. For privacy questions or
      a deletion request, contact <a href={`mailto:${privacyContactEmail}`}>{privacyContactEmail}</a>.
    </p>
  </>
);

export const DataDeletionContent = () => (
  <>
    <p>
      This page explains how to request deletion of personal data associated with YUM Network and
      connected platform accounts.
    </p>
    <h2>How to request deletion</h2>
    <p>
      Send an email to <a href={`mailto:${privacyContactEmail}`}>{privacyContactEmail}</a> from the account you want
      reviewed. Include the platform name, the account identifier if you know it, and a clear request to delete your
      data.
    </p>
    <h2>What we delete</h2>
    <p>
      When we receive a valid request, we review the account and delete or disconnect the relevant local data where
      applicable. This may include stored access tokens, connected page records, conversation records, orders,
      knowledge documents, or reporting data linked to the account.
    </p>
    <h2>What may be retained</h2>
    <p>
      We may keep limited records when needed for security, audit, legal, or operational reasons, such as backup logs
      or records required by law. Where deletion is completed, the account will be disconnected from the service.
    </p>
    <h2>Response time</h2>
    <p>
      We aim to respond within 30 days, subject to identity verification and applicable law. If you need to follow up,
      use the same email address above.
    </p>
  </>
);
