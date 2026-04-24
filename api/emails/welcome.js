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

// ── Brand tokens
const BRAND = {
  siteUrl: "https://dialedbyhenry.com",
  instagram: "https://www.instagram.com/dialedbyh/",
  whatsapp: "https://wa.me/19146211848",
  email: "dialedbyh@gmail.com",
  logo: "https://dialedbyhenry.com/images/logo.png",
  iconIg: "https://dialedbyhenry.com/images/icon-instagram-light.png",
  iconWa: "https://dialedbyhenry.com/images/icon-whatsapp-light.png",
  iconMail: "https://dialedbyhenry.com/images/icon-mail-light.png",
};

const FONT = {
  heading: "'Space Grotesk', 'Arial', 'Helvetica', sans-serif",
  body: "'Inter', 'Helvetica Neue', 'Arial', sans-serif",
};

// ── Dark theme tokens
const C = {
  bg: "#0a0a0a",
  card: "#0a0a0a",
  heading: "#f0f0f0",
  body: "#a3a3a3",
  muted: "#555555",
  disclaimer: "#3a3a3a",
  tag: "#888888",
  divider: "#1e1e1e",
  btnBg: "#f0f0f0",
  btnText: "#0a0a0a",
  featureBg: "#141414",
  featureBorder: "#1e1e1e",
  featureText: "#888888",
};

const RESPONSIVE_STYLES = `
  @media only screen and (max-width: 620px) {
    .content-pad { padding-left: 20px !important; padding-right: 20px !important; }
    .divider-pad { margin-left: 20px !important; margin-right: 20px !important; }
  }
`;

// Helper: creates a full-width table row with bgcolor
function row(bgColor, padding, align, children) {
  return React.createElement(
    "tr", null,
    React.createElement("td", {
      bgcolor: bgColor,
      className: "content-pad",
      align: align || "left",
      style: { backgroundColor: bgColor, padding: padding, fontFamily: FONT.body },
    }, children)
  );
}

function featureItem(number, title, desc) {
  return React.createElement(
    "table",
    { role: "presentation", width: "100%", cellPadding: "0", cellSpacing: "0", border: "0", style: { borderCollapse: "collapse", marginBottom: "14px" } },
    React.createElement(
      "tr", null,
      React.createElement("td", {
        width: "40",
        height: "40",
        bgcolor: C.featureBg,
        style: {
          backgroundColor: C.featureBg,
          border: `1px solid ${C.featureBorder}`,
          borderRadius: "8px",
          textAlign: "center",
          verticalAlign: "top",
          fontFamily: FONT.heading,
          fontSize: "12px",
          fontWeight: "700",
          color: C.featureText,
          letterSpacing: "0.5px",
        },
      }, number),
      React.createElement("td", { style: { paddingLeft: "14px", verticalAlign: "top" } },
        React.createElement(Text, {
          style: { color: C.heading, fontSize: "14px", fontWeight: "700", fontFamily: FONT.heading, margin: "0 0 3px", letterSpacing: "0.2px" },
        }, title),
        React.createElement(Text, {
          style: { color: C.body, fontSize: "13px", lineHeight: "1.55", fontFamily: FONT.body, margin: "0" },
        }, desc)
      )
    )
  );
}

