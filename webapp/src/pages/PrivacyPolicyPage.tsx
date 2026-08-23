import { Link } from '../navigation';

const EFFECTIVE_DATE = 'August 22, 2026';

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-game-bg px-4 py-10 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link to="/" className="text-xl font-black text-brand hover:opacity-90">
            Quiz Royale Showdown
          </Link>
          <Link
            to="/login"
            className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
          >
            Back to game
          </Link>
        </div>

        <article className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl sm:p-10">
          <h1 className="text-3xl font-black sm:text-4xl">Privacy Policy</h1>
          <p className="mt-2 text-sm text-game-muted">Effective date: {EFFECTIVE_DATE}</p>

          <div className="mt-8 space-y-8 text-base leading-7 text-white/85">
            <section>
              <p>
                Quiz Royale Showdown ("Quiz Royale," "we," "us," or "our") respects your privacy. This
                Privacy Policy explains what information may be collected when you use Quiz Royale Showdown,
                how we use it, and the choices available to you.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white">1. Information we collect</h2>
              <p className="mt-2">Depending on how you use the service, we may collect:</p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Account information:</strong> information such as your email
                  address, display name, account identifier, and authentication information.
                </li>
                <li>
                  <strong className="text-white">Game information:</strong> room participation, answers, scores,
                  rankings, achievements, power-ups, and other gameplay activity.
                </li>
                <li>
                  <strong className="text-white">Technical information:</strong> basic device, browser, network,
                  IP address, request, error, and security information needed to operate and protect the service.
                </li>
                <li>
                  <strong className="text-white">Purchase information:</strong> if purchases are offered, we may
                  receive transaction identifiers and purchase status from the applicable payment or app-store
                  provider. We do not need to store your full payment-card number.
                </li>
                <li>
                  <strong className="text-white">Push notification information:</strong> if you enable push
                  notifications, the service may store a notification subscription or device token necessary to
                  deliver those notifications.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white">2. How we use information</h2>
              <p className="mt-2">We use information to:</p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>create and maintain accounts;</li>
                <li>operate multiplayer rooms, scoring, leaderboards, and game features;</li>
                <li>authenticate users and prevent fraud, abuse, cheating, and security incidents;</li>
                <li>maintain, troubleshoot, and improve the service;</li>
                <li>process and validate purchases when applicable;</li>
                <li>send service-related notifications when you have enabled them; and</li>
                <li>comply with applicable legal obligations.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white">3. Cookies and local storage</h2>
              <p className="mt-2">
                Quiz Royale may use browser storage, cookies, or similar technologies when necessary for sign-in,
                session continuity, preferences, security, and core application functionality. We do not sell your
                personal information for targeted advertising.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white">4. Service providers</h2>
              <p className="mt-2">
                We may use third-party hosting, database, caching, payment, app-distribution, notification, and
                infrastructure providers to operate Quiz Royale. These providers may process information only as
                needed to provide their services to us and are subject to their own privacy and security terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white">5. When information may be shared</h2>
              <p className="mt-2">
                We do not sell personal information. We may share information with service providers described
                above, when you direct us to do so, when required by law or valid legal process, or when reasonably
                necessary to protect the rights, safety, security, and integrity of Quiz Royale, our users, or
                others.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white">6. Data retention</h2>
              <p className="mt-2">
                We retain information for as long as reasonably necessary to provide the service, maintain account
                and game records, meet security and fraud-prevention needs, resolve disputes, and satisfy legal
                obligations. Retention periods may vary depending on the type of information and why it is needed.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white">7. Security</h2>
              <p className="mt-2">
                We use reasonable administrative, technical, and organizational safeguards designed to protect
                information. No internet service or storage system can be guaranteed to be completely secure.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white">8. Children&apos;s privacy</h2>
              <p className="mt-2">
                Quiz Royale is not intended to knowingly collect personal information from children in violation
                of applicable law. If you believe a child has provided personal information that should be removed,
                please contact us using the information below.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white">9. Your privacy choices</h2>
              <p className="mt-2">
                Depending on where you live, you may have rights to request access to, correction of, or deletion
                of certain personal information, or to object to or restrict certain processing. You may also be
                able to manage notification permissions through your device or browser settings.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white">10. Changes to this policy</h2>
              <p className="mt-2">
                We may update this Privacy Policy from time to time. When we make changes, we will update the
                effective date shown at the top of this page. Material changes may also be communicated through the
                service when appropriate.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white">11. Contact us</h2>
              <p className="mt-2">
                If you have questions, requests, or concerns about this Privacy Policy or your personal information,
                contact Quiz Royale Showdown through the support information provided in the app or on{' '}
                <a
                  href="https://quizroyale.gg"
                  className="font-semibold text-brand underline decoration-brand/50 underline-offset-4 hover:opacity-90"
                >
                  quizroyale.gg
                </a>
                .
              </p>
            </section>
          </div>
        </article>
      </div>
    </main>
  );
}
