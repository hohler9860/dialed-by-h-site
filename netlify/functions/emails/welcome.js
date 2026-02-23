const React = require("react");
const {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Img,
  Link,
  Hr,
  Font,
  Preview,
} = require("@react-email/components");

// ── Brand tokens
const BRAND = {
  siteUrl: "https://dialedbyhenry.com",
  instagram: "https://www.instagram.com/dialedbyh/",
  whatsapp: "https://wa.me/19146211848",
  email: "dialedbyh@gmail.com",
  // Light mode assets
  logoDark: "https://dialedbyhenry.com/images/logo-dark.png",
  signatureDark: "https://dialedbyhenry.com/images/signature-dark.png",
  iconIg: "https://dialedbyhenry.com/images/icon-instagram.png",
  iconWa: "https://dialedbyhenry.com/images/icon-whatsapp.png",
  iconMail: "https://dialedbyhenry.com/images/icon-mail.png",
  // Dark mode assets
  logoLight: "https://dialedbyhenry.com/images/logo.png",
  signatureLight: "https://dialedbyhenry.com/images/signature-light.png",
  iconIgLight: "https://dialedbyhenry.com/images/icon-instagram-light.png",
  iconWaLight: "https://dialedbyhenry.com/images/icon-whatsapp-light.png",
  iconMailLight: "https://dialedbyhenry.com/images/icon-mail-light.png",
};

// ── Shared font stacks
const FONT = {
  heading: "'Space Grotesk', 'Arial', 'Helvetica', sans-serif",
  body: "'Inter', 'Helvetica Neue', 'Arial', sans-serif",
};

// ── Color tokens (light mode defaults)
const C = {
  bg: "#f8f8f8",
  card: "#ffffff",
  heading: "#0a0a0a",
  body: "#444444",
  muted: "#888888",
  border: "#e5e5e5",
  btnBg: "#0a0a0a",
  btnText: "#ffffff",
  disclaimer: "#aaaaaa",
};

