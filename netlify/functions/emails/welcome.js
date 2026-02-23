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
  Row,
  Column,
  Font,
  Preview,
} = require("@react-email/components");

const BRAND = {
  charcoal: "#0a0a0a",
  ivory: "#f0f0f0",
  muted: "#888888",
  border: "#1a1a1a",
  borderLight: "#222222",
  logoUrl: "https://dialedbyhenry.com/images/logo.png",
  siteUrl: "https://dialedbyhenry.com",
  instagram: "https://www.instagram.com/dialedbyh/",
  whatsapp: "https://wa.me/19146211848",
  email: "dialedbyh@gmail.com",
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
        fontFamily: "Georgia",
        fallbackFontFamily: "serif",
      }),
      React.createElement("meta", {
        name: "color-scheme",
        content: "dark",
      }),
      React.createElement("meta", {
        name: "supported-color-schemes",
        content: "dark",
      })
    ),
    React.createElement(Preview, null, "You're on the private list — priority access to rare timepieces."),
    React.createElement(
      Body,
      {
        style: {
          backgroundColor: BRAND.charcoal,
          fontFamily: "'Georgia', 'Times New Roman', serif",
          margin: 0,
          padding: 0,
        },
      },

      // ── Outer container
      React.createElement(
        Container,
        {
          style: {
            backgroundColor: BRAND.charcoal,
            maxWidth: "600px",
            margin: "0 auto",
            padding: "0",
          },
        },

        // ── Top spacer
        React.createElement(Section, { style: { height: "40px" } }),

        // ── Logo
        React.createElement(
          Section,
          { style: { textAlign: "center", padding: "0 40px 32px" } },
          React.createElement(Link, { href: BRAND.siteUrl },
            React.createElement(Img, {
              src: BRAND.logoUrl,
              alt: "Dialed By H",
              width: "220",
              height: "29",
              style: {
                display: "inline-block",
                outline: "none",
                border: "none",
                textDecoration: "none",
              },
            })
          )
        ),

        // ── Divider line
        React.createElement(Hr, {
          style: {
            borderColor: BRAND.borderLight,
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
                color: BRAND.ivory,
                fontSize: "28px",
                fontWeight: "400",
                letterSpacing: "-0.5px",
                lineHeight: "1.3",
                margin: "0 0 24px",
                fontFamily: "'Georgia', 'Times New Roman', serif",
              },
            },
            greeting
          ),

          // Body paragraph 1
          React.createElement(
            Text,
            {
              style: {
                color: BRAND.muted,
                fontSize: "15px",
                lineHeight: "1.7",
                margin: "0 0 20px",
                fontFamily: "'Georgia', 'Times New Roman', serif",
              },
            },
            "You're now on the Dialed By H private list. This means you'll be the first to know when off-market pieces, rare references, and exclusive sourcing opportunities become available."
          ),

          // Body paragraph 2
          React.createElement(
            Text,
            {
              style: {
                color: BRAND.muted,
                fontSize: "15px",
                lineHeight: "1.7",
                margin: "0 0 20px",
                fontFamily: "'Georgia', 'Times New Roman', serif",
              },
            },
            "Whether you're looking to buy, sell, or trade — I handle the entire process personally, from sourcing through authentication to delivery."
          ),

          // Body paragraph 3
          React.createElement(
            Text,
            {
              style: {
                color: BRAND.muted,
                fontSize: "15px",
                lineHeight: "1.7",
                margin: "0 0 32px",
                fontFamily: "'Georgia', 'Times New Roman', serif",
              },
            },
            "If you have a specific piece in mind, reply to this email or reach out anytime — I'd love to help."
          )
        ),

        // ── CTA Button
        React.createElement(
          Section,
          { style: { textAlign: "center", padding: "0 40px 40px" } },
          React.createElement(
            Link,
            {
              href: `${BRAND.siteUrl}/inventory.html`,
              style: {
                display: "inline-block",
                backgroundColor: BRAND.ivory,
                color: BRAND.charcoal,
                fontSize: "11px",
                fontWeight: "700",
                fontFamily: "'Arial', 'Helvetica', sans-serif",
                letterSpacing: "3px",
                textTransform: "uppercase",
                textDecoration: "none",
                padding: "16px 40px",
                textAlign: "center",
              },
            },
            "Browse the Collection"
          )
        ),

        // ── Divider
        React.createElement(Hr, {
          style: {
            borderColor: BRAND.borderLight,
            borderWidth: "1px 0 0 0",
            margin: "0 40px",
          },
        }),

        // ── What to expect
        React.createElement(
          Section,
          { style: { padding: "40px 40px 8px" } },
          React.createElement(
            Text,
            {
              style: {
                color: BRAND.ivory,
                fontSize: "11px",
                fontWeight: "700",
                fontFamily: "'Arial', 'Helvetica', sans-serif",
                letterSpacing: "3px",
                textTransform: "uppercase",
                margin: "0 0 24px",
              },
            },
            "What to Expect"
          )
        ),

        // ── Feature 1: Priority Alerts
        React.createElement(
          Section,
          { style: { padding: "0 40px 24px" } },
          React.createElement(Text, { style: { color: BRAND.ivory, fontSize: "14px", fontWeight: "700", fontFamily: "'Arial', 'Helvetica', sans-serif", margin: "0 0 6px", letterSpacing: "0.5px" } }, "Priority Alerts"),
          React.createElement(Text, { style: { color: BRAND.muted, fontSize: "14px", lineHeight: "1.6", fontFamily: "'Georgia', 'Times New Roman', serif", margin: "0" } }, "New arrivals and off-market pieces sent to you before anyone else.")
        ),

        // ── Feature 2: Personal Sourcing
        React.createElement(
          Section,
          { style: { padding: "0 40px 24px" } },
          React.createElement(Text, { style: { color: BRAND.ivory, fontSize: "14px", fontWeight: "700", fontFamily: "'Arial', 'Helvetica', sans-serif", margin: "0 0 6px", letterSpacing: "0.5px" } }, "Personal Sourcing"),
          React.createElement(Text, { style: { color: BRAND.muted, fontSize: "14px", lineHeight: "1.6", fontFamily: "'Georgia', 'Times New Roman', serif", margin: "0" } }, "Tell me what you're looking for \u2014 I'll tap my global network to find it.")
        ),

        // ── Feature 3: Full Concierge Service
        React.createElement(
          Section,
          { style: { padding: "0 40px 24px" } },
          React.createElement(Text, { style: { color: BRAND.ivory, fontSize: "14px", fontWeight: "700", fontFamily: "'Arial', 'Helvetica', sans-serif", margin: "0 0 6px", letterSpacing: "0.5px" } }, "Full Concierge Service"),
          React.createElement(Text, { style: { color: BRAND.muted, fontSize: "14px", lineHeight: "1.6", fontFamily: "'Georgia', 'Times New Roman', serif", margin: "0" } }, "Authentication, documentation, insured delivery. Every detail handled.")
        ),

        // ── Spacer before footer
        React.createElement(Section, { style: { height: "16px" } }),

        // ── Footer divider
        React.createElement(Hr, {
          style: {
            borderColor: BRAND.borderLight,
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
                color: BRAND.muted,
                fontSize: "15px",
                lineHeight: "1.7",
                fontFamily: "'Georgia', 'Times New Roman', serif",
                margin: "0 0 4px",
              },
            },
            "Talk soon,"
          ),
          React.createElement(
            Text,
            {
              style: {
                color: BRAND.ivory,
                fontSize: "15px",
                fontFamily: "'Georgia', 'Times New Roman', serif",
                margin: "0",
                fontWeight: "700",
              },
            },
            "Henry"
          )
        ),

        // ── Social links
        React.createElement(
          Section,
          { style: { textAlign: "center", padding: "32px 40px 16px" } },
          React.createElement(
            Text,
            {
              style: {
                fontSize: "12px",
                fontFamily: "'Arial', 'Helvetica', sans-serif",
                margin: "0 0 16px",
              },
            },
            React.createElement(Link, { href: BRAND.instagram, style: { color: BRAND.muted, textDecoration: "none", letterSpacing: "2px", textTransform: "uppercase", fontSize: "11px", fontWeight: "700" } }, "Instagram"),
            React.createElement("span", { style: { color: "#333", margin: "0 12px" } }, "·"),
            React.createElement(Link, { href: BRAND.whatsapp, style: { color: BRAND.muted, textDecoration: "none", letterSpacing: "2px", textTransform: "uppercase", fontSize: "11px", fontWeight: "700" } }, "WhatsApp"),
            React.createElement("span", { style: { color: "#333", margin: "0 12px" } }, "·"),
            React.createElement(Link, { href: `mailto:${BRAND.email}`, style: { color: BRAND.muted, textDecoration: "none", letterSpacing: "2px", textTransform: "uppercase", fontSize: "11px", fontWeight: "700" } }, "Email")
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
                color: "#444444",
                fontSize: "11px",
                fontFamily: "'Arial', 'Helvetica', sans-serif",
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
                color: "#333333",
                fontSize: "10px",
                fontFamily: "'Georgia', 'Times New Roman', serif",
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
                color: "#444444",
                fontSize: "10px",
                fontFamily: "'Arial', 'Helvetica', sans-serif",
                letterSpacing: "2px",
                textTransform: "uppercase",
                textDecoration: "none",
              },
            },
            "Privacy & Terms"
          )
        ),

        // ── Bottom spacer
        React.createElement(Section, { style: { height: "40px" } })
      )
    )
  );
}

module.exports = { WelcomeEmail, BRAND };
