const React = require("react");
const {
  Html,
  Head,
  Body,
  Text,
  Img,
  Link,
  Hr,
  Font,
  Preview,
} = require("@react-email/components");

// ── Brand tokens ─────────────────────────────────────────────
const BRAND = {
  siteUrl: "https://www.dialedbyhenry.com",
  instagram: "https://www.instagram.com/dialedbyh/",
  whatsapp: "https://wa.me/19146211848",
  email: "dialedbyh@gmail.com",
  logo: "https://www.dialedbyhenry.com/images/logo.png",
  logoDark: "https://www.dialedbyhenry.com/images/logo-dark.png",
  // Solid black plaque with the white wordmark baked in. Image pixels are never
  // touched by Gmail/Outlook dark-mode inversion, so the logo reads identically
  // in light mode, Apple Mail dark mode, and Gmail's forced inversion.
  logoPlaque: "https://www.dialedbyhenry.com/images/email/logo-plaque.png",
};

const FONT = {
  heading: "'Archivo', 'Helvetica Neue', Helvetica, Arial, sans-serif",
  body: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  mono: "'Courier New', Courier, monospace",
};

// ── Color tokens ─────────────────────────────────────────────
// Chosen to survive Gmail's brightness inversion: pure white bg + near-black
// text flips to near-black bg + near-white text and stays on-brand. Critical
// text avoids mid-greys that lose contrast when shifted.
// Light base with strong contrast. Critically: NO background/text "locks"
// (no same-color gradients, no -webkit-text-fill-color). Those locks were the
// bug — they pin the background while the Gmail app still inverts the text, so
// the two collide into unreadable low-contrast mush. Without locks, the Gmail
// apps invert everything together (stays readable), and Apple Mail gets an
// explicit dark version from the @media(prefers-color-scheme:dark) block.
const C = {
  bg: "#ffffff",
  card: "#ffffff",
  heading: "#0a0a0a",
  body: "#222222",
  muted: "#555555",
  disclaimer: "#666666",
  tag: "#555555",
  divider: "#e2e2e2",
  btnBg: "#0a0a0a",
  btnText: "#ffffff",
  featureBg: "#f5f5f5",
  featureBorder: "#e2e2e2",
  featureText: "#555555",
};

// ── Legacy hero photo library (kept for compat; templates no longer use photos) ──
const HERO_IMAGES = [
  { src: "https://www.dialedbyhenry.com/images/hero-emails/nadal-richard-mille.jpg", alt: "Richard Mille on wrist" },
  { src: "https://www.dialedbyhenry.com/images/hero-emails/vacheron-222-steel.jpg", alt: "Vacheron Constantin 222 Steel" },
  { src: "https://www.dialedbyhenry.com/images/hero-emails/fp-journe.jpg", alt: "F.P. Journe" },
];

function pickHeroImage() {
  const idx = Math.floor(Math.random() * HERO_IMAGES.length);
  return HERO_IMAGES[idx];
}

// ── Die-cut watch stickers (the site's signature) ────────────
// Deterministic per seed, so every email type/send carries a different watch:
// welcome varies by name, inquiry by the requested piece, broadcast by headline.
const STICKER_COUNT = 8;
function pickSticker(seed) {
  let h = 0;
  const str = String(seed || "dbh");
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return `${BRAND.siteUrl}/images/email/sticker-${(h % STICKER_COUNT) + 1}.png`;
}