function WelcomeEmail({ firstName }) {
  const greeting = firstName ? firstName + "," : "Welcome,";

  return React.createElement(
    Html, { lang: "en" },
    React.createElement(
      Head, null,
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
      React.createElement("meta", { name: "supported-color-schemes", content: "dark" }),
      React.createElement("style", { dangerouslySetInnerHTML: { __html: RESPONSIVE_STYLES } })
    ),
    React.createElement(Preview, null, "You\u2019re on the private list. Priority access to rare timepieces."),
    React.createElement(
      Body, { style: { margin: 0, padding: 0, backgroundColor: C.bg } },

      // Outer wrapper table (Gmail needs bgcolor on table)
      React.createElement(
        "table", {
          role: "presentation", width: "100%", bgcolor: C.bg,
          cellPadding: "0", cellSpacing: "0", border: "0",
          style: { backgroundColor: C.bg, borderCollapse: "collapse" },
        },
        React.createElement("tr", null,
          React.createElement("td", { align: "center", valign: "top", bgcolor: C.bg, style: { backgroundColor: C.bg } },

            // Inner content table
            React.createElement(
              "table", {
                role: "presentation", width: "100%", bgcolor: C.card,
                cellPadding: "0", cellSpacing: "0", border: "0",
                style: { backgroundColor: C.card, borderCollapse: "collapse", maxWidth: "600px" },
              },

              // Top spacer
              React.createElement("tr", null,
                React.createElement("td", { bgcolor: C.card, style: { backgroundColor: C.card, height: "40px", fontSize: "0", lineHeight: "0" } }, "\u00A0")
              ),

              // Logo
              row(C.card, "0 40px 28px", "center",
                React.createElement(Link, { href: BRAND.siteUrl, style: { textDecoration: "none" } },
                  React.createElement(Img, { src: BRAND.logo, alt: "Dialed By H", width: "180", height: "23", style: { display: "inline-block", outline: "none", border: "none", textDecoration: "none" } })
                )
              ),

              // Divider
              React.createElement("tr", null,
                React.createElement("td", { bgcolor: C.card, style: { backgroundColor: C.card, padding: "0 40px" } },
                  React.createElement(Hr, { style: { borderColor: C.divider, borderWidth: "1px 0 0 0", margin: "0" } })
                )
              ),

              // Tag + Greeting + Body
              row(C.card, "36px 40px 28px", "left", [
                React.createElement(Text, { key: "tag", style: { color: C.tag, fontSize: "10px", fontWeight: "700", fontFamily: FONT.heading, letterSpacing: "3px", textTransform: "uppercase", margin: "0 0 18px" } }, "Private List"),
                React.createElement(Text, { key: "greet", style: { color: C.heading, fontSize: "26px", fontWeight: "700", letterSpacing: "-0.5px", lineHeight: "1.25", margin: "0 0 24px", fontFamily: FONT.heading } }, greeting),
                React.createElement(Text, { key: "b1", style: { color: C.body, fontSize: "15px", lineHeight: "1.7", margin: "0 0 18px", fontFamily: FONT.body } }, "You\u2019re now on the Dialed By H private list. You\u2019ll be the first to know when off-market pieces, rare references, and exclusive sourcing opportunities become available."),
                React.createElement(Text, { key: "b2", style: { color: C.body, fontSize: "15px", lineHeight: "1.7", margin: "0 0 18px", fontFamily: FONT.body } }, "Whether you\u2019re looking to buy, sell, or trade \u2014 I handle the entire process personally, from sourcing through authentication to delivery."),
                React.createElement(Text, { key: "b3", style: { color: C.body, fontSize: "15px", lineHeight: "1.7", margin: "0", fontFamily: FONT.body } }, "If you have a specific piece in mind, reply to this email or reach out anytime."),
              ]),

              // CTA
              row(C.card, "8px 40px 40px", "center",
                React.createElement(Link, {
                  href: `${BRAND.siteUrl}/inventory.html`,
                  style: { display: "inline-block", backgroundColor: C.btnBg, color: C.btnText, fontSize: "11px", fontWeight: "700", fontFamily: FONT.heading, letterSpacing: "3px", textTransform: "uppercase", textDecoration: "none", padding: "14px 40px", textAlign: "center" },
                }, "Browse the Collection")
              ),

              // Divider
              React.createElement("tr", null,
                React.createElement("td", { bgcolor: C.card, style: { backgroundColor: C.card, padding: "0 40px" } },
                  React.createElement(Hr, { style: { borderColor: C.divider, borderWidth: "1px 0 0 0", margin: "0" } })
                )
              ),

              // What to Expect heading
              row(C.card, "32px 40px 8px", "left",
                React.createElement(Text, { style: { color: C.heading, fontSize: "10px", fontWeight: "700", fontFamily: FONT.heading, letterSpacing: "3.5px", textTransform: "uppercase", margin: "0 0 24px" } }, "What to Expect")
              ),

              // Feature items
              row(C.card, "0 40px 28px", "left", [
                React.createElement("div", { key: "f1" }, featureItem("01", "Priority Alerts", "New arrivals and off-market pieces sent to you before anyone else.")),
                React.createElement("div", { key: "f2" }, featureItem("02", "Personal Sourcing", "Tell me what you\u2019re looking for and I\u2019ll tap my global network to find it.")),
                React.createElement("div", { key: "f3" }, featureItem("03", "Full Concierge", "Authentication, documentation, insured delivery. Every detail handled.")),
              ]),

              // Divider
              React.createElement("tr", null,
                React.createElement("td", { bgcolor: C.card, style: { backgroundColor: C.card, padding: "0 40px" } },
                  React.createElement(Hr, { style: { borderColor: C.divider, borderWidth: "1px 0 0 0", margin: "0" } })
                )
              ),

              // Sign-off
              row(C.card, "28px 40px 8px", "left", [
                React.createElement(Text, { key: "s1", style: { color: C.body, fontSize: "15px", lineHeight: "1.7", fontFamily: FONT.body, margin: "0 0 4px" } }, "Talk soon,"),
                React.createElement(Text, { key: "s2", style: { color: C.heading, fontSize: "15px", fontFamily: FONT.heading, margin: "0 0 2px", fontWeight: "700" } }, "Henry"),
              ]),

              // Social icons
              row(C.card, "28px 40px 14px", "center",
                React.createElement(
                  "table", { role: "presentation", cellPadding: "0", cellSpacing: "0", border: "0", style: { margin: "0 auto" } },
                  React.createElement("tr", null,
                    React.createElement("td", { style: { padding: "0 10px" } },
                      React.createElement(Link, { href: BRAND.instagram, style: { textDecoration: "none" } },
                        React.createElement(Img, { src: BRAND.iconIg, alt: "Instagram", width: "18", height: "18", style: { display: "inline-block", opacity: "0.5" } })
                      )
                    ),
                    React.createElement("td", { style: { padding: "0 10px" } },
                      React.createElement(Link, { href: BRAND.whatsapp, style: { textDecoration: "none" } },
                        React.createElement(Img, { src: BRAND.iconWa, alt: "WhatsApp", width: "18", height: "18", style: { display: "inline-block", opacity: "0.5" } })
                      )
                    ),
                    React.createElement("td", { style: { padding: "0 10px" } },
                      React.createElement(Link, { href: `mailto:${BRAND.email}`, style: { textDecoration: "none" } },
                        React.createElement(Img, { src: BRAND.iconMail, alt: "Email", width: "18", height: "18", style: { display: "inline-block", opacity: "0.5" } })
                      )
                    )
                  )
                )
              ),

              // Footer
              row(C.card, "0 40px 14px", "center", [
                React.createElement(Text, { key: "c", style: { color: C.muted, fontSize: "10px", fontFamily: FONT.heading, letterSpacing: "2.5px", textTransform: "uppercase", margin: "0 0 10px" } }, "\u00A9 2026 Dialed By H"),
                React.createElement(Text, { key: "d", style: { color: C.disclaimer, fontSize: "10px", fontFamily: FONT.body, lineHeight: "1.6", margin: "0 0 10px", fontStyle: "italic" } }, "Dialed By H is an independent sourcing firm and is not an authorized dealer for any watch brand. All brand names, logos, and trademarks belong to their respective owners."),
                React.createElement(Link, { key: "p", href: `${BRAND.siteUrl}/privacy.html`, style: { color: C.muted, fontSize: "10px", fontFamily: FONT.heading, letterSpacing: "2.5px", textTransform: "uppercase", textDecoration: "none" } }, "Privacy & Terms"),
              ]),

              // Bottom spacer
              React.createElement("tr", null,
                React.createElement("td", { bgcolor: C.card, style: { backgroundColor: C.card, height: "36px", fontSize: "0", lineHeight: "0" } }, "\u00A0")
              )
            )
          )
        )
      )
    )
  );
}

module.exports = { WelcomeEmail, BRAND, FONT, C };