function WelcomeEmail({ firstName }) {
  const greeting = firstName ? `${firstName},` : "Welcome,";

  // Dark mode CSS — targets @media (prefers-color-scheme: dark)
  // Supported by Apple Mail, Outlook (iOS/macOS), Gmail (mobile), Hey, etc.
  const darkModeCSS = `
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    @media (prefers-color-scheme: dark) {
      body, .email-body { background-color: #0a0a0a !important; }
      .email-card { background-color: #111111 !important; }
      .text-heading { color: #f0f0f0 !important; }
      .text-body { color: #bbbbbb !important; }
      .text-muted { color: #777777 !important; }
      .text-disclaimer { color: #555555 !important; }
      .border-line { border-color: #222222 !important; }
      .btn-cta { background-color: #f0f0f0 !important; color: #0a0a0a !important; }
      .logo-dark { display: none !important; }
      .logo-light { display: inline-block !important; }
      .sig-dark { display: none !important; }
      .sig-light { display: block !important; }
      .icon-dark { display: none !important; }
      .icon-light { display: inline-block !important; }
    }
  `;

  return React.createElement(
    Html,
    { lang: "en" },
    React.createElement(
      Head,
      null,
      React.createElement(Font, {
        fontFamily: "Space Grotesk",
        fallbackFontFamily: "Arial",
        webFont: {
          url: "https://fonts.gstatic.com/s/spacegrotesk/v16/V8mDoQDjQSkFtoMM3T6r8E7mPbF4C_k3HqU.woff2",
          format: "woff2",
        },
        fontWeight: "400 700",
        fontStyle: "normal",
      }),
      React.createElement(Font, {
        fontFamily: "Inter",
        fallbackFontFamily: "Arial",
        webFont: {
          url: "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hiA.woff2",
          format: "woff2",
        },
        fontWeight: "400 500",
        fontStyle: "normal",
      }),
      React.createElement("meta", { name: "color-scheme", content: "light dark" }),
      React.createElement("meta", { name: "supported-color-schemes", content: "light dark" }),
      React.createElement("style", { dangerouslySetInnerHTML: { __html: darkModeCSS } })
    ),
    React.createElement(Preview, null, "You\u2019re on the private list. Priority access to rare timepieces."),
    React.createElement(
      Body,
      {
        className: "email-body",
        style: {
          backgroundColor: C.bg,
          fontFamily: FONT.body,
          margin: 0,
          padding: 0,
        },
      },

      // ── Outer container
      React.createElement(
        Container,
        {
          className: "email-card",
          style: {
            backgroundColor: C.card,
            maxWidth: "600px",
            margin: "0 auto",
            padding: "0",
            borderRadius: "0",
          },
        },

        // ── Top spacer
        React.createElement(Section, { style: { height: "48px" } }),

        // ── Logo (light mode: dark logo, dark mode: light logo)
        React.createElement(
          Section,
          { style: { textAlign: "center", padding: "0 40px 36px" } },
          React.createElement(
            Link,
            { href: BRAND.siteUrl },
            // Dark logo (visible in light mode, hidden in dark)
            React.createElement(Img, {
              className: "logo-dark",
              src: BRAND.logoDark,
              alt: "Dialed By H",
              width: "200",
              height: "26",
              style: { display: "inline-block", outline: "none", border: "none", textDecoration: "none" },
            }),
            // Light logo (hidden in light mode, visible in dark)
            React.createElement(Img, {
              className: "logo-light",
              src: BRAND.logoLight,
              alt: "Dialed By H",
              width: "200",
              height: "26",
              style: { display: "none", outline: "none", border: "none", textDecoration: "none" },
            })
          )
        ),

        // ── Divider
        React.createElement(Hr, { className: "border-line", style: { borderColor: C.border, borderWidth: "1px 0 0 0", margin: "0 40px" } }),

        // ── Main content
        React.createElement(
          Section,
          { style: { padding: "40px 40px 32px" } },

          // Greeting
          React.createElement(Text, {
            className: "text-heading",
            style: { color: C.heading, fontSize: "26px", fontWeight: "700", letterSpacing: "-0.5px", lineHeight: "1.3", margin: "0 0 28px", fontFamily: FONT.heading },
          }, greeting),

          // Body paragraph 1
          React.createElement(Text, {
            className: "text-body",
            style: { color: C.body, fontSize: "15px", lineHeight: "1.75", margin: "0 0 20px", fontFamily: FONT.body },
          }, "You\u2019re now on the Dialed By H private list. This means you\u2019ll be the first to know when off-market pieces, rare references, and exclusive sourcing opportunities become available."),

          // Body paragraph 2
          React.createElement(Text, {
            className: "text-body",
            style: { color: C.body, fontSize: "15px", lineHeight: "1.75", margin: "0 0 20px", fontFamily: FONT.body },
          }, "Whether you\u2019re looking to buy, sell, or trade, I handle the entire process personally, from sourcing through authentication to delivery."),

          // Body paragraph 3
          React.createElement(Text, {
            className: "text-body",
            style: { color: C.body, fontSize: "15px", lineHeight: "1.75", margin: "0 0 32px", fontFamily: FONT.body },
          }, "If you have a specific piece in mind, reply to this email or reach out anytime. I\u2019d love to help.")
        ),

        // ── CTA Button
        React.createElement(
          Section,
          { style: { textAlign: "center", padding: "0 40px 44px" } },
          React.createElement(Link, {
            className: "btn-cta",
            href: `${BRAND.siteUrl}/inventory.html`,
            style: {
              display: "inline-block", backgroundColor: C.btnBg, color: C.btnText,
              fontSize: "11px", fontWeight: "700", fontFamily: FONT.heading,
              letterSpacing: "3px", textTransform: "uppercase", textDecoration: "none",
              padding: "16px 44px", textAlign: "center",
            },
          }, "Browse the Collection")
        ),

        // ── Divider
        React.createElement(Hr, { className: "border-line", style: { borderColor: C.border, borderWidth: "1px 0 0 0", margin: "0 40px" } }),

        // ── What to expect heading
        React.createElement(
          Section,
          { style: { padding: "40px 40px 8px" } },
          React.createElement(Text, {
            className: "text-heading",
            style: { color: C.heading, fontSize: "11px", fontWeight: "700", fontFamily: FONT.heading, letterSpacing: "3px", textTransform: "uppercase", margin: "0 0 24px" },
          }, "What to Expect")
        ),

        // ── Feature 1
        React.createElement(
          Section,
          { style: { padding: "0 40px 24px" } },
          React.createElement(Text, { className: "text-heading", style: { color: C.heading, fontSize: "14px", fontWeight: "700", fontFamily: FONT.heading, margin: "0 0 6px", letterSpacing: "0.3px" } }, "Priority Alerts"),
          React.createElement(Text, { className: "text-body", style: { color: C.body, fontSize: "14px", lineHeight: "1.65", fontFamily: FONT.body, margin: "0" } }, "New arrivals and off-market pieces sent to you before anyone else.")
        ),

        // ── Feature 2
        React.createElement(
          Section,
          { style: { padding: "0 40px 24px" } },
          React.createElement(Text, { className: "text-heading", style: { color: C.heading, fontSize: "14px", fontWeight: "700", fontFamily: FONT.heading, margin: "0 0 6px", letterSpacing: "0.3px" } }, "Personal Sourcing"),
          React.createElement(Text, { className: "text-body", style: { color: C.body, fontSize: "14px", lineHeight: "1.65", fontFamily: FONT.body, margin: "0" } }, "Tell me what you\u2019re looking for and I\u2019ll tap my global network to find it.")
        ),

        // ── Feature 3
        React.createElement(
          Section,
          { style: { padding: "0 40px 24px" } },
          React.createElement(Text, { className: "text-heading", style: { color: C.heading, fontSize: "14px", fontWeight: "700", fontFamily: FONT.heading, margin: "0 0 6px", letterSpacing: "0.3px" } }, "Full Concierge Service"),
          React.createElement(Text, { className: "text-body", style: { color: C.body, fontSize: "14px", lineHeight: "1.65", fontFamily: FONT.body, margin: "0" } }, "Authentication, documentation, insured delivery. Every detail handled.")
        ),

        // ── Spacer
        React.createElement(Section, { style: { height: "16px" } }),

        // ── Footer divider
        React.createElement(Hr, { className: "border-line", style: { borderColor: C.border, borderWidth: "1px 0 0 0", margin: "0 40px" } }),

        // ── Sign-off
        React.createElement(
          Section,
          { style: { padding: "32px 40px 8px" } },
          React.createElement(Text, {
            className: "text-body",
            style: { color: C.body, fontSize: "15px", lineHeight: "1.7", fontFamily: FONT.body, margin: "0 0 4px" },
          }, "Talk soon,"),
          React.createElement(Text, {
            className: "text-heading",
            style: { color: C.heading, fontSize: "15px", fontFamily: FONT.heading, margin: "0 0 2px", fontWeight: "700" },
          }, "Henry"),
          // H signature — dark version (light mode)
          React.createElement(Img, {
            className: "sig-dark",
            src: BRAND.signatureDark,
            alt: "H",
            width: "80",
            height: "58",
            style: { display: "block", margin: "6px 0 0", outline: "none", border: "none", textDecoration: "none" },
          }),
          // H signature — light version (dark mode)
          React.createElement(Img, {
            className: "sig-light",
            src: BRAND.signatureLight,
            alt: "H",
            width: "80",
            height: "58",
            style: { display: "none", margin: "6px 0 0", outline: "none", border: "none", textDecoration: "none" },
          })
        ),

        // ── Social icons
        React.createElement(
          Section,
          { style: { textAlign: "center", padding: "32px 40px 16px" } },
          React.createElement(
            "table",
            { role: "presentation", style: { margin: "0 auto" }, cellPadding: "0", cellSpacing: "0", border: "0" },
            React.createElement(
              "tr",
              null,
              // Instagram
              React.createElement("td", { style: { padding: "0 14px" } },
                React.createElement(Link, { href: BRAND.instagram, style: { textDecoration: "none" } },
                  React.createElement(Img, { className: "icon-dark", src: BRAND.iconIg, alt: "Instagram", width: "22", height: "22", style: { display: "inline-block" } }),
                  React.createElement(Img, { className: "icon-light", src: BRAND.iconIgLight, alt: "Instagram", width: "22", height: "22", style: { display: "none" } })
                )
              ),
              // WhatsApp
              React.createElement("td", { style: { padding: "0 14px" } },
                React.createElement(Link, { href: BRAND.whatsapp, style: { textDecoration: "none" } },
                  React.createElement(Img, { className: "icon-dark", src: BRAND.iconWa, alt: "WhatsApp", width: "22", height: "22", style: { display: "inline-block" } }),
                  React.createElement(Img, { className: "icon-light", src: BRAND.iconWaLight, alt: "WhatsApp", width: "22", height: "22", style: { display: "none" } })
                )
              ),
              // Email
              React.createElement("td", { style: { padding: "0 14px" } },
                React.createElement(Link, { href: `mailto:${BRAND.email}`, style: { textDecoration: "none" } },
                  React.createElement(Img, { className: "icon-dark", src: BRAND.iconMail, alt: "Email", width: "22", height: "22", style: { display: "inline-block" } }),
                  React.createElement(Img, { className: "icon-light", src: BRAND.iconMailLight, alt: "Email", width: "22", height: "22", style: { display: "none" } })
                )
              )
            )
          )
        ),

        // ── Footer text
        React.createElement(
          Section,
          { style: { textAlign: "center", padding: "0 40px 16px" } },
          React.createElement(Text, {
            className: "text-muted",
            style: { color: C.muted, fontSize: "11px", fontFamily: FONT.heading, letterSpacing: "2px", textTransform: "uppercase", margin: "0 0 12px" },
          }, "\u00A9 2026 Dialed By H"),
          React.createElement(Text, {
            className: "text-disclaimer",
            style: { color: C.disclaimer, fontSize: "10px", fontFamily: FONT.body, lineHeight: "1.6", margin: "0 0 12px", fontStyle: "italic" },
          }, "Dialed By H is an independent sourcing firm and is not affiliated with Rolex, Patek Philippe, Audemars Piguet, or any respective brand. All trademarks belong to their respective owners."),
          React.createElement(Link, {
            className: "text-muted",
            href: `${BRAND.siteUrl}/privacy.html`,
            style: { color: C.muted, fontSize: "10px", fontFamily: FONT.heading, letterSpacing: "2px", textTransform: "uppercase", textDecoration: "none" },
          }, "Privacy & Terms")
        ),

        // ── Bottom spacer
        React.createElement(Section, { style: { height: "48px" } })
      )
    )
  );
}

module.exports = { WelcomeEmail, BRAND };
