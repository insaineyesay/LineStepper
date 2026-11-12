import { LEGAL_DETAILS } from './legal';

/**
 * Frequently asked questions (/faq). Plain answers about what things cost
 * and how the app works. Keep prices here in step with the store listings
 * and lib/post-packs.ts.
 */

export const POST_PRICE = '$0.99';
export const APP_PRICE = '$0.99';

export interface FaqItem {
  question: string;
  answer: string;
}

export interface FaqGroup {
  title: string;
  items: FaqItem[];
}

export const FAQ: FaqGroup[] = [
  {
    title: 'Cost',
    items: [
      {
        question: 'What does the app cost?',
        answer: `${APP_PRICE}, paid once when you get it from the App Store or Google Play. That lets you create a profile, find events near you, save them, follow instructors and DJs, and join crews. There's no subscription.`,
      },
      {
        question: 'What does it cost to post an event?',
        answer: `Each event, class or social you publish to the calendar is ${POST_PRICE}. On the website you can also buy posts in packs (5 or 10) to save on fees. Saving a draft is free, and so is editing or cancelling an event you already published.`,
      },
      {
        question: 'Do I pay to go to an event?',
        answer:
          "Not through LineUp2Step. We only list events. If an event has a ticket or a fee at the door, you pay the organizer directly, outside the app. Any refund is between you and the organizer.",
      },
      {
        question: 'Can I get a refund on posts?',
        answer: `Posts bought through Apple or Google are refunded by them, under their rules. For posts bought on our website, email ${LEGAL_DETAILS.contactEmail} within ${LEGAL_DETAILS.webRefundDays} days for a refund of any you haven't used.`,
      },
    ],
  },
  {
    title: 'Events',
    items: [
      {
        question: 'How do I find events near me?',
        answer:
          'On Events, tap Near me (and allow location) or ZIP, then pick a distance from 5 to 100 miles. Your location is only used for that search and is never stored.',
      },
      {
        question: 'How do I post an event?',
        answer:
          'Sign in, tap + Post an event, fill in the details and choose Published. Choose Draft to save it privately and publish later. Your form is saved on your phone as you type, so you won\'t lose it if you leave.',
      },
      {
        question: 'Will I get reminded about events?',
        answer:
          "Bookmark an event and, if you allow notifications, the app reminds you about a day before it starts. If the organizer changes the date, the reminder follows.",
      },
    ],
  },
  {
    title: 'Crews and people',
    items: [
      {
        question: 'What is a crew?',
        answer:
          'A dance crew or group with its own page. Anyone can start one. You can ask to join a crew, and its owner approves members.',
      },
      {
        question: 'Someone is bothering me. What can I do?',
        answer:
          "Open their profile and tap Block: you won't see each other's profiles, events or crews any more, and they aren't told. You can also report any event, crew or person, and our team will review it.",
      },
    ],
  },
  {
    title: 'Your account',
    items: [
      {
        question: 'How do I sign in?',
        answer: "Enter your email on Profile and we'll send you a 6-digit code. There's no password to remember.",
      },
      {
        question: 'How do I delete my account?',
        answer:
          'Profile → Delete account. It removes your profile, your events, bookmarks, follows and unused posts. This can\'t be undone.',
      },
      {
        question: 'How do I contact you?',
        answer: `Email ${LEGAL_DETAILS.contactEmail}.`,
      },
    ],
  },
];
