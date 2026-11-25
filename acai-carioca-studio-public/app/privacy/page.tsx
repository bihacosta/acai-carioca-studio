import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy · Content Atelier",
  description: "How Content Atelier collects, uses and protects your information."
};

const CONTACT_EMAIL = "bihacosta@gmail.com";
const LAST_UPDATED = "November 25, 2026";

export default function PrivacyPage() {
  return (
    <main className="legalShell">
      <article className="legalCard">
        <p className="eyebrow">Content Atelier</p>
        <h1>Privacy Policy</h1>
        <p className="muted">Last updated: {LAST_UPDATED}</p>

        <p>
          Content Atelier (&ldquo;the Studio&rdquo;) is a content-planning platform based in San Diego,
          California, used by brands and their teams to plan and approve social media and email content.
          This policy explains what information the
          Studio collects when you use it, how that information is used, and the choices you have.
        </p>

        <h2>Information we collect</h2>
        <ul>
          <li>
            <b>Account information.</b> When you create an account or sign in, we receive your email
            address. If you sign in with Google, we also receive the basic profile information Google
            shares with your permission (your name, email address and profile picture). We never
            receive your Google password.
          </li>
          <li>
            <b>Content you add.</b> Posts, captions, dates, tasks, images and other files you upload to
            the workspace.
          </li>
          <li>
            <b>Technical information.</b> Basic logs needed to keep the service secure and working, such
            as sign-in times and error reports.
          </li>
        </ul>

        <h2>How we use your information</h2>
        <ul>
          <li>To let you sign in and to identify you to your teammates inside the workspace.</li>
          <li>To store, display and organize the content you and your team create.</li>
          <li>To keep the Studio secure and to fix problems.</li>
        </ul>
        <p>
          We do not sell your information, use it for advertising, or share it with third parties
          except the service providers that run the Studio for us.
        </p>

        <h2>Google user data</h2>
        <p>
          The Studio requests only the basic Google sign-in information listed above (name, email and
          profile picture) and uses it only to create and identify your account. Our use of
          information received from Google APIs adheres to the{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>

        <h2>Service providers</h2>
        <p>
          The Studio is hosted on Vercel, and accounts, data and files are stored with Supabase. These
          providers process information on our behalf only to operate the service.
        </p>

        <h2>Data retention and deletion</h2>
        <p>
          We keep your account and content while your account is active. You can ask us to delete your
          account and associated data at any time by emailing{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. You can also remove the
          Studio&rsquo;s access to your Google account at any time from your{" "}
          <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
            Google Account permissions page
          </a>
          .
        </p>

        <h2>Security</h2>
        <p>
          Access to workspace data is restricted to signed-in members, and files are kept in private
          storage. No system is perfectly secure, but we take reasonable steps to protect your
          information.
        </p>

        <h2>Changes to this policy</h2>
        <p>
          If we change this policy, we will update the date at the top of this page.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about this policy? Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>

        <p className="legalBack">
          <a href="/">← Back to Content Atelier</a>
        </p>
      </article>
    </main>
  );
}
