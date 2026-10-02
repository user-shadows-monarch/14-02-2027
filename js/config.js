/* ==========================================================================
   EVERYTHING PERSONAL LIVES HERE.
   Edit the texts, dates and file names below. You never need to touch the
   other files. Placeholders you can use inside any text:
     {name}  -> herName      {from} -> your name
     {km}    -> real distance between the two cities (calculated)
   Media is optional: if a file is missing, that part is simply hidden
   (photos show a soft placeholder). Add ?dev to the page address to see in
   the browser console which files were not found.
   ========================================================================== */
window.GIFT = {
  herName: "love",           // her name, as it appears in "My dearest ___,"
  from: "Your name",

  /* Music. Leave these files out and the page plays its own built-in
     Valentine piano and a birthday music box. Add your own mp3s to override. */
  music: {
    valentine: "assets/music/valentine.mp3",
    birthday: "assets/music/birthday.mp3"
  },

  /* ======================= MAP ===============================
     CARTO Dark Matter basemap. CARTO now requires a (free) API key, which you
     put in `key` below. The URL already contains {key}, so you only edit the key.
     Get one at https://carto.com/basemaps/apikey/ (free, no account needed).

     If the key is empty or fails, the page quietly falls back to other free
     map sources (Esri, then OpenStreetMap).

     To use a different provider instead, replace `custom` with its tile URL
     (keep {z} {x} {y}, and {key} where the key goes). If it is a LIGHT map, add
     light: true so the page darkens it to match the theme. */
  tiles: {
    key: "cb1_46j8_1_7115d84e6f4b94e4bef4eae0",
    custom: "https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png?key={key}",
    subdomains: "abcd"
    // light: false, maxZoom: 18, retina: false
  },

  /* Pilot avatar: your face flies beside the plane, wearing a captain's cap, and
     hands her a bouquet of red roses when you land.
     Put a square-ish photo of your face at assets/pilot/face.jpg
     (facePosition moves the crop, e.g. "50% 20%" shows more forehead).
     Without a photo a friendly silhouette is shown. */
  pilot: { face: "assets/pilot/face.jpg", facePosition: "50% 30%", bouquet: true },

  /* The endless chat drifting up the side from take-off until landing. It loops all
     the chat messages of your memories above. Add extra lines here if you like:
       extra: [ { me: true, text: "Good morning, beautiful", date: "15.02.2025" } ] */
  floatChat: { enabled: true, every: 2.6, duration: 17, extra: [] },

  opening: {
    title: ["A special journey", "for someone even more special…"],
    text: ["It's not just a birthday,", "it's also Valentine's Day.", "Two reasons to celebrate you."],
    button: "Tap to begin"
  },

  letter: {
    hint: "A letter for you…",
    sub: "Tap the envelope to open it",
    greeting: "My dearest {name},",
    paragraphs: [
      "Some people spend a lifetime looking for a place that feels like home. I found mine in a conversation.",
      "There are more than {km} kilometres between Berlin and Gabès, and still you are the closest person to my heart. Every message, every voice note, every late night made the distance a little smaller.",
      "Today is your birthday, and it is also Valentine's Day. Two reasons to celebrate you. So I built you a journey through everything we have shared, one memory at a time."
    ],
    signature: "Yours, always",
    button: "Begin our journey"
  },

  route: {
    from: { name: "Berlin", country: "Germany", lat: 52.5200, lng: 13.4050 },
    to:   { name: "Gabès",  country: "Tunisia", lat: 33.8815, lng: 10.0982 },
    subtitle: "A journey of love, memories and you",
    button: "Our journey"
  },

  /* The stops of the flight, in order.
     t = how far along the route (0 = Berlin, 1 = Gabès).
     photo / audio / video: file paths (optional).
     chat: the messages shown in the Chat tab. me:true = your bubble (pink),
           me:false = her bubble. The chats below are SAMPLES: replace them
           with your real messages, or set chatImage to a screenshot file.  */
  memories: [
    {
      t: 0.00, title: "Berlin, Germany", date: "14.02.2025",
      quote: "Everything started here… In a city full of dreams, I met my favorite person.",
      photo: "assets/photos/00.jpg", audio: "assets/audio/00.mp3", video: "",
      chat: [
        { me: false, text: "Hi… I think we matched 🙂", time: "21:04" },
        { me: true,  text: "Hi you. I was hoping you'd say hello first.", time: "21:05" },
        { me: false, text: "So, tell me about yourself?", time: "21:05" },
        { me: true,  text: "Only if you tell me about you, too.", time: "21:06" }
      ]
    },
    {
      t: 0.14, title: "Our first real conversation", date: "20.02.2025",
      quote: "I still remember the first time we really talked. It felt so natural, like I had known you forever.",
      photo: "assets/photos/01.jpg", audio: "assets/audio/01.mp3", video: "",
      chat: [
        { me: true,  text: "I've been smiling at my phone for an hour.", time: "23:12" },
        { me: false, text: "Me too. It feels like I've known you forever.", time: "23:13" },
        { me: true,  text: "Same. How is that even possible?", time: "23:13" }
      ]
    },
    {
      t: 0.28, title: "Late night talks", date: "03.03.2025",
      quote: "Those late night conversations… You, me, and endless thoughts. I could talk to you forever.",
      photo: "assets/photos/02.jpg", audio: "assets/audio/02.mp3", video: "",
      chat: [
        { me: false, text: "It's 3 a.m. We should sleep.", time: "03:02" },
        { me: true,  text: "We should. Five more minutes?", time: "03:02" },
        { me: false, text: "Five more minutes 💗", time: "03:03" }
      ]
    },
    {
      t: 0.42, title: "The little moments", date: "12.04.2025",
      quote: "The simple moments with you are the ones that mean the most. No need for big plans, just you.",
      photo: "assets/photos/03.jpg", audio: "assets/audio/03.mp3", video: "",
      chat: [
        { me: true,  text: "Nothing special today. Just wanted to say hi.", time: "18:40" },
        { me: false, text: "That IS special to me.", time: "18:41" }
      ]
    },
    {
      t: 0.56, title: "Our first date (online)", date: "25.05.2025",
      quote: "That day, we made time for each other. The food, the laughs, the way you looked at me… everything was perfect.",
      photo: "assets/photos/04.jpg", audio: "assets/audio/04.mp3", video: "",
      chat: [
        { me: false, text: "Dinner is ready. Camera on?", time: "20:00" },
        { me: true,  text: "Camera on. Table set for two, one on each side of the screen.", time: "20:01" },
        { me: false, text: "Best date I've ever had 🕯️", time: "23:30" }
      ]
    },
    {
      t: 0.68, title: "The dream of meeting", date: "18.08.2025",
      quote: "We talked about meeting one day. And now… it's not just a dream anymore.",
      photo: "assets/photos/05.jpg", audio: "assets/audio/05.mp3", video: "",
      chat: [
        { me: true,  text: "What if I booked the flight?", time: "22:15" },
        { me: false, text: "Don't joke about that.", time: "22:15" },
        { me: true,  text: "I'm not joking.", time: "22:16" }
      ]
    }
  ],

  crossing: { t: 0.84, title: "Across the Mediterranean", sub: "So close now…", script: "Just a little more…" },

  arrival: {
    text: ["You made it…", "To the place where my heart feels at home."],
    button: "Explore Gabès"
  },

  birthday: {
    script: "Happy Birthday",
    sub: "and Happy Valentine's Day",
    lines: ["Two special days…", "One amazing you."],
    hint: "Make a wish, then tap the candles",
    wish: "Your wish is on its way ♥",
    button: "Continue"
  },

  finale: {
    lines: [
      "You are my today,",
      "my tomorrow,",
      "and all the days after that.",
      "I'm so lucky to have you in my life.",
      "Happy Birthday, my love.",
      "Happy Valentine's Day.",
      "I love you ♥"
    ],
    voice: "assets/audio/final.mp3",
    button: "Continue"
  },

  promise: {
    lines: ["No matter the distance,", "no matter the time…", "I'll always choose you."],
    button: "Forever & Always",
    after: "Forever & always.",
    replay: "Fly our journey again"
  }
};
