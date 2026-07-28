/** Gallery page groups — one group visible at a time to reduce scrolling */
window.TAUNET_GALLERY_GROUPS = [
  { id: 'recent', label: 'Most Recent' },
  { id: 'past', label: 'Past Events' }
];

/** Quick links on the Events page — maps to gallery sections (original external albums on taunetnelel.org/events/) */
window.TAUNET_FIND_PHOTOS = [
  {
    id: 'pageant-2025',
    label: 'Taunet Beauty Pageant Images',
    href: 'gallery.html#pageant-2025',
    thumb: 'wp-content/uploads/2025/11/TN-beauty-peagant.jpg',
    external: 'https://pqphotography90.pixieset.com/taunetnelelbeautypeagantcontest/'
  },
  {
    id: 'gala-2025',
    label: 'Taunet Gala Images',
    href: 'gallery.html#gala-2026',
    thumb: 'assets/gallery/gala-2026/gala-2026-01-PQS_0001.jpg',
    external: 'https://pqphotography90.pixieset.com/taunetnelel/'
  }
];

/** Event photo albums — sourced from taunetnelel.org WordPress media */
window.TAUNET_GALLERY = [
  {
    id: 'gala-2026',
    nav: 'Gala 2026',
    group: 'recent',
    sortDate: '2026-04-18',
    previewLimit: 8,
    title: 'Taunet Nelel Gala 2026',
    date: '18 April 2026',
    description: 'Event photos from our gala celebration — courtesy of PQ Photography. Browse a preview below or view the full album on Pixieset.',
    externalAlbums: [
      {
        label: 'View all 1,400+ photos on Pixieset',
        url: 'https://pqphotography90.pixieset.com/taunetnelel/'
      }
    ],
    photos: [
      'gala-2026-01-PQS_0001.jpg',
      'gala-2026-02-PQS_0002.jpg',
      'gala-2026-03-PQS_0003.jpg',
      'gala-2026-04-PQS_0004.jpg',
      'gala-2026-05-PQS_0005.jpg',
      'gala-2026-06-PQS_0006.jpg',
      'gala-2026-07-PQS_0008.jpg',
      'gala-2026-08-PQS_0009.jpg',
      'gala-2026-09-PQS_0012.jpg',
      'gala-2026-10-PQS_0013.jpg',
      'gala-2026-11-PQS_0014.jpg',
      'gala-2026-12-PQS_0015.jpg',
      'gala-2026-13-PQS_0016.jpg',
      'gala-2026-14-PQS_0017.jpg',
      'gala-2026-15-PQS_0018.jpg',
      'gala-2026-16-PQS_0019.jpg',
      'gala-2026-17-PQS_0020.jpg',
      'gala-2026-18-PQS_0021.jpg',
      'gala-2026-19-PQS_0023.jpg',
      'gala-2026-20-PQS_0026.jpg',
      'gala-2026-21-PQS_0027.jpg',
      'gala-2026-22-PQS_0029.jpg',
      'gala-2026-23-PQS_0030.jpg',
      'gala-2026-24-PQS_0031.jpg'
    ].map((file, index) => ({
      src: `assets/gallery/gala-2026/${file}`,
      alt: `Taunet Nelel Gala 2026 — photo ${index + 1}`,
      downloadName: file
    }))
  },
  {
    id: 'agm-2025',
    nav: 'AGM',
    group: 'past',
    sortDate: '2025-11-29',
    title: 'Annual General Meeting 2025',
    date: '29 November 2025',
    description: 'Taunet Nelel AGM held online with members across Victoria.',
    photos: [
      {
        src: 'wp-content/uploads/2025/09/Celebration.jpg',
        alt: 'Taunet Nelel AGM community celebration',
        downloadName: 'Taunet-AGM-2025-celebration.jpg'
      },
      {
        src: 'wp-content/uploads/2025/10/Membership.jpg',
        alt: 'Taunet Nelel members community',
        downloadName: 'Taunet-AGM-2025-members.jpg'
      }
    ]
  },
  {
    id: 'pageant-2025',
    nav: 'Pageant',
    group: 'past',
    sortDate: '2025-11-08',
    previewLimit: 6,
    title: 'Mr & Miss Taunet 2025',
    date: '8 November 2025',
    description: 'Community pageant at Almas Reception — celebration, culture, and youth leadership.',
    externalAlbums: [
      {
        label: 'Full photo album (PQ Photography — Pixieset)',
        url: 'https://pqphotography90.pixieset.com/taunetnelelbeautypeagantcontest/'
      }
    ],
    photos: [
      {
        src: 'wp-content/uploads/2025/11/TN-beauty-peagant.jpg',
        alt: 'Mr and Miss Taunet 2025 pageant',
        downloadName: 'Taunet-Pageant-2025-cover.jpg'
      },
      {
        src: 'wp-content/uploads/2025/10/Beauty-Pageant-show.jpeg',
        alt: 'Beauty pageant stage presentation',
        downloadName: 'Taunet-Pageant-2025-show.jpg'
      },
      {
        src: 'wp-content/uploads/2025/10/Youre-Invited-Mr-Miss-Taunet-2025.jpeg',
        alt: 'Mr and Miss Taunet 2025 invitation',
        downloadName: 'Taunet-Pageant-2025-invite.jpg'
      }
    ]
  },
  {
    id: 'volleyball-2025',
    nav: 'Volleyball',
    group: 'past',
    sortDate: '2025-10-19',
    title: 'Volleyball Tournament 2025',
    date: '19 October 2025',
    description: 'Community volleyball at Dandenong Stadium.',
    photos: [
      {
        src: 'wp-content/uploads/2025/10/COMMUNITY-INVITE-TAUNET-NELEL-VOLLEYBALL-TOURNAMENT.jpeg',
        alt: 'Volleyball tournament community invite',
        downloadName: 'Taunet-Volleyball-2025-invite.jpg'
      },
      {
        src: 'wp-content/uploads/2025/10/WhatsApp-Image-2025-10-02-at-14.04.38.jpeg',
        alt: 'Volleyball tournament action',
        downloadName: 'Taunet-Volleyball-2025-01.jpg'
      }
    ]
  },
  {
    id: 'gala-2025',
    nav: 'Gala 2025',
    group: 'past',
    sortDate: '2025-04-26',
    title: 'Taunet Nelel Gala 2025',
    date: '26 April 2025',
    description: 'Annual gala night at Dandenong Stadium — music, culture, and fellowship.',
    photos: [
      {
        src: 'wp-content/uploads/2025/10/TAUNET-NELE-GALA.jpg',
        alt: 'Taunet Nelel Gala 2025 promotional banner',
        downloadName: 'Taunet-Gala-2025-banner.jpg'
      },
      {
        src: 'wp-content/uploads/2025/10/Taunet-Nelel-Gala.png',
        alt: 'Taunet Nelel Gala 2025 branding',
        downloadName: 'Taunet-Gala-2025-branding.png'
      }
    ]
  },
  {
    id: 'sports-day',
    nav: 'Sports Day',
    group: 'past',
    sortDate: '2025-04-19',
    title: 'Sports Day',
    date: 'Community sports events',
    description: 'Family sports days and youth activities across Victoria.',
    photos: [
      {
        src: 'wp-content/uploads/2025/10/WhatsApp-Image-2025-10-02-at-13.40.24.jpeg',
        alt: 'Sports day youth activities',
        downloadName: 'Taunet-Sports-Day-01.jpg'
      },
      {
        src: 'wp-content/uploads/2025/10/youth-award.jpg',
        alt: 'Youth sports award presentation',
        downloadName: 'Taunet-Sports-Day-youth-award.jpg'
      },
      {
        src: 'wp-content/uploads/2025/10/IMG-20211212-WA0071.jpg',
        alt: 'Community sports day gathering',
        downloadName: 'Taunet-Sports-Day-02.jpg'
      }
    ]
  },
  {
    id: "wp-archive-2025",
    nav: "Archive 2025",
    group: "past",
    sortDate: "2025-12-01",
    previewLimit: 8,
    title: "Community photos 2025",
    date: "2025",
    description: "Selected photos migrated from the public WordPress media library.",
    photos: [
      {
        src: "assets/migrated-uploads/2025/08/business-04.jpg",
        alt: "Taunet Nelel community photo \u2014 business-04.jpg",
        downloadName: "business-04.jpg"
      },
      {
        src: "assets/migrated-uploads/2025/08/img-02.jpg",
        alt: "Taunet Nelel community photo \u2014 img-02.jpg",
        downloadName: "img-02.jpg"
      },
      {
        src: "assets/migrated-uploads/2025/08/Taunet-Nelel-landing-page.jpg",
        alt: "Taunet Nelel community photo \u2014 Taunet-Nelel-landing-page.jpg",
        downloadName: "Taunet-Nelel-landing-page.jpg"
      },
      {
        src: "assets/migrated-uploads/2025/09/02.png",
        alt: "Taunet Nelel community photo \u2014 02.png",
        downloadName: "02.png"
      },
      {
        src: "assets/migrated-uploads/2025/09/03.png",
        alt: "Taunet Nelel community photo \u2014 03.png",
        downloadName: "03.png"
      },
      {
        src: "assets/migrated-uploads/2025/09/About-taunet.jpeg",
        alt: "Taunet Nelel community photo \u2014 About-taunet.jpeg",
        downloadName: "About-taunet.jpeg"
      },
      {
        src: "assets/migrated-uploads/2025/09/Caroline-Yego.jpeg",
        alt: "Taunet Nelel community photo \u2014 Caroline-Yego.jpeg",
        downloadName: "Caroline-Yego.jpeg"
      },
      {
        src: "assets/migrated-uploads/2025/09/Celebration.jpg",
        alt: "Taunet Nelel community photo \u2014 Celebration.jpg",
        downloadName: "Celebration.jpg"
      },
      {
        src: "assets/migrated-uploads/2025/09/Dennis-Kirwa.jpeg",
        alt: "Taunet Nelel community photo \u2014 Dennis-Kirwa.jpeg",
        downloadName: "Dennis-Kirwa.jpeg"
      },
      {
        src: "assets/migrated-uploads/2025/09/Dennis-Melly.jpeg",
        alt: "Taunet Nelel community photo \u2014 Dennis-Melly.jpeg",
        downloadName: "Dennis-Melly.jpeg"
      },
      {
        src: "assets/migrated-uploads/2025/09/Felix-Kogei.jpeg",
        alt: "Taunet Nelel community photo \u2014 Felix-Kogei.jpeg",
        downloadName: "Felix-Kogei.jpeg"
      },
      {
        src: "assets/migrated-uploads/2025/09/Join-events.jpg",
        alt: "Taunet Nelel community photo \u2014 Join-events.jpg",
        downloadName: "Join-events.jpg"
      },
      {
        src: "assets/migrated-uploads/2025/09/Kalenjin-Culture-landing.jpg",
        alt: "Taunet Nelel community photo \u2014 Kalenjin-Culture-landing.jpg",
        downloadName: "Kalenjin-Culture-landing.jpg"
      },
      {
        src: "assets/migrated-uploads/2025/09/Kennedy-Chumba.jpeg",
        alt: "Taunet Nelel community photo \u2014 Kennedy-Chumba.jpeg",
        downloadName: "Kennedy-Chumba.jpeg"
      },
      {
        src: "assets/migrated-uploads/2025/09/Lidya-Kiplagat.jpeg",
        alt: "Taunet Nelel community photo \u2014 Lidya-Kiplagat.jpeg",
        downloadName: "Lidya-Kiplagat.jpeg"
      },
      {
        src: "assets/migrated-uploads/2025/09/Nick-Boit.jpeg",
        alt: "Taunet Nelel community photo \u2014 Nick-Boit.jpeg",
        downloadName: "Nick-Boit.jpeg"
      },
      {
        src: "assets/migrated-uploads/2025/09/R.png",
        alt: "Taunet Nelel community photo \u2014 R.png",
        downloadName: "R.png"
      },
      {
        src: "assets/migrated-uploads/2025/09/Ronnie-Kipter.jpeg",
        alt: "Taunet Nelel community photo \u2014 Ronnie-Kipter.jpeg",
        downloadName: "Ronnie-Kipter.jpeg"
      },
      {
        src: "assets/migrated-uploads/2025/09/Ruto-Mangusho.jpeg",
        alt: "Taunet Nelel community photo \u2014 Ruto-Mangusho.jpeg",
        downloadName: "Ruto-Mangusho.jpeg"
      },
      {
        src: "assets/migrated-uploads/2025/09/Sandra-Boinet.jpeg",
        alt: "Taunet Nelel community photo \u2014 Sandra-Boinet.jpeg",
        downloadName: "Sandra-Boinet.jpeg"
      },
      {
        src: "assets/migrated-uploads/2025/09/Sharon-Ngetich.jpeg",
        alt: "Taunet Nelel community photo \u2014 Sharon-Ngetich.jpeg",
        downloadName: "Sharon-Ngetich.jpeg"
      },
      {
        src: "assets/migrated-uploads/2025/09/Taunet-ceremony.jpg",
        alt: "Taunet Nelel community photo \u2014 Taunet-ceremony.jpg",
        downloadName: "Taunet-ceremony.jpg"
      },
      {
        src: "assets/migrated-uploads/2025/09/Taunet-nelel-events.png",
        alt: "Taunet Nelel community photo \u2014 Taunet-nelel-events.png",
        downloadName: "Taunet-nelel-events.png"
      },
      {
        src: "assets/migrated-uploads/2025/10/2025-10-04-05_52_49-Downloads-File-Explorer.png",
        alt: "Taunet Nelel community photo \u2014 2025-10-04-05_52_49-Downloads-File-Explorer.png",
        downloadName: "2025-10-04-05_52_49-Downloads-File-Explorer.png"
      },
      {
        src: "assets/migrated-uploads/2025/10/Beauty-Pageant-show.jpeg",
        alt: "Taunet Nelel community photo \u2014 Beauty-Pageant-show.jpeg",
        downloadName: "Beauty-Pageant-show.jpeg"
      },
      {
        src: "assets/migrated-uploads/2025/10/Betty-Langat-Vice-Chair-Lady.jpg",
        alt: "Taunet Nelel community photo \u2014 Betty-Langat-Vice-Chair-Lady.jpg",
        downloadName: "Betty-Langat-Vice-Chair-Lady.jpg"
      },
      {
        src: "assets/migrated-uploads/2025/10/Brenda-Bor.jpeg",
        alt: "Taunet Nelel community photo \u2014 Brenda-Bor.jpeg",
        downloadName: "Brenda-Bor.jpeg"
      },
      {
        src: "assets/migrated-uploads/2025/10/COMMUNITY-INVITE-\u2013-TAUNET-NELEL-VOLLEYBALL-TOURNAMENT.jpeg",
        alt: "Taunet Nelel community photo \u2014 COMMUNITY-INVITE-\u2013-TAUNET-NELEL-VOLLEYBALL-TOURNAMENT.jpeg",
        downloadName: "COMMUNITY-INVITE-\u2013-TAUNET-NELEL-VOLLEYBALL-TOURNAMENT.jpeg"
      },
      {
        src: "assets/migrated-uploads/2025/10/Dismus-Kiprop.jpeg",
        alt: "Taunet Nelel community photo \u2014 Dismus-Kiprop.jpeg",
        downloadName: "Dismus-Kiprop.jpeg"
      },
      {
        src: "assets/migrated-uploads/2025/10/IMG-20211212-WA0071.jpg",
        alt: "Taunet Nelel community photo \u2014 IMG-20211212-WA0071.jpg",
        downloadName: "IMG-20211212-WA0071.jpg"
      },
      {
        src: "assets/migrated-uploads/2025/10/IMG-20250713-WA0033.jpg",
        alt: "Taunet Nelel community photo \u2014 IMG-20250713-WA0033.jpg",
        downloadName: "IMG-20250713-WA0033.jpg"
      },
      {
        src: "assets/migrated-uploads/2025/10/IMG-20250713-WA0034.jpg",
        alt: "Taunet Nelel community photo \u2014 IMG-20250713-WA0034.jpg",
        downloadName: "IMG-20250713-WA0034.jpg"
      },
      {
        src: "assets/migrated-uploads/2025/10/IMG-20250713-WA0036.jpg",
        alt: "Taunet Nelel community photo \u2014 IMG-20250713-WA0036.jpg",
        downloadName: "IMG-20250713-WA0036.jpg"
      },
      {
        src: "assets/migrated-uploads/2025/10/IMG-20250713-WA0040.jpg",
        alt: "Taunet Nelel community photo \u2014 IMG-20250713-WA0040.jpg",
        downloadName: "IMG-20250713-WA0040.jpg"
      },
      {
        src: "assets/migrated-uploads/2025/10/kalenjin-language-classes.jpg",
        alt: "Taunet Nelel community photo \u2014 kalenjin-language-classes.jpg",
        downloadName: "kalenjin-language-classes.jpg"
      },
      {
        src: "assets/migrated-uploads/2025/10/Membership.jpg",
        alt: "Taunet Nelel community photo \u2014 Membership.jpg",
        downloadName: "Membership.jpg"
      },
      {
        src: "assets/migrated-uploads/2025/10/Taunet-Leadership-Team-Meet-up.jpeg",
        alt: "Taunet Nelel community photo \u2014 Taunet-Leadership-Team-Meet-up.jpeg",
        downloadName: "Taunet-Leadership-Team-Meet-up.jpeg"
      },
      {
        src: "assets/migrated-uploads/2025/10/Taunet-mens-affairs.jpg",
        alt: "Taunet Nelel community photo \u2014 Taunet-mens-affairs.jpg",
        downloadName: "Taunet-mens-affairs.jpg"
      },
      {
        src: "assets/migrated-uploads/2025/10/TAUNET-NELE-GALA.jpg",
        alt: "Taunet Nelel community photo \u2014 TAUNET-NELE-GALA.jpg",
        downloadName: "TAUNET-NELE-GALA.jpg"
      },
      {
        src: "assets/migrated-uploads/2025/10/Taunet-Nele-Men-camp-fire.jpeg",
        alt: "Taunet Nelel community photo \u2014 Taunet-Nele-Men-camp-fire.jpeg",
        downloadName: "Taunet-Nele-Men-camp-fire.jpeg"
      },
      {
        src: "assets/migrated-uploads/2025/10/TAUNET-NELEL-GALA-2.png",
        alt: "Taunet Nelel community photo \u2014 TAUNET-NELEL-GALA-2.png",
        downloadName: "TAUNET-NELEL-GALA-2.png"
      },
      {
        src: "assets/migrated-uploads/2025/10/Taunet-Nelel-Gala.png",
        alt: "Taunet Nelel community photo \u2014 Taunet-Nelel-Gala.png",
        downloadName: "Taunet-Nelel-Gala.png"
      },
      {
        src: "assets/migrated-uploads/2025/10/Taunet-Nelel-landing-page-Cropped.jpg",
        alt: "Taunet Nelel community photo \u2014 Taunet-Nelel-landing-page-Cropped.jpg",
        downloadName: "Taunet-Nelel-landing-page-Cropped.jpg"
      },
      {
        src: "assets/migrated-uploads/2025/10/WhatsApp-Image-2025-10-02-at-13.40.24.jpeg",
        alt: "Taunet Nelel community photo \u2014 WhatsApp-Image-2025-10-02-at-13.40.24.jpeg",
        downloadName: "WhatsApp-Image-2025-10-02-at-13.40.24.jpeg"
      },
      {
        src: "assets/migrated-uploads/2025/10/WhatsApp-Image-2025-10-02-at-14.04.38.jpeg",
        alt: "Taunet Nelel community photo \u2014 WhatsApp-Image-2025-10-02-at-14.04.38.jpeg",
        downloadName: "WhatsApp-Image-2025-10-02-at-14.04.38.jpeg"
      },
      {
        src: "assets/migrated-uploads/2025/10/WhatsApp-Image-2025-10-02-at-14.32.16.jpeg",
        alt: "Taunet Nelel community photo \u2014 WhatsApp-Image-2025-10-02-at-14.32.16.jpeg",
        downloadName: "WhatsApp-Image-2025-10-02-at-14.32.16.jpeg"
      },
      {
        src: "assets/migrated-uploads/2025/10/WhatsApp-Image-2025-10-02-at-14.47.08.jpeg",
        alt: "Taunet Nelel community photo \u2014 WhatsApp-Image-2025-10-02-at-14.47.08.jpeg",
        downloadName: "WhatsApp-Image-2025-10-02-at-14.47.08.jpeg"
      },
      {
        src: "assets/migrated-uploads/2025/10/Youre-Invited-\u2013-Mr-Miss-Taunet-2025.jpeg",
        alt: "Taunet Nelel community photo \u2014 Youre-Invited-\u2013-Mr-Miss-Taunet-2025.jpeg",
        downloadName: "Youre-Invited-\u2013-Mr-Miss-Taunet-2025.jpeg"
      },
      {
        src: "assets/migrated-uploads/2025/10/youth-award.jpg",
        alt: "Taunet Nelel community photo \u2014 youth-award.jpg",
        downloadName: "youth-award.jpg"
      },
      {
        src: "assets/migrated-uploads/2025/11/Taunet-Beauty-Peagant-landing.jpg",
        alt: "Taunet Nelel community photo \u2014 Taunet-Beauty-Peagant-landing.jpg",
        downloadName: "Taunet-Beauty-Peagant-landing.jpg"
      },
      {
        src: "assets/migrated-uploads/2025/11/Taunet-Beauty-Peagant.jpg",
        alt: "Taunet Nelel community photo \u2014 Taunet-Beauty-Peagant.jpg",
        downloadName: "Taunet-Beauty-Peagant.jpg"
      },
      {
        src: "assets/migrated-uploads/2025/11/TN-beauty-peagant.jpg",
        alt: "Taunet Nelel community photo \u2014 TN-beauty-peagant.jpg",
        downloadName: "TN-beauty-peagant.jpg"
      }
    ]
  },
  {
    id: "wp-archive-2026",
    nav: "Archive 2026",
    group: "past",
    sortDate: "2026-12-01",
    previewLimit: 8,
    title: "Community photos 2026",
    date: "2026",
    description: "Selected photos migrated from the public WordPress media library.",
    photos: [
      {
        src: "assets/migrated-uploads/2026/01/Taunet-Nelel-Galla.jpg",
        alt: "Taunet Nelel community photo \u2014 Taunet-Nelel-Galla.jpg",
        downloadName: "Taunet-Nelel-Galla.jpg"
      }
    ]
  }
];
