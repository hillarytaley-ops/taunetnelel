/** Gallery page groups — one group visible at a time to reduce scrolling */
window.TAUNET_GALLERY_GROUPS = [
  { id: 'recent', label: 'Recent Events' },
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
    id: 'pageant-2025',
    nav: 'Pageant',
    group: 'recent',
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
    id: 'gala-2026',
    nav: 'Gala 2026',
    group: 'recent',
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
    id: 'gala-2025',
    nav: 'Gala 2025',
    group: 'past',
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
    id: 'volleyball-2025',
    nav: 'Volleyball',
    group: 'past',
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
    id: 'sports-day',
    nav: 'Sports Day',
    group: 'past',
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
    id: 'agm-2025',
    nav: 'AGM',
    group: 'past',
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
  }
];