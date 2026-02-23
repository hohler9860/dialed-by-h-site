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

// ── Brand tokens (light theme for email)
const BRAND = {
  white: "#ffffff",
  bg: "#f8f8f8",
  black: "#0a0a0a",
  dark: "#1a1a1a",
  body: "#444444",
  muted: "#888888",
  border: "#e5e5e5",
  borderLight: "#eeeeee",
  logoDarkUrl: "https://dialedbyhenry.com/images/logo-dark.png",
  siteUrl: "https://dialedbyhenry.com",
  instagram: "https://www.instagram.com/dialedbyh/",
  whatsapp: "https://wa.me/19146211848",
  email: "dialedbyh@gmail.com",
};

// ── Shared font stacks
const FONT = {
  heading: "'Space Grotesk', 'Arial', 'Helvetica', sans-serif",
  body: "'Inter', 'Helvetica Neue', 'Arial', sans-serif",
  signature: "'Dancing Script', 'Brush Script MT', 'Segoe Script', cursive",
};

// ── Social icon SVGs (inline data URIs — email-safe, no JS needed)
const ICON = {
  instagram: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%23888888' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect width='20' height='20' x='2' y='2' rx='5' ry='5'/%3E%3Cpath d='M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z'/%3E%3Cline x1='17.5' x2='17.51' y1='6.5' y2='6.5'/%3E%3C/svg%3E",
  whatsapp: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%23888888' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z'/%3E%3C/svg%3E",
  mail: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%23888888' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect width='20' height='16' x='2' y='4' rx='2'/%3E%3Cpath d='m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7'/%3E%3C/svg%3E",
};