// ── Shared CSS ───────────────────────────────────────────────
// Base is a clean light email (see palette C, no locks). This block adds:
//  1) an opacity:1 safety net so entrance animations can never strand text
//     invisible at their opacity:0 keyframe start;
//  2) an explicit dark version via @media(prefers-color-scheme:dark) for clients
//     that honor it (Apple Mail, Gmail *web*) — dark card, light text, inverted
//     white button. !important beats the inline colors. Gmail's mobile apps
//     ignore this and run their own inversion, which now works because there are
//     no background/text locks fighting it.
const SHARED_STYLES = `
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
  .animate-fade { animation: fadeIn 0.8s ease-out both; }
  .animate-slide { animation: slideUp 0.6s ease-out 0.1s both; }
  .animate-delay-1 { animation-delay: 0.15s; }
  .animate-delay-2 { animation-delay: 0.25s; }
  .animate-delay-3 { animation-delay: 0.35s; }
  .animate-fade, .animate-slide { opacity: 1 !important; }
  .btn-cta:hover { opacity: 0.88 !important; }
  @media only screen and (max-width: 620px) {
    .content-pad { padding-left: 24px !important; padding-right: 24px !important; }
    .heading-main { font-size: 30px !important; }
    .body-main { font-size: 14px !important; }
    .btn-cta { padding: 16px 34px !important; font-size: 11px !important; }
    .sticker-cell { width: 88px !important; }
    .sticker-img { width: 88px !important; }
    .trust-line { font-size: 8px !important; letter-spacing: 1.5px !important; }
  }
  @media (prefers-color-scheme: dark) {
    body, .email-bg { background-color: #151515 !important; }
    .heading-text, .heading-main, .detail-value, .feature-title { color: #f4f4f4 !important; }
    .body-text, .body-main, .feature-desc { color: #e4e4e4 !important; }
    .tag-text, .muted-text, .detail-label, .footer-text, .feature-num { color: #b2b2b2 !important; }
    .disclaimer-text { color: #949494 !important; }
    .footer-link { color: #ededed !important; }
    .divider-line { border-color: #333333 !important; }
    .quote-cell { border-left-color: #f4f4f4 !important; }
    .btn-td, .btn-cta { background-color: #ffffff !important; }
    .btn-cta { color: #0a0a0a !important; }
  }
`;

// ── Layout primitives ────────────────────────────────────────

function row(bgColor, padding, align, children, extraClass) {
  return React.createElement(
    "tr", null,
    React.createElement("td", {
      bgcolor: bgColor,
      className: ["content-pad", "email-bg", extraClass].filter(Boolean).join(" "),
      align: align || "left",
      style: { backgroundColor: bgColor, padding, fontFamily: FONT.body },
    }, children)
  );
}

function divider(bgColor) {
  return React.createElement("tr", null,
    React.createElement("td", {
      bgcolor: bgColor || C.card,
      className: "content-pad email-bg",
      style: { backgroundColor: bgColor || C.card, padding: "0 48px" },
    },
      React.createElement(Hr, {
        className: "divider-line",
        style: { borderColor: C.divider, borderWidth: "1px 0 0 0", margin: "0" },
      })
    )
  );
}

function spacer(height, bgColor) {
  return React.createElement("tr", null,
    React.createElement("td", {
      bgcolor: bgColor || C.card,
      className: "email-bg",
      style: { backgroundColor: bgColor || C.card, height, fontSize: "0", lineHeight: "0" },
    }, " ")
  );
}

// kept for compat with older callers; new templates use single baked-contrast images
function dualImg(lightSrc, darkSrc, alt, width, height, extraStyle) {
  const base = { outline: "none", border: "none", textDecoration: "none" };
  return [
    React.createElement(Img, {
      key: "img", src: darkSrc, alt, width, height: height || "auto",
      style: { display: "block", ...base, ...extraStyle },
    }),
  ];
}

function emailHead(previewText) {
  return [
    React.createElement(
      Head, { key: "head" },
      React.createElement(Font, {
        fontFamily: "Archivo", fallbackFontFamily: "Helvetica",
        webFont: { url: "https://www.dialedbyhenry.com/fonts/Archivo-wdth-wght.woff2", format: "woff2" },
        fontWeight: "100 900", fontStyle: "normal",
      }),
      React.createElement("meta", { name: "color-scheme", content: "light dark" }),
      React.createElement("meta", { name: "supported-color-schemes", content: "light dark" }),
      React.createElement("style", { dangerouslySetInnerHTML: { __html: SHARED_STYLES } }),
    ),
    React.createElement(Preview, { key: "preview" }, previewText),
  ];
}

