// Help centre, policies and guides. Plain words, short paragraphs. Shown by
// /help and /help/[slug]. Keep in step with the database rules they describe
// (fees and hold periods come from payment_config at runtime where it matters).

export type HelpBlock = { h?: string; p?: string; list?: string[] };
export type HelpArticle = {
  slug: string;
  title: string;
  summary: string;
  group: 'Buying' | 'Running events' | 'Spaces' | 'Safety' | 'Policies';
  body: HelpBlock[];
};

export const helpArticles: HelpArticle[] = [
  {
    slug: 'guarantee',
    group: 'Buying',
    title: 'The Tikkit Guarantee',
    summary: 'If an event is cancelled or isn’t real, you get your money back.',
    body: [
      {
        p: 'Every ticket you buy on Tikkit is covered. You pay Tikkit, not the organiser, and we only pay organisers after their event has happened. That’s what lets us promise this.',
      },
      { h: 'You get a full refund when', list: [
        'The organiser cancels the event.',
        'We remove an event because it was fake, misleading or a scam.',
        'Your payment arrived after your hold ran out and no ticket was issued.',
      ] },
      { h: 'How refunds reach you', p: 'Card payments go back to the same card. Bank transfers go back to the account they came from. Most refunds land within 5 working days. You’ll see the status under Account, Payments.' },
      { h: 'What it doesn’t cover', list: [
        'Tickets bought outside Tikkit, including ones sold to you on Instagram, Viber or in person.',
        'Changing your mind about an event that went ahead as described.',
        'Getting there: flights and ferries you booked yourself.',
      ] },
      { p: 'Something wrong with an event? Use Report on the event page. Three reports of a scam freeze the organiser’s money until we’ve looked.' },
    ],
  },
  {
    slug: 'paying',
    group: 'Buying',
    title: 'Paying for tickets',
    summary: 'Card through Bank of Maldives, or a bank transfer we check by hand.',
    body: [
      { p: 'When you check out, your tickets are held for 20 minutes while you pay. If you don’t finish, they go back on sale.' },
      { h: 'Card', p: 'You pay on Bank of Maldives’ secure page. Tikkit never sees your card number. Your tickets appear as soon as the bank confirms.' },
      { h: 'Bank transfer', p: 'Transfer the exact amount to Tikkit’s account and put your reference (it starts with ES-) in the remarks. We match it against our bank statement, usually within a few hours during the day, and your tickets appear. Your tickets are held for up to 24 hours. Transfers aren’t offered when an event starts too soon to clear.' },
      { h: 'We never ask for payment slips', p: 'Slips are easy to fake, so we don’t use them. Anyone asking you to send a slip, or to pay them directly, isn’t Tikkit. Report them.' },
      { h: 'Booking fee', p: 'A small fee covers payments, refunds and the Guarantee. Some organisers include it in the price. You always see it before you pay.' },
    ],
  },
  {
    slug: 'resale',
    group: 'Buying',
    title: 'Resale and sending tickets',
    summary: 'Sell tickets you can’t use, safely, at a fair price.',
    body: [
      { p: 'Can’t go? Open the ticket and choose Sell on resale. Buyers on the event page see it, and people on the waitlist are told straight away.' },
      { h: 'Fair prices', p: 'Resale prices are capped at 10% over what the ticket first cost. That keeps touts out.' },
      { h: 'When it sells', p: 'The buyer gets a brand-new code and your old QR stops working. The money, less a 5% resale fee, goes to your wallet and can be withdrawn after the event.' },
      { h: 'Sending to a friend', p: 'Use Send to a friend for free. They get the ticket in their account with a new code.' },
      { h: 'Why screenshots don’t work', p: 'The QR code on your ticket changes every 30 seconds. A screenshot stops scanning after about two minutes, so a ticket can only be used by whoever has it in the app.' },
    ],
  },
  {
    slug: 'getting-there',
    group: 'Buying',
    title: 'Boats and transfers',
    summary: 'Add a speedboat seat when you buy your ticket.',
    body: [
      { p: 'Many events are a boat ride away. When an organiser offers transfers, you can add a seat at checkout. Your name goes on the boat list the crew uses at the jetty.' },
      { p: 'Departure times and jetties are on your order. Arrive 15 minutes early. If weather cancels the boats, the organiser will post an update on the event, and you’ll see it on your ticket.' },
    ],
  },
  {
    slug: 'organisers',
    group: 'Running events',
    title: 'Selling tickets on Tikkit',
    summary: 'Get verified once, publish events, get paid after each one.',
    body: [
      { h: '1. Get verified', p: 'Tell us who you are with your ID card, passport or business registration, and a phone number. A person checks it, usually within a day. You only do this once.' },
      { h: '2. Publish', p: 'You can draft events before you’re verified. Your first events are reviewed before they go live, usually within a few hours. After three events that run without problems, new events go live straight away.' },
      { h: '3. Get paid', p: 'Money from sales collects in your wallet. It can be withdrawn a few days after each event ends (one day once you’re trusted). Add your bank account and withdraw whenever you like.' },
      { h: 'Fees', p: 'Free events are free. For paid tickets, the booking fee is a percentage plus a small amount per ticket. You choose whether buyers pay it on top or you include it in the price. Organiser Pro lowers it.' },
      { h: 'Tools that sell more', list: [
        'Promo codes for guest lists and early birds.',
        'Promoter links that track sales and pay commission automatically.',
        'Boat transfers and extras sold with tickets, with a passenger list for the crew.',
        'Promoted listings on Explore, labelled as promoted.',
        'Announcements to ticket holders, and (Pro) messages to all your followers.',
      ] },
    ],
  },
  {
    slug: 'memberships',
    group: 'Running events',
    title: 'Memberships and presales',
    summary: 'Let your regulars pay once and buy first.',
    body: [
      { p: 'Set up a membership from your organiser page: a name, what members get, and a monthly or yearly price. Members can buy during your presales and get a standing discount on tickets.' },
      { h: 'Presales', p: 'When you create an event, choose a members-only window of 1, 3 or 7 days. Everyone else sees the event and can join, but can only buy once general sale opens. You can open general sale early from the dashboard.' },
      { h: 'Getting paid', p: 'Membership payments, less a 10% fee, reach your wallet a week after each payment.' },
    ],
  },
  {
    slug: 'series-and-seats',
    group: 'Running events',
    title: 'Repeating events and seat maps',
    summary: 'Weekly nights in one go, and reserved seating for halls.',
    body: [
      { h: 'Repeating events', p: 'Choose Weekly, Every 2 weeks or Monthly when you create an event, for up to 12 dates. Each date has its own tickets and guest list, and can be edited or cancelled on its own. Explore shows the next date, with the rest on the event page.' },
      { h: 'Seat maps', p: 'In the dashboard, open Seating and lay out sections, rows and seats for a ticket type. Buyers pick their seats on a map; the seat is printed on the ticket and shown when it’s scanned. Seat maps can be changed until that ticket type sells.' },
    ],
  },
  {
    slug: 'sharing',
    group: 'Running events',
    title: 'Sharing your event',
    summary: 'Links that preview properly, and story cards.',
    body: [
      { p: 'Event links show a poster, the date and the price when pasted into Instagram, WhatsApp or Viber. Promoter links work the same way and track sales.' },
      { p: 'Tap the Instagram button on an event to make a story card with a QR code, then add a link sticker with the event link. Ticket holders can share an “I’m going” card from their ticket.' },
    ],
  },
  {
    slug: 'organiser-rules',
    group: 'Running events',
    title: 'Organiser guidelines',
    summary: 'What we expect from everyone who sells tickets.',
    body: [
      { list: [
        'List real events you’re running, with the real date, place and price.',
        'Sell only through Tikkit for events listed here. Never ask buyers to pay you directly or send slips.',
        'If something changes, edit the event or post an announcement. Ticket holders are told.',
        'If you cancel, everyone is refunded and the sales are taken back from your wallet.',
        'Boats: use licensed operators, carry life jackets for everyone and follow MNDF weather warnings.',
        'Respect capacity. Don’t sell more than the venue or boats can safely take.',
      ] },
      { p: 'Breaking these can mean your listing is removed, your payouts frozen and your account suspended.' },
    ],
  },
  {
    slug: 'pro',
    group: 'Running events',
    title: 'Organiser Pro',
    summary: 'Lower fees and tools for people who run events often.',
    body: [
      { list: [
        'A lower booking fee on every paid ticket.',
        'Unlimited promoter links (2 per event on the free plan).',
        'Message all your followers, up to 3 times a week.',
        'Daily sales charts for every event.',
        '25% off promoted listings.',
      ] },
      { p: 'Pay monthly or yearly. It doesn’t renew automatically, so you’re never charged without choosing to.' },
    ],
  },
  {
    slug: 'hosts',
    group: 'Spaces',
    title: 'Renting out a space',
    summary: 'List a verified space and get paid through the app.',
    body: [
      { h: 'Verify the space', p: 'Send proof you can rent it out (a lease, ownership papers or a letter from the owner), then stand in the space and share your location. That pins it on the map and shows renters it’s real. Moving or renaming the space needs a fresh check.' },
      { h: 'Requests and payment', p: 'Organisers request a time. When you approve, they have 48 hours to pay in the app, or the slot is released. Approved, paid slots can never be double booked.' },
      { h: 'Getting paid', p: 'The rental, less a 10% commission, goes to your wallet the day after the booking ends.' },
      { h: 'Cancelling', p: 'Renters can cancel a paid booking up to 3 days before and get a full refund. If you cancel, they’re refunded in full.' },
    ],
  },
  {
    slug: 'safety',
    group: 'Safety',
    title: 'Spotting ticket scams',
    summary: 'The tricks we see most, and how to stay clear of them.',
    body: [
      { list: [
        'Someone selling tickets on Instagram, Viber or Facebook and asking for a bank transfer. Buy on Tikkit, or use resale here.',
        'Anyone asking for a payment slip, or sending you one as “proof”.',
        'A screenshot of a QR code. Tikkit codes change every 30 seconds, so screenshots don’t get in.',
        'Prices far below everyone else’s for a sold-out event.',
        'An organiser page without the Verified tick, or one with a name very close to a well-known organiser.',
        'Reviews: only people who were checked in at an event can rate the organiser, so check what they said.',
      ] },
      { p: 'If something looks off, tap Report on the event or organiser. We read every report.' },
    ],
  },
  {
    slug: 'refunds',
    group: 'Policies',
    title: 'Refund policy',
    summary: 'When you get money back, and how long it takes.',
    body: [
      { p: 'Refunds follow the Tikkit Guarantee. Cancelled, removed and fake events are refunded in full, including the booking fee.' },
      { p: 'For events that go ahead, the organiser’s own refund policy applies, so contact them first. Resale is usually the fastest way to get money back for a ticket you can’t use.' },
      { p: 'Paid space bookings can be cancelled by the renter up to 3 days before for a full refund. Owner cancellations are always refunded in full.' },
      { p: 'Refunds go back the way you paid, usually within 5 working days.' },
    ],
  },
  {
    slug: 'terms',
    group: 'Policies',
    title: 'Terms of use',
    summary: 'The basics of using Tikkit.',
    body: [
      { p: 'Tikkit is a marketplace. Organisers and space owners are responsible for their events and spaces. Tikkit takes payments on their behalf, holds them until the event has happened, and pays them out less our fees.' },
      { p: 'You must give true information, use one account, and not resell tickets outside Tikkit for more than face value. We may remove listings, freeze payouts or suspend accounts that break these terms or our guidelines.' },
      { p: 'Times are Maldives time. Prices are in MVR and include GST where the organiser charges it.' },
      { p: 'This summary is not the full legal agreement. Contact support@eventspace.mv for the current full terms.' },
    ],
  },
  {
    slug: 'privacy',
    group: 'Policies',
    title: 'Privacy',
    summary: 'What we keep, and who sees it.',
    body: [
      { list: [
        'Your name and email, to put tickets in your account.',
        'For organisers and hosts: ID or business documents, kept in private storage only our review team can open.',
        'Bank details for payouts, shown back to you with only the last 4 digits.',
        'Your location only when you sort by distance or verify a space, and never shared.',
      ] },
      { p: 'Organisers see the names on tickets for their events and, for transfers, the boat list. They never see your email unless you contact them.' },
      { p: 'You can delete your account from Settings at any time once you have no money waiting in your wallet.' },
    ],
  },
];

export const helpGroups = ['Buying', 'Running events', 'Spaces', 'Safety', 'Policies'] as const;

export const findArticle = (slug: string) => helpArticles.find((a) => a.slug === slug);
