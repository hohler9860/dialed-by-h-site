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
  signature: "https://www.dialedbyhenry.com/images/signature-light.png",
  signatureDark: "https://www.dialedbyhenry.com/images/signature-dark.png",
  iconIg: "https://www.dialedbyhenry.com/images/icon-instagram-light.png",
  iconIgDark: "https://www.dialedbyhenry.com/images/icon-instagram.png",
  iconWa: "https://www.dialedbyhenry.com/images/icon-whatsapp-light.png",
  iconWaDark: "https://www.dialedbyhenry.com/images/icon-whatsapp.png",
  iconMail: "https://www.dialedbyhenry.com/images/icon-mail-light.png",
  iconMailDark: "https://www.dialedbyhenry.com/images/icon-mail.png",
};

const FONT = {
  heading: "'Space Grotesk', 'Arial', 'Helvetica', sans-serif",
  body: "'Inter', 'Helvetica Neue', 'Arial', sans-serif",
};

// ── Color tokens (light default, dark mode via CSS) ──────────
const C = {
  bg: "#ffffff",
  card: "#ffffff",
  heading: "#1a1a1a",
  body: "#555555",
  muted: "#999999",
  disclaimer: "#bbbbbb",
  tag: "#999999",
  divider: "#e5e5e5",
  btnBg: "#1a1a1a",
  btnText: "#ffffff",
  featureBg: "#f5f5f5",
  featureBorder: "#e5e5e5",
  featureText: "#999999",
};

// ── Hero image library (for welcome + fallback broadcasts) ───
const HERO_IMAGES = [
  { src: "https://www.dialedbyhenry.com/images/hero-emails/nadal-richard-mille.jpg", alt: "Richard Mille on wrist" },
  { src: "https://www.dialedbyhenry.com/images/hero-emails/vacheron-222-steel.jpg", alt: "Vacheron Constantin 222 Steel" },
  { src: "https://www.dialedbyhenry.com/images/hero-emails/fp-journe.jpg", alt: "F.P. Journe" },
  { src: "https://www.dialedbyhenry.com/images/hero-emails/patek-grand-complications.jpeg", alt: "Patek Philippe Grand Complications" },
  { src: "https://www.dialedbyhenry.com/images/hero-emails/daniel-roth-extra-plat.jpeg", alt: "Daniel Roth Extra Plat" },
  { src: "https://www.dialedbyhenry.com/images/hero-emails/balancier-convexe-ceramic.jpeg", alt: "Balancier Convexe Ceramic" },
  { src: "https://www.dialedbyhenry.com/images/hero-emails/ap-royal-oak-code.jpg", alt: "Audemars Piguet Royal Oak" },
];

function pickHeroImage() {
  const idx = Math.floor(Math.random() * HERO_IMAGES.length);
  return HERO_IMAGES[idx];
}

// ── Shared CSS (dark/light mode + animations + responsive) ───
const SHARED_STYLES = `
  @media (prefers-color-scheme: dark) {
    .dark-img { display: block !important; max-height: none !important; }
    .light-img { display: none !important; max-height: 0 !important; overflow: hidden !important; }
    .email-bg { background-color: #0a0a0a !important; }
    .heading-text { color: #f0f0f0 !important; }
    .body-text { color: #a3a3a3 !important; }
    .muted-text { color: #555555 !important; }
    .tag-text { color: #777777 !important; }
    .divider-line { border-color: #1a1a1a !important; }
    .btn-cta { background-color: #ffffff !important; color: #0a0a0a !important; }
    .feature-cell { background-color: #111111 !important; border-color: #1c1c1c !important; }
    .feature-num { color: #666666 !important; border-color: #1c1c1c !important; background-color: #111111 !important; }
    .disclaimer-text { color: #333333 !important; }
    .footer-text { color: #555555 !important; }
    .detail-label { color: #555555 !important; }
    .detail-value { color: #dddddd !important; }
    .detail-border { border-color: #1a1a1a !important; }
  }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
  .animate-fade { animation: fadeIn 0.8s ease-out both; }
  .animate-slide { animation: slideUp 0.6s ease-out 0.1s both; }
  .animate-delay-1 { animation-delay: 0.15s; }
  .animate-delay-2 { animation-delay: 0.25s; }
  .animate-delay-3 { animation-delay: 0.35s; }
  .btn-cta:hover { opacity: 0.88 !important; }
  @media only screen and (max-width: 620px) {
    .content-pad { padding-left: 24px !important; padding-right: 24px !important; }
    .heading-main { font-size: 26px !important; }
    .body-main { font-size: 14px !important; }
    .btn-cta { padding: 14px 36px !important; font-size: 11px !important; }
    .hero-img { width: 100% !important; }
    .feature-title { font-size: 13px !important; }
    .feature-desc { font-size: 12px !important; }
  }
`;

// ── Shared helpers ───────────────────────────────────────────

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
    }, "\u00A0")
  );
}

