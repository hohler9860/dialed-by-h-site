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

const FONT = {
  heading: "'Space Grotesk', 'Arial', 'Helvetica', sans-serif",
  body: "'Inter', 'Helvetica Neue', 'Arial', sans-serif",
};

const C = {
  bg: "#f8f8f8",
  card: "#ffffff",
  imgBg: "#111111",
  heading: "#0a0a0a",
  body: "#444444",
  muted: "#888888",
  border: "#e5e5e5",
  btnBg: "#0a0a0a",
  btnText: "#ffffff",
  disclaimer: "#aaaaaa",
};

/**
 * Broadcast email for the private list.
 * Flexible template for new pieces, journal posts, announcements, etc.
 *
 * @param {string}  previewText  - Inbox preview line
 * @param {string}  tag          - Small label above headline (e.g. "NEW ARRIVAL", "JOURNAL", "ANNOUNCEMENT")
 * @param {string}  headline     - Main headline
 * @param {string}  body         - Main body paragraph(s) — can include multiple sentences
 * @param {string}  [body2]      - Optional second paragraph
 * @param {string}  [imageUrl]   - Hero image URL (watch photo, journal cover, etc.)
 * @param {string}  [imageAlt]   - Alt text for the image
 * @param {boolean} [imageDark]  - If true, renders image on dark (#111) bg; if false, no bg wrapper
 * @param {Array}   [details]    - Array of {label, value} for a detail table (brand, ref, price range, etc.)
 * @param {string}  [ctaText]    - CTA button text (default: "View Now")
 * @param {string}  [ctaUrl]     - CTA button URL (default: site inventory)
 * @param {string}  [signoff]    - Custom sign-off text (default: "Talk soon,")
 */