function emailShell(children) {
  return React.createElement(
    Body, { style: { margin: 0, padding: 0, backgroundColor: C.bg } },
    React.createElement(
      "table", {
        role: "presentation", width: "100%", bgcolor: C.bg,
        cellPadding: "0", cellSpacing: "0", border: "0",
        className: "email-bg",
        style: { backgroundColor: C.bg, borderCollapse: "collapse" },
      },
      React.createElement("tr", null,
        React.createElement("td", {
          align: "center", valign: "top", bgcolor: C.bg,
          className: "email-bg",
          style: { backgroundColor: C.bg },
        },
          React.createElement(
            "table", {
              role: "presentation", width: "100%", bgcolor: C.card,
              cellPadding: "0", cellSpacing: "0", border: "0",
              className: "email-bg",
              style: { backgroundColor: C.card, borderCollapse: "collapse", maxWidth: "600px" },
            },
            ...children
          )
        )
      )
    )
  );
}

// ── Brand components ─────────────────────────────────────────

function logoRow() {
  return row(C.card, "0 48px 34px", "center",
    React.createElement(Link, { href: BRAND.siteUrl, style: { textDecoration: "none" } },
      React.createElement(Img, {
        src: BRAND.logoPlaque, alt: "Dialed By H", width: "252",
        style: { display: "block", width: "252px", height: "auto", outline: "none", border: "none" },
      })
    )
  );
}

// eyebrow + big display headline, die-cut sticker on the right
function headerBlock(tag, headline, seed) {
  const sticker = pickSticker(seed);
  return React.createElement(
    "table", {
      role: "presentation", width: "100%",
      cellPadding: "0", cellSpacing: "0", border: "0",
      style: { borderCollapse: "collapse", marginBottom: "22px" },
    },
    React.createElement("tr", null,
      React.createElement("td", { style: { verticalAlign: "top" } },
        React.createElement(Text, {
          className: "tag-text",
          style: { color: C.tag, fontSize: "10px", fontWeight: "700", fontFamily: FONT.mono, letterSpacing: "4px", textTransform: "uppercase", margin: "0 0 18px" },
        }, tag),
        React.createElement(Text, {
          className: "heading-text heading-main animate-slide",
          style: { color: C.heading, fontSize: "38px", fontWeight: "800", letterSpacing: "-0.5px", lineHeight: "1.05", margin: "0", fontFamily: FONT.heading, textTransform: "uppercase", fontStretch: "125%" },
        }, headline)
      ),
      React.createElement("td", { width: "112", className: "sticker-cell", style: { verticalAlign: "top", paddingLeft: "18px" } },
        React.createElement(Img, {
          src: sticker, alt: "", width: "112",
          className: "animate-fade animate-delay-1 sticker-img",
          style: { display: "block", width: "112px", height: "auto", outline: "none", border: "none" },
        })
      )
    )
  );
}

// bulletproof CTA: real <td> with bgcolor + padded link, no images, no radius
function ctaButton(text, href, extraClass) {
  return row(C.card, "10px 48px 0", "center",
    React.createElement(
      "table", { role: "presentation", cellPadding: "0", cellSpacing: "0", border: "0", style: { margin: "0 auto" } },
      React.createElement("tr", null,
        React.createElement("td", {
          bgcolor: C.btnBg,
          className: "btn-td",
          style: { backgroundColor: C.btnBg },
        },
          React.createElement(Link, {
            href,
            className: ["btn-cta", extraClass].filter(Boolean).join(" "),
            style: {
              display: "inline-block",
              backgroundColor: C.btnBg,
              color: C.btnText,
              fontSize: "11px",
              fontWeight: "700",
              fontFamily: FONT.mono,
              letterSpacing: "3px",
              textTransform: "uppercase",
              textDecoration: "none",
              padding: "18px 52px",
              textAlign: "center",
            },
          }, text)
        )
      )
    )
  );
}