function dualImg(lightSrc, darkSrc, alt, width, height, extraStyle) {
  const base = { outline: "none", border: "none", textDecoration: "none" };
  return [
    React.createElement(Img, {
      key: "light", src: darkSrc, alt, width, height: height || "auto",
      className: "light-img",
      style: { display: "block", ...base, ...extraStyle },
    }),
    React.createElement(Img, {
      key: "dark", src: lightSrc, alt, width, height: height || "auto",
      className: "dark-img",
      style: { display: "none", maxHeight: "0", overflow: "hidden", ...base, ...extraStyle },
    }),
  ];
}

function socialIcons() {
  function icon(href, lightSrc, darkSrc, alt) {
    return React.createElement("td", {
      key: alt, style: { padding: "0 14px" },
    },
      React.createElement(Link, { href, style: { textDecoration: "none" } },
        ...dualImg(lightSrc, darkSrc, alt, "22", "22", { display: "inline-block" })
      )
    );
  }
  return row(C.card, "32px 48px 16px", "center",
    React.createElement(
      "table", { role: "presentation", cellPadding: "0", cellSpacing: "0", border: "0", style: { margin: "0 auto" } },
      React.createElement("tr", null,
        icon(BRAND.instagram, BRAND.iconIg, BRAND.iconIgDark, "Instagram"),
        icon(BRAND.whatsapp, BRAND.iconWa, BRAND.iconWaDark, "WhatsApp"),
        icon(`mailto:${BRAND.email}`, BRAND.iconMail, BRAND.iconMailDark, "Email"),
      )
    )
  );
}

function footer() {
  return row(C.card, "0 48px 16px", "center", [
    React.createElement(Text, {
      key: "c", className: "footer-text",
      style: { color: C.muted, fontSize: "10px", fontFamily: FONT.heading, letterSpacing: "2.5px", textTransform: "uppercase", margin: "0 0 10px" },
    }, "\u00A9 2026 Dialed By H"),
    React.createElement(Text, {
      key: "d", className: "disclaimer-text",
      style: { color: C.disclaimer, fontSize: "10px", fontFamily: FONT.body, lineHeight: "1.6", margin: "0 0 10px", fontStyle: "italic" },
    }, "Dialed By H is an independent sourcing firm and is not an authorized dealer for any watch brand. All brand names, logos, and trademarks belong to their respective owners."),
    React.createElement(Link, {
      key: "p", href: `${BRAND.siteUrl}/privacy.html`, className: "footer-text",
      style: { color: C.muted, fontSize: "10px", fontFamily: FONT.heading, letterSpacing: "2.5px", textTransform: "uppercase", textDecoration: "none" },
    }, "Privacy & Terms"),
  ]);
}

