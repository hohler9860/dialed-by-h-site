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

const { BRAND } = require("./welcome.js");

// ── Shared font stacks
const FONT = {
  heading: "'Space Grotesk', 'Arial', 'Helvetica', sans-serif",
  body: "'Inter', 'Helvetica Neue', 'Arial', sans-serif",
};

// ── Always-dark color tokens
const C = {
  bg: "#0a0a0a",
  card: "#111111",
  imgBg: "#1a1a1a",
  heading: "#f0f0f0",
  body: "#bbbbbb",
  muted: "#777777",
  border: "#222222",
  btnBg: "#f0f0f0",
  btnText: "#0a0a0a",
  disclaimer: "#555555",
  label: "#666666",
  value: "#dddddd",
};

/**
 * Inquiry confirmation email sent to the user after they inquire about a watch.
 */
function InquiryEmail({ firstName, watchName, watchRef, watchBrand, watchImage }) {
  const greeting = firstName ? `${firstName},` : "Hello,";
  const piece = watchName || "a timepiece";
  const previewText = `Your inquiry for ${piece} has been received.`;

  // Build the detail rows
  const detailRows = [];
  if (watchBrand) {
    detailRows.push(
      React.createElement(
        "tr", { key: "brand" },
        React.createElement("td", {
          style: { color: C.label, fontSize: "11px", fontWeight: "700", fontFamily: FONT.heading, letterSpacing: "2px", textTransform: "uppercase", padding: "8px 0", verticalAlign: "top" },
        }, "Brand"),
        React.createElement("td", {
          style: { color: C.value, fontSize: "13px", fontFamily: FONT.body, padding: "8px 0 8px 16px", textAlign: "right", verticalAlign: "top" },
        }, watchBrand)
      )
    );
  }
  if (watchName) {
    detailRows.push(
      React.createElement(
        "tr", { key: "model" },
        React.createElement("td", {
          style: { color: C.label, fontSize: "11px", fontWeight: "700", fontFamily: FONT.heading, letterSpacing: "2px", textTransform: "uppercase", padding: "8px 0", verticalAlign: "top" },
        }, "Model"),
        React.createElement("td", {
          style: { color: C.value, fontSize: "13px", fontFamily: FONT.body, padding: "8px 0 8px 16px", textAlign: "right", verticalAlign: "top" },
        }, watchName)
      )
    );
  }
  if (watchRef) {
    detailRows.push(
      React.createElement(
        "tr", { key: "ref" },
        React.createElement("td", {
          style: { color: C.label, fontSize: "11px", fontWeight: "700", fontFamily: FONT.heading, letterSpacing: "2px", textTransform: "uppercase", padding: "8px 0", verticalAlign: "top" },
        }, "Reference"),
        React.createElement("td", {
          style: { color: C.value, fontSize: "13px", fontFamily: FONT.body, padding: "8px 0 8px 16px", textAlign: "right", verticalAlign: "top" },
        }, `Ref. ${watchRef}`)
      )
    );
  }

  return React.createElement(
    Html,
    { lang: "en" },
    React.createElement(
      Head,
      null,
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
      React.createElement("meta", { name: "color-scheme", content: "dark" }),
      React.createElement("meta", { name: "supported-color-schemes", content: "dark" })
    ),
    React.createElement(Preview, null, previewText),
    React.createElement(
      Body,
      { style: { backgroundColor: C.bg, fontFamily: FONT.body, margin: 0, padding: 0 } },

      React.createElement(
        Container,
        { style: { backgroundColor: C.card, maxWidth: "600px", margin: "0 auto", padding: "0", borderRadius: "0" } },

        // ── Top spacer
        React.createElement(Section, { style: { height: "48px" } }),

        // ── Logo
        React.createElement(
          Section,
          { style: { textAlign: "center", padding: "0 40px 36px" } },
          React.createElement(
            Link, { href: BRAND.siteUrl },
            React.createElement(Img, { src: BRAND.logo, alt: "Dialed By H", width: "200", height: "26", style: { display: "inline-block", outline: "none", border: "none", textDecoration: "none" } })
          )
        ),

        // ── Divider
        React.createElement(Hr, { style: { borderColor: C.border, borderWidth: "1px 0 0 0", margin: "0 40px" } }),

        // ── Greeting + confirmation
        React.createElement(
          Section,
          { style: { padding: "40px 40px 28px" } },
          React.createElement(Text, {
            style: { color: C.heading, fontSize: "26px", fontWeight: "700", letterSpacing: "-0.5px", lineHeight: "1.3", margin: "0 0 28px", fontFamily: FONT.heading },
          }, greeting),
          React.createElement(Text, {
            style: { color: C.body, fontSize: "15px", lineHeight: "1.75", margin: "0 0 20px", fontFamily: FONT.body },
          }, `I\u2019ve received your inquiry for the ${piece}. I\u2019ll personally review the details and get back to you shortly.`),
          React.createElement(Text, {
            style: { color: C.body, fontSize: "15px", lineHeight: "1.75", margin: "0", fontFamily: FONT.body },
          }, "In the meantime, here\u2019s a summary of what you inquired about:")
        ),

        // ── Watch image (if available)
        watchImage ? React.createElement(
          Section,
          { style: { padding: "0 40px 8px" } },
          React.createElement(
            "div",
            { style: { backgroundColor: C.imgBg, borderRadius: "12px", overflow: "hidden", textAlign: "center", padding: "32px 20px" } },
            React.createElement(Img, {
              src: watchImage,
              alt: watchName || "Watch",
              width: "260",
              style: { display: "inline-block", maxWidth: "100%", height: "auto", outline: "none", border: "none", textDecoration: "none" },
            })
          )
        ) : null,

        // ── Watch details table
        detailRows.length > 0 ? React.createElement(
          Section,
          { style: { padding: "16px 40px 8px" } },
          React.createElement(
            "table",
            { role: "presentation", style: { width: "100%", borderCollapse: "collapse" }, cellPadding: "0", cellSpacing: "0", border: "0" },
            React.createElement("tbody", null, ...detailRows)
          )
        ) : null,

        // ── Spacer
        React.createElement(Section, { style: { height: "24px" } }),

        // ── Divider
        React.createElement(Hr, { style: { borderColor: C.border, borderWidth: "1px 0 0 0", margin: "0 40px" } }),

        // ── What happens next
        React.createElement(
          Section,
          { style: { padding: "32px 40px 8px" } },
          React.createElement(Text, {
            style: { color: C.heading, fontSize: "11px", fontWeight: "700", fontFamily: FONT.heading, letterSpacing: "3px", textTransform: "uppercase", margin: "0 0 24px" },
          }, "What Happens Next")
        ),

        // Step 1
        React.createElement(
          Section,
          { style: { padding: "0 40px 20px" } },
          React.createElement(Text, { style: { color: C.heading, fontSize: "14px", fontWeight: "700", fontFamily: FONT.heading, margin: "0 0 6px", letterSpacing: "0.3px" } }, "1. Personal Review"),
          React.createElement(Text, { style: { color: C.body, fontSize: "14px", lineHeight: "1.65", fontFamily: FONT.body, margin: "0" } }, "I\u2019ll review your inquiry and check current availability, pricing, and condition.")
        ),

        // Step 2
        React.createElement(
          Section,
          { style: { padding: "0 40px 20px" } },
          React.createElement(Text, { style: { color: C.heading, fontSize: "14px", fontWeight: "700", fontFamily: FONT.heading, margin: "0 0 6px", letterSpacing: "0.3px" } }, "2. Direct Follow-Up"),
          React.createElement(Text, { style: { color: C.body, fontSize: "14px", lineHeight: "1.65", fontFamily: FONT.body, margin: "0" } }, "Expect a personal response within 24 hours with all the details you need.")
        ),

        // Step 3
        React.createElement(
          Section,
          { style: { padding: "0 40px 20px" } },
          React.createElement(Text, { style: { color: C.heading, fontSize: "14px", fontWeight: "700", fontFamily: FONT.heading, margin: "0 0 6px", letterSpacing: "0.3px" } }, "3. Secure the Piece"),
          React.createElement(Text, { style: { color: C.body, fontSize: "14px", lineHeight: "1.65", fontFamily: FONT.body, margin: "0" } }, "Once you\u2019re ready, I handle authentication, documentation, and insured delivery.")
        ),

        // ── Spacer
        React.createElement(Section, { style: { height: "8px" } }),

        // ── CTA
        React.createElement(
          Section,
          { style: { textAlign: "center", padding: "0 40px 44px" } },
          React.createElement(Link, {
            href: `${BRAND.siteUrl}/inventory.html`,
            style: {
              display: "inline-block", backgroundColor: C.btnBg, color: C.btnText,
              fontSize: "11px", fontWeight: "700", fontFamily: FONT.heading,
              letterSpacing: "3px", textTransform: "uppercase", textDecoration: "none",
              padding: "16px 44px", textAlign: "center",
            },
          }, "Browse More Pieces")
        ),

        // ── Footer divider
        React.createElement(Hr, { style: { borderColor: C.border, borderWidth: "1px 0 0 0", margin: "0 40px" } }),

        // ── Sign-off
        React.createElement(
          Section,
          { style: { padding: "32px 40px 8px" } },
          React.createElement(Text, { style: { color: C.body, fontSize: "15px", lineHeight: "1.7", fontFamily: FONT.body, margin: "0 0 4px" } }, "Talk soon,"),
          React.createElement(Text, { style: { color: C.heading, fontSize: "15px", fontFamily: FONT.heading, margin: "0 0 2px", fontWeight: "700" } }, "Henry"),
          React.createElement(Img, { src: BRAND.signature, alt: "H", width: "80", height: "58", style: { display: "block", margin: "6px 0 0", outline: "none", border: "none", textDecoration: "none" } })
        ),

        // ── Social icons
        React.createElement(
          Section,
          { style: { textAlign: "center", padding: "32px 40px 16px" } },
          React.createElement(
            "table",
            { role: "presentation", style: { margin: "0 auto" }, cellPadding: "0", cellSpacing: "0", border: "0" },
            React.createElement(
              "tr", null,
              React.createElement("td", { style: { padding: "0 14px" } },
                React.createElement(Link, { href: BRAND.instagram, style: { textDecoration: "none" } },
                  React.createElement(Img, { src: BRAND.iconIg, alt: "Instagram", width: "22", height: "22", style: { display: "inline-block" } })
                )
              ),
              React.createElement("td", { style: { padding: "0 14px" } },
                React.createElement(Link, { href: BRAND.whatsapp, style: { textDecoration: "none" } },
                  React.createElement(Img, { src: BRAND.iconWa, alt: "WhatsApp", width: "22", height: "22", style: { display: "inline-block" } })
                )
              ),
              React.createElement("td", { style: { padding: "0 14px" } },
                React.createElement(Link, { href: `mailto:${BRAND.email}`, style: { textDecoration: "none" } },
                  React.createElement(Img, { src: BRAND.iconMail, alt: "Email", width: "22", height: "22", style: { display: "inline-block" } })
                )
              )
            )
          )
        ),

        // ── Footer text
        React.createElement(
          Section,
          { style: { textAlign: "center", padding: "0 40px 16px" } },
          React.createElement(Text, { style: { color: C.muted, fontSize: "11px", fontFamily: FONT.heading, letterSpacing: "2px", textTransform: "uppercase", margin: "0 0 12px" } }, "\u00A9 2026 Dialed By H"),
          React.createElement(Text, { style: { color: C.disclaimer, fontSize: "10px", fontFamily: FONT.body, lineHeight: "1.6", margin: "0 0 12px", fontStyle: "italic" } }, "Dialed By H is an independent sourcing firm and is not an authorized dealer for any watch brand. All brand names, logos, and trademarks belong to their respective owners."),
          React.createElement(Link, { href: `${BRAND.siteUrl}/privacy.html`, style: { color: C.muted, fontSize: "10px", fontFamily: FONT.heading, letterSpacing: "2px", textTransform: "uppercase", textDecoration: "none" } }, "Privacy & Terms")
        ),

        // ── Bottom spacer
        React.createElement(Section, { style: { height: "48px" } })
      )
    )
  );
}

module.exports = { InquiryEmail };