// peer social proof — one short verified quote, thin rule, mono attribution
function quoteBlock(quote, name, role) {
  return row(C.card, "0 48px 8px", "left",
    React.createElement(
      "table", { role: "presentation", width: "100%", cellPadding: "0", cellSpacing: "0", border: "0", style: { borderCollapse: "collapse" } },
      React.createElement("tr", null,
        React.createElement("td", {
          className: "quote-cell",
          style: { borderLeft: `2px solid ${C.heading}`, paddingLeft: "20px" },
        },
          React.createElement(Text, {
            className: "body-text",
            style: { color: C.body, fontSize: "14px", lineHeight: "1.7", fontFamily: FONT.body, margin: "0 0 10px", fontStyle: "italic" },
          }, `“${quote}”`),
          React.createElement(Text, {
            className: "muted-text",
            style: { color: C.muted, fontSize: "10px", fontWeight: "700", fontFamily: FONT.mono, letterSpacing: "2.5px", textTransform: "uppercase", margin: "0" },
          }, `${name} · ${role}`)
        )
      )
    )
  );
}

function signoff(text) {
  return row(C.card, "32px 48px 8px", "left", [
    React.createElement(Text, {
      key: "s1", className: "body-text",
      style: { color: C.body, fontSize: "15px", lineHeight: "1.7", fontFamily: FONT.body, margin: "0 0 6px" },
    }, text || "Talk soon,"),
    React.createElement(Text, {
      key: "s2", className: "heading-text",
      style: { color: C.heading, fontSize: "16px", fontFamily: FONT.heading, margin: "0 0 4px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "1px", fontStretch: "125%" },
    }, "Henry"),
  ]);
}

// mono text links — no icon images to vanish in dark mode
function socialIcons() {
  const linkStyle = {
    color: C.heading, fontSize: "10px", fontWeight: "700", fontFamily: FONT.mono,
    letterSpacing: "2.5px", textTransform: "uppercase", textDecoration: "underline",
  };
  const dotStyle = { padding: "0 10px", color: C.muted, fontSize: "10px", fontFamily: FONT.mono };
  return row(C.card, "30px 48px 18px", "center",
    React.createElement(
      "table", { role: "presentation", cellPadding: "0", cellSpacing: "0", border: "0", style: { margin: "0 auto" } },
      React.createElement("tr", null,
        React.createElement("td", { key: "ig" }, React.createElement(Link, { href: BRAND.instagram, className: "footer-link", style: linkStyle }, "Instagram")),
        React.createElement("td", { key: "d1", className: "muted-text", style: dotStyle }, "·"),
        React.createElement("td", { key: "wa" }, React.createElement(Link, { href: BRAND.whatsapp, className: "footer-link", style: linkStyle }, "WhatsApp")),
        React.createElement("td", { key: "d2", className: "muted-text", style: dotStyle }, "·"),
        React.createElement("td", { key: "em" }, React.createElement(Link, { href: `mailto:${BRAND.email}`, className: "footer-link", style: linkStyle }, "Email")),
      )
    )
  );
}

function footer() {
  return row(C.card, "0 48px 16px", "center", [
    React.createElement(Text, {
      key: "c", className: "footer-text",
      style: { color: C.muted, fontSize: "10px", fontFamily: FONT.mono, fontWeight: "700", letterSpacing: "2.5px", textTransform: "uppercase", margin: "0 0 12px" },
    }, "© 2026 Dialed By H — dialedbyhenry.com"),
    React.createElement(Text, {
      key: "d", className: "disclaimer-text",
      style: { color: C.disclaimer, fontSize: "10px", fontFamily: FONT.body, lineHeight: "1.6", margin: "0 0 12px" },
    }, "Dialed By H is an independent sourcing firm and is not an authorized dealer for any watch brand. All brand names, logos, and trademarks belong to their respective owners."),
    React.createElement(Link, {
      key: "p", href: `${BRAND.siteUrl}/privacy.html`, className: "footer-text",
      style: { color: C.muted, fontSize: "10px", fontFamily: FONT.mono, fontWeight: "700", letterSpacing: "2.5px", textTransform: "uppercase", textDecoration: "underline" },
    }, "Privacy & Terms"),
  ]);
}

function featureItem(number, title, desc) {
  return React.createElement(
    "table", {
      role: "presentation", width: "100%",
      cellPadding: "0", cellSpacing: "0", border: "0",
      style: { borderCollapse: "collapse", marginBottom: "20px" },
    },
    React.createElement("tr", null,
      React.createElement("td", {
        width: "38",
        className: "feature-num",
        style: {
          textAlign: "left",
          verticalAlign: "top",
          fontFamily: FONT.mono,
          fontSize: "12px",
          fontWeight: "700",
          color: C.featureText,
          letterSpacing: "1px",
          paddingTop: "3px",
        },
      }, number),
      React.createElement("td", { style: { paddingLeft: "16px", verticalAlign: "top" } },
        React.createElement(Text, {
          className: "heading-text feature-title",
          style: { color: C.heading, fontSize: "14px", fontWeight: "800", fontFamily: FONT.heading, margin: "0 0 4px", letterSpacing: "0.5px", textTransform: "uppercase", fontStretch: "125%" },
        }, title),
        React.createElement(Text, {
          className: "body-text feature-desc",
          style: { color: C.body, fontSize: "13px", lineHeight: "1.65", fontFamily: FONT.body, margin: "0" },
        }, desc),
      )
    )
  );
}

// mono section label ("WHAT TO EXPECT", "WHAT HAPPENS NEXT")
function sectionLabel(text) {
  return row(C.card, "36px 48px 8px", "left",
    React.createElement(Text, {
      className: "muted-text",
      style: { color: C.muted, fontSize: "10px", fontWeight: "700", fontFamily: FONT.mono, letterSpacing: "4px", textTransform: "uppercase", margin: "0 0 22px" },
    }, text)
  );
}

// ── Welcome Email ────────────────────────────────────────────

function WelcomeEmail({ firstName }) {
  const headline = firstName ? `${firstName}. You’re in.` : "You’re in.";

  return React.createElement(
    Html, { lang: "en" },
    ...emailHead("You’re on the list. Off-market pieces reach you first."),
    emailShell([
      spacer("44px"),
      logoRow(),
      divider(),

      row(C.card, "38px 48px 24px", "left", [
        React.createElement("div", { key: "hdr" }, headerBlock("Private List", headline, firstName || "welcome")),
        React.createElement(Text, {
          key: "b1", className: "body-text body-main",
          style: { color: C.body, fontSize: "15px", lineHeight: "1.75", margin: "0 0 16px", fontFamily: FONT.body },
        }, "You just joined a very short list. When rare references and off-market pieces surface, you hear about them first, before they go public."),
        React.createElement(Text, {
          key: "b2", className: "body-text body-main",
          style: { color: C.body, fontSize: "15px", lineHeight: "1.75", margin: "0", fontFamily: FONT.body },
        }, "Chasing a specific reference? Reply to this email and I’ll get on it."),
      ]),

      ctaButton("Browse Pieces", `${BRAND.siteUrl}/inventory.html`, "animate-slide animate-delay-1"),

      spacer("34px"),
      divider(),

      sectionLabel("What to Expect"),
      row(C.card, "0 48px 24px", "left", [
        React.createElement("div", { key: "f1", className: "animate-slide animate-delay-1" },
          featureItem("01", "First Access", "New arrivals and off-market pieces, sent to you before anyone else.")),
        React.createElement("div", { key: "f2", className: "animate-slide animate-delay-2" },
          featureItem("02", "Personal Sourcing", "Name the reference. I’ll tap my network to find it.")),
        React.createElement("div", { key: "f3", className: "animate-slide animate-delay-3" },
          featureItem("03", "White-Glove Service", "Authentication, documentation, and insured delivery. Every detail handled.")),
      ]),

      quoteBlock(
        "He’s the only guy I’m dealing with for these pieces going forward.",
        "James S.", "Verified Client"
      ),

      spacer("10px"),
      divider(),

      signoff(),
      socialIcons(),
      footer(),
      spacer("40px"),
    ])
  );
}

module.exports = {
  WelcomeEmail,
  BRAND, FONT, C,
  HERO_IMAGES, pickHeroImage,
  SHARED_STYLES,
  row, divider, spacer, dualImg,
  socialIcons, footer, emailHead, emailShell, logoRow, ctaButton, signoff, featureItem,
  pickSticker, headerBlock, quoteBlock, sectionLabel,
};