function BroadcastEmail({
  previewText = "New from Dialed By H",
  tag = "NEW ARRIVAL",
  headline = "Something Special Just Landed",
  body = "",
  body2 = "",
  imageUrl = "",
  imageAlt = "",
  imageDark = true,
  details = [],
  ctaText = "View Now",
  ctaUrl = "",
  signoff = "Talk soon,",
}) {
  const darkModeCSS = `
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    @media (prefers-color-scheme: dark) {
      body, .email-body { background-color: #0a0a0a !important; }
      .email-card { background-color: #111111 !important; }
      .img-wrap { background-color: #1a1a1a !important; }
      .text-heading { color: #f0f0f0 !important; }
      .text-body { color: #bbbbbb !important; }
      .text-muted { color: #777777 !important; }
      .text-tag { color: #999999 !important; }
      .text-disclaimer { color: #555555 !important; }
      .text-label { color: #666666 !important; }
      .text-value { color: #dddddd !important; }
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

  const finalCtaUrl = ctaUrl || `${BRAND.siteUrl}/inventory.html`;

  // Build detail rows if provided
  const detailRows = details
    .filter(d => d && d.value)
    .map((d, i) =>
      React.createElement(
        "tr", { key: i },
        React.createElement("td", {
          className: "text-label",
          style: { color: C.muted, fontSize: "11px", fontWeight: "700", fontFamily: FONT.heading, letterSpacing: "2px", textTransform: "uppercase", padding: "8px 0", verticalAlign: "top" },
        }, d.label),
        React.createElement("td", {
          className: "text-value",
          style: { color: C.heading, fontSize: "13px", fontFamily: FONT.body, padding: "8px 0 8px 16px", textAlign: "right", verticalAlign: "top" },
        }, d.value)
      )
    );

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
      React.createElement("meta", { name: "color-scheme", content: "light dark" }),
      React.createElement("meta", { name: "supported-color-schemes", content: "light dark" }),
      React.createElement("style", { dangerouslySetInnerHTML: { __html: darkModeCSS } })
    ),
    React.createElement(Preview, null, previewText),
    React.createElement(
      Body,
      { className: "email-body", style: { backgroundColor: C.bg, fontFamily: FONT.body, margin: 0, padding: 0 } },

      React.createElement(
        Container,
        { className: "email-card", style: { backgroundColor: C.card, maxWidth: "600px", margin: "0 auto", padding: "0", borderRadius: "0" } },

        // ── Top spacer
        React.createElement(Section, { style: { height: "48px" } }),

        // ── Logo
        React.createElement(
          Section,
          { style: { textAlign: "center", padding: "0 40px 36px" } },
          React.createElement(
            Link, { href: BRAND.siteUrl },
            React.createElement(Img, { className: "logo-dark", src: BRAND.logoDark, alt: "Dialed By H", width: "200", height: "26", style: { display: "inline-block", outline: "none", border: "none", textDecoration: "none" } }),
            React.createElement(Img, { className: "logo-light", src: BRAND.logoLight, alt: "Dialed By H", width: "200", height: "26", style: { display: "none", outline: "none", border: "none", textDecoration: "none" } })
          )
        ),

        // ── Divider
        React.createElement(Hr, { className: "border-line", style: { borderColor: C.border, borderWidth: "1px 0 0 0", margin: "0 40px" } }),

        // ── Tag + Headline + Body
        React.createElement(
          Section,
          { style: { padding: "40px 40px 28px" } },

          // Tag label
          React.createElement(Text, {
            className: "text-tag",
            style: { color: C.muted, fontSize: "10px", fontWeight: "700", fontFamily: FONT.heading, letterSpacing: "3px", textTransform: "uppercase", margin: "0 0 16px" },
          }, tag),

          // Headline
          React.createElement(Text, {
            className: "text-heading",
            style: { color: C.heading, fontSize: "26px", fontWeight: "700", letterSpacing: "-0.5px", lineHeight: "1.3", margin: "0 0 24px", fontFamily: FONT.heading },
          }, headline),

          // Body text
          body ? React.createElement(Text, {
            className: "text-body",
            style: { color: C.body, fontSize: "15px", lineHeight: "1.75", margin: "0 0 20px", fontFamily: FONT.body },
          }, body) : null,

          // Optional second paragraph
          body2 ? React.createElement(Text, {
            className: "text-body",
            style: { color: C.body, fontSize: "15px", lineHeight: "1.75", margin: "0", fontFamily: FONT.body },
          }, body2) : null
        ),

        // ── Hero image
        imageUrl ? React.createElement(
          Section,
          { style: { padding: "0 40px 8px" } },
          imageDark
            ? React.createElement(
                "div",
                { className: "img-wrap", style: { backgroundColor: C.imgBg, borderRadius: "12px", overflow: "hidden", textAlign: "center", padding: "32px 20px" } },
                React.createElement(Img, {
                  src: imageUrl, alt: imageAlt || headline,
                  width: "320",
                  style: { display: "inline-block", maxWidth: "100%", height: "auto", outline: "none", border: "none", textDecoration: "none" },
                })
              )
            : React.createElement(
                "div",
                { style: { borderRadius: "12px", overflow: "hidden", textAlign: "center" } },
                React.createElement(Img, {
                  src: imageUrl, alt: imageAlt || headline,
                  width: "520",
                  style: { display: "block", maxWidth: "100%", height: "auto", outline: "none", border: "none", textDecoration: "none", borderRadius: "12px" },
                })
              )
        ) : null,

        // ── Detail rows (if any)
        detailRows.length > 0 ? React.createElement(
          Section,
          { style: { padding: "16px 40px 8px" } },
          React.createElement(
            "table",
            { role: "presentation", style: { width: "100%", borderCollapse: "collapse" }, cellPadding: "0", cellSpacing: "0", border: "0" },
            React.createElement("tbody", null, ...detailRows)
          )
        ) : null,

        // ── Spacer before CTA
        React.createElement(Section, { style: { height: imageUrl || detailRows.length ? "24px" : "8px" } }),

        // ── CTA Button
        React.createElement(
          Section,
          { style: { textAlign: "center", padding: "0 40px 44px" } },
          React.createElement(Link, {
            className: "btn-cta",
            href: finalCtaUrl,
            style: {
              display: "inline-block", backgroundColor: C.btnBg, color: C.btnText,
              fontSize: "11px", fontWeight: "700", fontFamily: FONT.heading,
              letterSpacing: "3px", textTransform: "uppercase", textDecoration: "none",
              padding: "16px 44px", textAlign: "center",
            },
          }, ctaText)
        ),

        // ── Footer divider
        React.createElement(Hr, { className: "border-line", style: { borderColor: C.border, borderWidth: "1px 0 0 0", margin: "0 40px" } }),

        // ── Sign-off
        React.createElement(
          Section,
          { style: { padding: "32px 40px 8px" } },
          React.createElement(Text, { className: "text-body", style: { color: C.body, fontSize: "15px", lineHeight: "1.7", fontFamily: FONT.body, margin: "0 0 4px" } }, signoff),
          React.createElement(Text, { className: "text-heading", style: { color: C.heading, fontSize: "15px", fontFamily: FONT.heading, margin: "0 0 2px", fontWeight: "700" } }, "Henry"),
          React.createElement(Img, { className: "sig-dark", src: BRAND.signatureDark, alt: "H", width: "80", height: "58", style: { display: "block", margin: "6px 0 0", outline: "none", border: "none", textDecoration: "none" } }),
          React.createElement(Img, { className: "sig-light", src: BRAND.signatureLight, alt: "H", width: "80", height: "58", style: { display: "none", margin: "6px 0 0", outline: "none", border: "none", textDecoration: "none" } })
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
                  React.createElement(Img, { className: "icon-dark", src: BRAND.iconIg, alt: "Instagram", width: "22", height: "22", style: { display: "inline-block" } }),
                  React.createElement(Img, { className: "icon-light", src: BRAND.iconIgLight, alt: "Instagram", width: "22", height: "22", style: { display: "none" } })
                )
              ),
              React.createElement("td", { style: { padding: "0 14px" } },
                React.createElement(Link, { href: BRAND.whatsapp, style: { textDecoration: "none" } },
                  React.createElement(Img, { className: "icon-dark", src: BRAND.iconWa, alt: "WhatsApp", width: "22", height: "22", style: { display: "inline-block" } }),
                  React.createElement(Img, { className: "icon-light", src: BRAND.iconWaLight, alt: "WhatsApp", width: "22", height: "22", style: { display: "none" } })
                )
              ),
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
          React.createElement(Text, { className: "text-muted", style: { color: C.muted, fontSize: "11px", fontFamily: FONT.heading, letterSpacing: "2px", textTransform: "uppercase", margin: "0 0 12px" } }, "\u00A9 2026 Dialed By H"),
          React.createElement(Text, { className: "text-disclaimer", style: { color: C.disclaimer, fontSize: "10px", fontFamily: FONT.body, lineHeight: "1.6", margin: "0 0 12px", fontStyle: "italic" } }, "Dialed By H is an independent sourcing firm and is not affiliated with Rolex, Patek Philippe, Audemars Piguet, or any respective brand. All trademarks belong to their respective owners."),
          React.createElement(Link, { className: "text-muted", href: `${BRAND.siteUrl}/privacy.html`, style: { color: C.muted, fontSize: "10px", fontFamily: FONT.heading, letterSpacing: "2px", textTransform: "uppercase", textDecoration: "none" } }, "Privacy & Terms")
        ),

        // ── Bottom spacer
        React.createElement(Section, { style: { height: "48px" } })
      )
    )
  );
}

module.exports = { BroadcastEmail };
