/**
 * Terms of Service, Privacy Policy and the in-app disclaimers.
 *
 * DRAFT. The approved wording lives in the Google Doc "LineUp2Step — Terms,
 * Privacy and Disclaimers (draft for review)" in the shared drive. Change the
 * doc first, then mirror it here. Every detail still waiting on the client is
 * in LEGAL_DETAILS below: fill those in and set `draft` to false.
 */

export const LEGAL_DETAILS = {
  /** Shows a "being finalized" note at the top of each page while true. */
  draft: true,
  company: '[company legal name]',
  address: '[mailing address]',
  contactEmail: '[contact email]',
  minimumAge: 17,
  webRefundDays: 14,
  governingState: 'Virginia',
  courts: '[county, state]',
  effectiveDate: '[effective date]',
};

const d = LEGAL_DETAILS;

/** A paragraph, or a bullet list whose items may start with a bold label. */
export type LegalBlock = string | { bullets: (string | { label: string; text: string })[] };

export interface LegalSection {
  heading: string;
  blocks: LegalBlock[];
}

export interface LegalDocument {
  title: string;
  intro: string;
  sections: LegalSection[];
}

export const TERMS: LegalDocument = {
  title: 'Terms of Service',
  intro: `Effective ${d.effectiveDate}. These terms are an agreement between you and ${d.company} ("LineUp2Step", "we", "us"). By creating an account or using the LineUp2Step app or website, you agree to them. If you don't agree, don't use LineUp2Step.`,
  sections: [
    {
      heading: '1. What LineUp2Step is',
      blocks: [
        'LineUp2Step is a place to find soul line dancing events, follow instructors, DJs and organizers, and join dance crews. Events are listed by the people who organize them. We display event information; we do not sell tickets, collect money for events, or run the events ourselves.',
      ],
    },
    {
      heading: '2. Who can use it',
      blocks: [
        {
          bullets: [
            `You must be at least ${d.minimumAge} years old to create an account.`,
            'You must give a real email address you control. We sign you in by emailing you a code.',
            'One person, one account. You are responsible for what happens on your account.',
            "You can't use LineUp2Step if we have banned you, including by making a new account.",
          ],
        },
      ],
    },
    {
      heading: '3. Paying for the app and for posts',
      blocks: [
        {
          bullets: [
            'The app costs $0.99, paid once through the App Store or Google Play.',
            'Publishing an event to the calendar uses one post. A post costs $0.99. On the website, posts are sold singly or in packs through our payment processor, Stripe. In the iPhone and Android apps, they are sold through Apple or Google in-app purchase.',
            "A post is used the first time an event is published. Editing or cancelling that event later doesn't use another post.",
            'Posts bought on one device can be used anywhere you sign in.',
            {
              label: 'Refunds.',
              text: `Apple and Google handle refunds for purchases made through them, under their own rules. For posts bought on our website, you can ask for a refund of unused posts within ${d.webRefundDays} days of purchase by emailing ${d.contactEmail}. Posts already used to publish an event are not refundable.`,
            },
            "Posts have no cash value and can't be transferred to another account.",
          ],
        },
      ],
    },
    {
      heading: '4. What you post',
      blocks: [
        'You own what you post (events, crew pages, profile details). By posting it, you give us permission to store it, show it in the app and on the website, and use it to run and promote LineUp2Step. This permission ends when you delete the content or your account, except for copies we must keep by law.',
        'You are responsible for what you post. Event details must be accurate, and you must have the right to post anything you share, including flyers, photos and music references.',
      ],
    },
    {
      heading: '5. Rules',
      blocks: [
        "Don't use LineUp2Step to:",
        {
          bullets: [
            'harass, threaten, bully or impersonate anyone;',
            'post hateful, sexually explicit, violent or illegal content;',
            'post fake or misleading events, or spam;',
            'promote illegal activity, or use a crew page as a front for it;',
            "collect other people's information, or contact them in ways they haven't agreed to;",
            'get around a block, a removal or a ban;',
            'break, overload, scrape or reverse engineer the service.',
          ],
        },
      ],
    },
    {
      heading: '6. Reporting, blocking and moderation',
      blocks: [
        {
          bullets: [
            'You can report any event, crew or person in the app, and block anyone. Blocking hides the two of you from each other.',
            'We review reports and may remove content, remove a crew, or ban an account, with or without notice, if we believe it breaks these terms or puts anyone at risk. A ban stops the account from signing in and keeps the same email address from signing up again.',
            "We don't review everything posted before it appears, and we aren't obliged to monitor the service.",
            `If you think we removed something by mistake, email ${d.contactEmail}.`,
          ],
        },
      ],
    },
    {
      heading: '7. Events, organizers and attendees',
      blocks: [
        'Organizers are solely responsible for their events: the accuracy of the details, the venue, safety, entry fees, refunds, age limits and anything that happens at the event. Any payment for an event is between you and the organizer, outside LineUp2Step.',
      ],
    },
    {
      heading: '8. Messages and notifications',
      blocks: [
        'We send sign-in codes and, if you allow it, reminders about events you saved. When you follow an organizer or join a crew, any contact you have with them, inside or outside the app, is between you and them. We are not responsible for messages, emails or other communication between users, or between users and organizers.',
      ],
    },
    {
      heading: '9. Closing your account',
      blocks: [
        'You can delete your account at any time from Profile → Delete account. This permanently deletes your profile, the events you posted, your bookmarks, follows, crew memberships and unused posts. Crews you started pass to their next member, or are deleted if no one else is in them. We may suspend or close accounts that break these terms.',
      ],
    },
    {
      heading: '10. Disclaimers and limits of liability',
      blocks: [
        'LineUp2Step is provided "as is" and "as available". We don\'t promise it will always be available, error-free, or that event information is accurate. To the fullest extent the law allows, we are not liable for indirect or consequential losses, or for anything that happens at an event or between users. Our total liability to you for any claim is limited to the amount you paid us in the 12 months before the claim, or $10, whichever is greater. Some places don\'t allow these limits, so they may not all apply to you.',
      ],
    },
    {
      heading: '11. Changes',
      blocks: [
        "We may update these terms. If a change is significant, we'll tell you in the app or by email before it takes effect. Using LineUp2Step after that means you accept the new terms.",
      ],
    },
    {
      heading: '12. Governing law',
      blocks: [
        `These terms are governed by the laws of ${d.governingState}, and disputes will be heard in the courts of ${d.courts}, unless the law where you live says otherwise.`,
      ],
    },
    {
      heading: '13. Contact',
      blocks: [`${d.company}, ${d.address}, ${d.contactEmail}.`],
    },
  ],
};