function emailHead(previewText) {
  return [
    React.createElement(
      Head, { key: "head" },
      React.createElement(Font, {
        fontFamily: "Space Grotesk", fallbackFontFamily: "Arial",
        webFont: { url: "https://fonts.gstatic.com/s/spacegrotesk/v16/V8mDoQDjQSkFtoMM3T6r8E7mPbF4C_k3HqU.woff2", format: "woff2" },
        fontWeight: "400 700", fontStyle: "normal",
      }),
      React.createElement(Font, {
        fontFamily: "Inter", fallbackFontFamily: "Arial",
        webFont: { url: "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hiA.woff2", format: "woff2" },
        fontWeight: "400 500", fontStyle: "normal",
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

function logoRow() {
  return row(C.card, "0 48px 32px", "center",
    React.createElement(Link, { href: BRAND.siteUrl, style: { textDecoration: "none" } },
      ...dualImg(BRAND.logo, BRAND.logoDark, "Dialed By H", "180", "23")
    )
  );
}

function ctaButton(text, href, extraClass) {
  return row(C.card, "8px 48px 0", "center",
    React.createElement(Link, {
      href,
      className: ["btn-cta", extraClass].filter(Boolean).join(" "),
      style: {
        display: "inline-block",
        backgroundColor: C.btnBg,
        color: C.btnText,
        fontSize: "12px",
        fontWeight: "700",
        fontFamily: FONT.heading,
        letterSpacing: "3px",
        textTransform: "uppercase",
        textDecoration: "none",
        padding: "16px 48px",
        textAlign: "center",
        borderRadius: "2px",
      },
    }, text)
  );
}

function signoff(text) {
  return row(C.card, "32px 48px 8px", "left", [
    React.createElement(Text, {
      key: "s1", className: "body-text",
      style: { color: C.body, fontSize: "15px", lineHeight: "1.7", fontFamily: FONT.body, margin: "0 0 4px" },
    }, text || "Talk soon,"),
    React.createElement(Text, {
      key: "s2", className: "heading-text",
      style: { color: C.heading, fontSize: "15px", fontFamily: FONT.heading, margin: "0 0 2px", fontWeight: "700" },
    }, "Henry"),
    React.createElement("span", { key: "sig" },
      ...dualImg(BRAND.signature, BRAND.signatureDark, "H", "68", "49", { margin: "6px 0 0" })
    ),
  ]);
}

function featureItem(number, title, desc) {
  return React.createElement(
    "table", {
      role: "presentation", width: "100%",
      cellPadding: "0", cellSpacing: "0", border: "0",
      style: { borderCollapse: "collapse", marginBottom: "18px" },
    },
    React.createElement("tr", null,
      React.createElement("td", {
        width: "38",
        className: "feature-num",
        style: {
          textAlign: "left",
          verticalAlign: "top",
          fontFamily: FONT.heading,
          fontSize: "13px",
          fontWeight: "700",
          color: C.featureText,
          letterSpacing: "0.5px",
          paddingTop: "2px",
        },
      }, number),
      React.createElement("td", { style: { paddingLeft: "16px", verticalAlign: "top" } },
        React.createElement(Text, {
          className: "heading-text feature-title",
          style: { color: C.heading, fontSize: "14px", fontWeight: "700", fontFamily: FONT.heading, margin: "0 0 4px", letterSpacing: "0.3px" },
        }, title),
        React.createElement(Text, {
          className: "body-text feature-desc",
          style: { color: C.body, fontSize: "13px", lineHeight: "1.6", fontFamily: FONT.body, margin: "0" },
        }, desc),
      )
    )
  );
}

// ── Welcome Email ────────────────────────────────────────────

function WelcomeEmail({ firstName }) {
  const greeting = firstName ? `${firstName},` : "Welcome,";
  const hero = pickHeroImage();

  return React.createElement(
    Html, { lang: "en" },
    ...emailHead("You\u2019re in. Priority access to rare timepieces starts now."),
    emailShell([
      // Top spacer
      spacer("48px"),

      // Logo
      logoRow(),

      // Divider
      divider(),

      // Tag + Greeting + Body
      row(C.card, "40px 48px 28px", "left", [
        React.createElement(Text, {
          key: "tag", className: "tag-text",
          style: { color: C.tag, fontSize: "10px", fontWeight: "700", fontFamily: FONT.heading, letterSpacing: "4px", textTransform: "uppercase", margin: "0 0 20px" },
        }, "Private List"),
        React.createElement(Text, {
          key: "greet", className: "heading-text heading-main animate-slide",
          style: { color: C.heading, fontSize: "30px", fontWeight: "700", letterSpacing: "-0.5px", lineHeight: "1.2", margin: "0 0 28px", fontFamily: FONT.heading },
        }, greeting),
        React.createElement(Text, {
          key: "b1", className: "body-text body-main",
          style: { color: C.body, fontSize: "15px", lineHeight: "1.75", margin: "0 0 18px", fontFamily: FONT.body },
        }, "You\u2019ve just joined a very short list. As a member, you\u2019ll be first to know when rare references and off-market pieces become available -before they go public."),
        React.createElement(Text, {
          key: "b2", className: "body-text body-main",
          style: { color: C.body, fontSize: "15px", lineHeight: "1.75", margin: "0 0 18px", fontFamily: FONT.body },
        }, "Every transaction is handled personally -sourcing, authentication, and insured delivery. No middlemen, no catalogs."),
        React.createElement(Text, {
          key: "b3", className: "body-text body-main",
          style: { color: C.body, fontSize: "15px", lineHeight: "1.75", margin: "0", fontFamily: FONT.body },
        }, "Have a specific reference on your radar? Reply directly to this email."),
      ]),

      // CTA — above the fold, before image
      ctaButton("Explore the Collection", `${BRAND.siteUrl}/inventory.html`, "animate-slide animate-delay-1"),

      // Hero image — fluid, edge-to-edge within card
      React.createElement("tr", null,
        React.createElement("td", {
          bgcolor: C.card, className: "email-bg",
          style: { backgroundColor: C.card, padding: "32px 0 0 0" },
        },
          React.createElement(Img, {
            src: hero.src, alt: hero.alt, width: "600",
            className: "hero-img animate-fade animate-delay-2",
            style: { display: "block", width: "100%", maxWidth: "600px", height: "auto", outline: "none", border: "none" },
          })
        )
      ),

      // Spacer after image
      spacer("8px"),

      // Divider
      divider(),

      // What to Expect heading
      row(C.card, "36px 48px 8px", "left",
        React.createElement(Text, {
          className: "heading-text",
          style: { color: C.heading, fontSize: "10px", fontWeight: "700", fontFamily: FONT.heading, letterSpacing: "4px", textTransform: "uppercase", margin: "0 0 24px" },
        }, "What to Expect")
      ),

      // Feature items
      row(C.card, "0 48px 28px", "left", [
        React.createElement("div", { key: "f1", className: "animate-slide animate-delay-1" },
          featureItem("01", "First Access", "New arrivals and off-market pieces, sent to you before anyone else.")),
        React.createElement("div", { key: "f2", className: "animate-slide animate-delay-2" },
          featureItem("02", "Personal Sourcing", "Name the reference. I\u2019ll tap my global network to find it.")),
        React.createElement("div", { key: "f3", className: "animate-slide animate-delay-3" },
          featureItem("03", "White-Glove Service", "Authentication, documentation, and insured delivery -every detail handled.")),
      ]),

      // Divider
      divider(),

      // Sign-off
      signoff(),

      // Social icons
      socialIcons(),

      // Footer
      footer(),

      // Bottom spacer
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
};