function WelcomeEmail({ firstName }) {
  const greeting = firstName ? `${firstName},` : "Welcome,";

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
      React.createElement(Font, {
        fontFamily: "Dancing Script",
        fallbackFontFamily: "cursive",
        webFont: {
          url: "https://fonts.gstatic.com/s/dancingscript/v25/If2cXTr6YS-zF4S-kcSWSVi_sxjsohD9F50Ruu7BMSo3Sup6hNX6plRP.woff2",
          format: "woff2",
        },
        fontWeight: "700",
        fontStyle: "normal",
      }),
      React.createElement("meta", { name: "color-scheme", content: "light" }),
      React.createElement("meta", { name: "supported-color-schemes", content: "light" })
    ),
    React.createElement(Preview, null, "You\u2019re on the private list \u2014 priority access to rare timepieces."),
    React.createElement(
      Body,
      {
        style: {
          backgroundColor: BRAND.bg,
          fontFamily: FONT.body,
          margin: 0,
          padding: 0,
        },
      },

      // ── Outer container (white card on light grey)
      React.createElement(
        Container,
        {
          style: {
            backgroundColor: BRAND.white,
            maxWidth: "600px",
            margin: "0 auto",
            padding: "0",
            borderRadius: "0",
          },
        },

        // ── Top spacer
        React.createElement(Section, { style: { height: "48px" } }),

        // ── Logo
        React.createElement(
          Section,
          { style: { textAlign: "center", padding: "0 40px 36px" } },
          React.createElement(
            Link,
            { href: BRAND.siteUrl },
            React.createElement(Img, {
              src: BRAND.logoDarkUrl,
              alt: "Dialed By H",
              width: "200",
              height: "26",
              style: {
                display: "inline-block",
                outline: "none",
                border: "none",
                textDecoration: "none",
              },
            })
          )
        ),

        // ── Divider
        React.createElement(Hr, {
          style: {
            borderColor: BRAND.border,
            borderWidth: "1px 0 0 0",
            margin: "0 40px",
          },
        }),

        // ── Main content
        React.createElement(
          Section,
          { style: { padding: "40px 40px 32px" } },

          // Greeting
          React.createElement(
            Text,
            {
              style: {
                color: BRAND.black,
                fontSize: "26px",
                fontWeight: "700",
                letterSpacing: "-0.5px",
                lineHeight: "1.3",
                margin: "0 0 28px",
                fontFamily: FONT.heading,
              },
            },
            greeting
          ),

          // Body paragraph 1
          React.createElement(
            Text,
            {
              style: {
                color: BRAND.body,
                fontSize: "15px",
                lineHeight: "1.75",
                margin: "0 0 20px",
                fontFamily: FONT.body,
              },
            },
            "You\u2019re now on the Dialed By H private list. This means you\u2019ll be the first to know when off-market pieces, rare references, and exclusive sourcing opportunities become available."
          ),

          // Body paragraph 2
          React.createElement(
            Text,
            {
              style: {
                color: BRAND.body,
                fontSize: "15px",
                lineHeight: "1.75",
                margin: "0 0 20px",
                fontFamily: FONT.body,
              },
            },
            "Whether you\u2019re looking to buy, sell, or trade \u2014 I handle the entire process personally, from sourcing through authentication to delivery."
          ),

          // Body paragraph 3
          React.createElement(
            Text,
            {
              style: {
                color: BRAND.body,
                fontSize: "15px",
                lineHeight: "1.75",
                margin: "0 0 32px",
                fontFamily: FONT.body,
              },
            },
            "If you have a specific piece in mind, reply to this email or reach out anytime \u2014 I\u2019d love to help."
          )
        ),

        // ── CTA Button
        React.createElement(
          Section,
          { style: { textAlign: "center", padding: "0 40px 44px" } },
          React.createElement(
            Link,
            {
              href: `${BRAND.siteUrl}/inventory.html`,
              style: {
                display: "inline-block",
                backgroundColor: BRAND.black,
                color: BRAND.white,
                fontSize: "11px",
                fontWeight: "700",
                fontFamily: FONT.heading,
                letterSpacing: "3px",
                textTransform: "uppercase",
                textDecoration: "none",
                padding: "16px 44px",
                textAlign: "center",
              },
            },
            "Browse the Collection"
          )
        ),

        // ── Divider
        React.createElement(Hr, {
          style: {
            borderColor: BRAND.border,
            borderWidth: "1px 0 0 0",
            margin: "0 40px",
          },
        }),

        // ── What to expect heading
        React.createElement(
          Section,
          { style: { padding: "40px 40px 8px" } },
          React.createElement(
            Text,
            {
              style: {
                color: BRAND.black,
                fontSize: "11px",
                fontWeight: "700",
                fontFamily: FONT.heading,
                letterSpacing: "3px",
                textTransform: "uppercase",
                margin: "0 0 24px",
              },
            },
            "What to Expect"
          )
        ),

        // ── Feature 1
        React.createElement(
          Section,
          { style: { padding: "0 40px 24px" } },
          React.createElement(Text, { style: { color: BRAND.black, fontSize: "14px", fontWeight: "700", fontFamily: FONT.heading, margin: "0 0 6px", letterSpacing: "0.3px" } }, "Priority Alerts"),
          React.createElement(Text, { style: { color: BRAND.body, fontSize: "14px", lineHeight: "1.65", fontFamily: FONT.body, margin: "0" } }, "New arrivals and off-market pieces sent to you before anyone else.")
        ),

        // ── Feature 2
        React.createElement(
          Section,
          { style: { padding: "0 40px 24px" } },
          React.createElement(Text, { style: { color: BRAND.black, fontSize: "14px", fontWeight: "700", fontFamily: FONT.heading, margin: "0 0 6px", letterSpacing: "0.3px" } }, "Personal Sourcing"),
          React.createElement(Text, { style: { color: BRAND.body, fontSize: "14px", lineHeight: "1.65", fontFamily: FONT.body, margin: "0" } }, "Tell me what you\u2019re looking for \u2014 I\u2019ll tap my global network to find it.")
        ),

        // ── Feature 3
        React.createElement(
          Section,
          { style: { padding: "0 40px 24px" } },
          React.createElement(Text, { style: { color: BRAND.black, fontSize: "14px", fontWeight: "700", fontFamily: FONT.heading, margin: "0 0 6px", letterSpacing: "0.3px" } }, "Full Concierge Service"),
          React.createElement(Text, { style: { color: BRAND.body, fontSize: "14px", lineHeight: "1.65", fontFamily: FONT.body, margin: "0" } }, "Authentication, documentation, insured delivery. Every detail handled.")
        ),

        // ── Spacer
        React.createElement(Section, { style: { height: "16px" } }),

        // ── Footer divider
        React.createElement(Hr, {
          style: {
            borderColor: BRAND.border,
            borderWidth: "1px 0 0 0",
            margin: "0 40px",
          },
        }),

        // ── Sign-off
        React.createElement(
          Section,
          { style: { padding: "32px 40px 8px" } },
          React.createElement(
            Text,
            {
              style: {
                color: BRAND.body,
                fontSize: "15px",
                lineHeight: "1.7",
                fontFamily: FONT.body,
                margin: "0 0 4px",
              },
            },
            "Talk soon,"
          ),
          React.createElement(
            Text,
            {
              style: {
                color: BRAND.black,
                fontSize: "15px",
                fontFamily: FONT.heading,
                margin: "0 0 2px",
                fontWeight: "700",
              },
            },
            "Henry"
          ),
          // Cursive signature
          React.createElement(
            Text,
            {
              style: {
                color: BRAND.black,
                fontSize: "32px",
                fontFamily: FONT.signature,
                fontWeight: "700",
                margin: "4px 0 0",
                lineHeight: "1.2",
              },
            },
            "Henry"
          )
        ),

        // ── Social icons
        React.createElement(
          Section,
          { style: { textAlign: "center", padding: "32px 40px 16px" } },
          React.createElement(
            "table",
            {
              role: "presentation",
              style: { margin: "0 auto" },
              cellPadding: "0",
              cellSpacing: "0",
              border: "0",
            },
            React.createElement(
              "tr",
              null,
              React.createElement(
                "td",
                { style: { padding: "0 14px" } },
                React.createElement(
                  Link,
                  { href: BRAND.instagram, style: { textDecoration: "none" } },
                  React.createElement(Img, { src: ICON.instagram, alt: "Instagram", width: "22", height: "22", style: { display: "block" } })
                )
              ),
              React.createElement(
                "td",
                { style: { padding: "0 14px" } },
                React.createElement(
                  Link,
                  { href: BRAND.whatsapp, style: { textDecoration: "none" } },
                  React.createElement(Img, { src: ICON.whatsapp, alt: "WhatsApp", width: "22", height: "22", style: { display: "block" } })
                )
              ),
              React.createElement(
                "td",
                { style: { padding: "0 14px" } },
                React.createElement(
                  Link,
                  { href: `mailto:${BRAND.email}`, style: { textDecoration: "none" } },
                  React.createElement(Img, { src: ICON.mail, alt: "Email", width: "22", height: "22", style: { display: "block" } })
                )
              )
            )
          )
        ),

        // ── Footer text
        React.createElement(
          Section,
          { style: { textAlign: "center", padding: "0 40px 16px" } },
          React.createElement(
            Text,
            {
              style: {
                color: BRAND.muted,
                fontSize: "11px",
                fontFamily: FONT.heading,
                letterSpacing: "2px",
                textTransform: "uppercase",
                margin: "0 0 12px",
              },
            },
            "\u00A9 2026 Dialed By H"
          ),
          React.createElement(
            Text,
            {
              style: {
                color: "#aaaaaa",
                fontSize: "10px",
                fontFamily: FONT.body,
                lineHeight: "1.6",
                margin: "0 0 12px",
                fontStyle: "italic",
              },
            },
            "Dialed By H is an independent sourcing firm and is not affiliated with Rolex, Patek Philippe, Audemars Piguet, or any respective brand. All trademarks belong to their respective owners."
          ),
          React.createElement(
            Link,
            {
              href: `${BRAND.siteUrl}/privacy.html`,
              style: {
                color: BRAND.muted,
                fontSize: "10px",
                fontFamily: FONT.heading,
                letterSpacing: "2px",
                textTransform: "uppercase",
                textDecoration: "none",
              },
            },
            "Privacy & Terms"
          )
        ),

        // ── Bottom spacer
        React.createElement(Section, { style: { height: "48px" } })
      )
    )
  );
}

module.exports = { WelcomeEmail, BRAND };