export const PRIVACY: LegalDocument = {
  title: 'Privacy Policy',
  intro: `Effective ${d.effectiveDate}. This explains what LineUp2Step collects, why, who helps us run the service, and the choices you have. We don't sell your personal information, and we don't share it for advertising.`,
  sections: [
    {
      heading: '1. What we collect',
      blocks: [
        {
          bullets: [
            { label: 'Account:', text: 'your email address, used to sign you in with a code and to contact you about your account.' },
            {
              label: 'Profile:',
              text: 'what you choose to add: display name, handle, dance role, bio, home area and ZIP code. Your display name, handle, role, bio and area are visible to other users. Your email and ZIP code are not.',
            },
            {
              label: 'What you post and do:',
              text: 'events and crews you create, events you bookmark, people you follow, crews you join, reports you send and people you block.',
            },
            { label: 'Purchases:', text: 'how many posts you bought and used. Card details are handled by Stripe, Apple or Google and never reach us.' },
            {
              label: 'Location:',
              text: 'if you choose "Near me", your phone\'s location is used once to find events nearby. It\'s rounded first, and we never store it. You can search by ZIP code instead.',
            },
            { label: 'Notifications:', text: 'if you allow reminders, a device token that lets us send them to your phone.' },
            {
              label: 'Usage and errors:',
              text: 'which screens you open and buttons you tap, and crash and error reports, tied to an anonymous account number, not your email or name. You can turn off usage data in Profile → Share usage data. Crash and error reports are always sent, because we need them to keep the app working.',
            },
            {
              label: 'Server logs:',
              text: 'technical records of requests to our servers. Emails, phone numbers and payment details are removed before logs are written.',
            },
          ],
        },
      ],
    },
    {
      heading: '2. Why we use it',
      blocks: [
        {
          bullets: [
            'To run LineUp2Step: sign you in, show events near you, send reminders you asked for, and process purchases.',
            'To keep people safe: review reports, enforce blocks and bans, and stop abuse.',
            'To fix problems and improve the app, using usage data and error reports.',
            'To meet legal obligations.',
          ],
        },
      ],
    },
    {
      heading: '3. Who helps us run it',
      blocks: [
        'These companies process data on our behalf, only to provide their service to us:',
        {
          bullets: [
            { label: 'Supabase:', text: 'database and sign-in (stores your account, profile and content).' },
            { label: 'Heroku (Salesforce):', text: 'runs our server and keeps its logs.' },
            { label: 'Vercel:', text: 'hosts the website.' },
            { label: 'PostHog:', text: 'usage analytics and error tracking.' },
            { label: 'Stripe:', text: 'payments on the website.' },
            { label: 'Apple and Google:', text: 'app purchases and delivering notifications to your phone.' },
            { label: 'Expo:', text: "sends reminders to Apple's and Google's notification services." },
          ],
        },
        'We may also share information if the law requires it, to protect someone\'s safety, or as part of selling or merging the business, in which case this policy still applies to your information.',
      ],
    },
    {
      heading: '4. How long we keep it',
      blocks: [
        {
          bullets: [
            'Your account and content: until you delete them or your account.',
            'When you delete your account, your profile, events, bookmarks, follows, crew memberships, reminder tokens and unused posts are deleted straight away.',
            'Reports you sent are kept without your name, so moderators can still act on them.',
            "If an account is banned, a one-way scrambled version of its email address (a hash) is kept so the same email can't sign up again.",
            'Usage data, error reports and logs are kept by our providers for a limited time under their own retention settings, then deleted.',
          ],
        },
      ],
    },
    {
      heading: '5. Your choices and rights',
      blocks: [
        {
          bullets: [
            'See and change your profile in the app at any time.',
            'Delete your account in the app: Profile → Delete account.',
            'Turn usage data off: Profile → Share usage data.',
            "Turn reminders off in your phone's settings, or remove the bookmark.",
            'Location is only used if you choose "Near me" and allow it.',
            `Depending on where you live (for example California), you may have the right to know what we hold about you, get a copy, correct it or delete it. Email ${d.contactEmail} and we'll respond within 45 days. We won't treat you differently for asking.`,
          ],
        },
      ],
    },
    {
      heading: '6. Children',
      blocks: [
        `LineUp2Step is not for anyone under ${d.minimumAge}. We don't knowingly collect information from children under 13. If you believe a child has an account, email ${d.contactEmail} and we will delete it.`,
      ],
    },
    {
      heading: '7. Security',
      blocks: [
        "Data is encrypted in transit, access is limited to the people who run the service, and payment details never reach our systems. No service is perfectly secure, so we can't guarantee absolute security.",
      ],
    },
    {
      heading: '8. Changes and contact',
      blocks: [
        `If we change this policy in a significant way, we'll tell you in the app or by email first. Questions or requests: ${d.contactEmail}, ${d.company}, ${d.address}.`,
      ],
    },
  ],
};

export const LEGAL_DOCUMENTS = { terms: TERMS, privacy: PRIVACY } as const;
export type LegalDocumentKey = keyof typeof LEGAL_DOCUMENTS;

/** Short notices shown where they apply. */
export const DISCLAIMERS = {
  event:
    "This event is listed by its organizer, not by LineUp2Step. We don't sell tickets or collect payment for events, and we don't check event details, venues or organizers. Confirm details with the organizer before you go. Any entry fee or refund is between you and the organizer. You attend at your own risk. Organizers set and enforce age limits.",
  crew: "Crews are run by their members, not by LineUp2Step. We don't vet crews or their members. Contact with a crew, and anything arranged with them, is between you and the crew. Report a crew if something isn't right.",
  signIn: `By continuing, you confirm you're at least ${d.minimumAge} and agree to the Terms of Service and Privacy Policy.`,
};
