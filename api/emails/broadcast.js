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

const { BRAND, FONT, C } = require("./welcome.js");

const RESPONSIVE_STYLES = `
  @media only screen and (max-width: 620px) {
    .content-pad { padding-left: 20px !important; padding-right: 20px !important; }
    .divider-pad { margin-left: 20px !important; margin-right: 20px !important; }
    .hero-img { width: 260px !important; }
  }
`;

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
  const finalCtaUrl = ctaUrl || `${BRAND.siteUrl}/inventory.html`;

  const detailRows = details
    .filter(d => d && d.value)
    .map((d, i, arr) =>
      React.createElement("tr", { key: i },
        React.createElement("td", {
          style: { color: C.muted, fontSize: "10px", fontWeight: "700", fontFamily: FONT.heading, letterSpacing: "2.5px", textTransform: "uppercase", padding: "10px 0", verticalAlign: "top", borderBottom: i < arr.length - 1 ? `1px solid ${C.divider}` : "none" },
        }, d.label),
        React.createElement("td", {
          style: { color: "#dddddd", fontSize: "14px", fontFamily: FONT.body, fontWeight: "500", padding: "10px 0 10px 16px", textAlign: "right", verticalAlign: "top", borderBottom: i < arr.length - 1 ? `1px solid ${C.divider}` : "none" },
        }, d.value)
      )
    );

  return React.createElement(
    Html, { lang: "en" },
    React.createElement(
      Head, null,
      React.createElement(Font, { fontFamily: "Space Grotesk", fallbackFontFamily: "Arial", webFont: { url: "https://fonts.gstatic.com/s/spacegrotesk/v16/V8mDoQDjQSkFtoMM3T6r8E7mPbF4C_k3HqU.woff2", format: "woff2" }, fontWeight: "400 700", fontStyle: "normal" }),
      React.createElement(Font, { fontFamily: "Inter", fallbackFontFamily: "Arial", webFont: { url: "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hiA.woff2", format: "woff2" }, fontWeight: "400 500", fontStyle: "normal" }),
      React.createElement("meta", { name: "color-scheme", content: "dark" }),
      React.createElement("meta", { name: "supported-color-schemes", content: "dark" }),
      React.createElement("style", { dangerouslySetInnerHTML: { __html: RESPONSIVE_STYLES } })
    ),
    React.createElement(Preview, null, previewText),
    React.createElement(
      Body, { style: { margin: 0, padding: 0, backgroundColor: C.bg } },

      React.createElement(
        "table", { role: "presentation", width: "100%", bgcolor: C.bg, cellPadding: "0", cellSpacing: "0", border: "0", style: { backgroundColor: C.bg, borderCollapse: "collapse" } },
        React.createElement("tr", null,
          React.createElement("td", { align: "center", valign: "top", bgcolor: C.bg, style: { backgroundColor: C.bg } },

            React.createElement(
              "table", { role: "presentation", width: "100%", bgcolor: C.card, cellPadding: "0", cellSpacing: "0", border: "0", style: { backgroundColor: C.card, borderCollapse: "collapse", maxWidth: "600px" } },

              // Top spacer
              React.createElement("tr", null, React.createElement("td", { bgcolor: C.card, style: { backgroundColor: C.card, height: "40px", fontSize: "0", lineHeight: "0" } }, "\u00A0")),

              // Logo
              row(C.card, "0 40px 28px", "center",
                React.createElement(Link, { href: BRAND.siteUrl, style: { textDecoration: "none" } },
                  React.createElement(Img, { src: BRAND.logo, alt: "Dialed By H", width: "180", height: "23", style: { display: "inline-block", outline: "none", border: "none", textDecoration: "none" } })
                )
              ),

              // Divider
              React.createElement("tr", null, React.createElement("td", { bgcolor: C.card, style: { backgroundColor: C.card, padding: "0 40px" } }, React.createElement(Hr, { style: { borderColor: C.divider, borderWidth: "1px 0 0 0", margin: "0" } }))),

              // Tag + Headline + Body
              row(C.card, "36px 40px 24px", "left", [
                React.createElement(Text, { key: "tag", style: { color: C.tag, fontSize: "10px", fontWeight: "700", fontFamily: FONT.heading, letterSpacing: "3px", textTransform: "uppercase", margin: "0 0 18px" } }, tag),
                React.createElement(Text, { key: "hl", style: { color: C.heading, fontSize: "26px", fontWeight: "700", letterSpacing: "-0.5px", lineHeight: "1.25", margin: "0 0 22px", fontFamily: FONT.heading } }, headline),
                body ? React.createElement(Text, { key: "b1", style: { color: C.body, fontSize: "15px", lineHeight: "1.7", margin: "0 0 18px", fontFamily: FONT.body } }, body) : null,
                body2 ? React.createElement(Text, { key: "b2", style: { color: C.body, fontSize: "15px", lineHeight: "1.7", margin: "0", fontFamily: FONT.body } }, body2) : null,
              ]),

              // Hero image
              ...(imageUrl ? [
                row(C.card, "0 40px 8px", "center",
                  imageDark
                    ? React.createElement(
                        "table", { role: "presentation", width: "100%", cellPadding: "0", cellSpacing: "0", border: "0", bgcolor: C.featureBg, style: { backgroundColor: C.featureBg, borderRadius: "10px", border: `1px solid ${C.featureBorder}`, borderCollapse: "collapse" } },
                        React.createElement("tr", null,
                          React.createElement("td", { bgcolor: C.featureBg, align: "center", style: { backgroundColor: C.featureBg, padding: "28px 16px" } },
                            React.createElement(Img, { className: "hero-img", src: imageUrl, alt: imageAlt || headline, width: "300", style: { display: "inline-block", maxWidth: "100%", height: "auto", outline: "none", border: "none", textDecoration: "none" } })
                          )
                        )
                      )
                    : React.createElement(
                        "table", { role: "presentation", width: "100%", cellPadding: "0", cellSpacing: "0", border: "0", style: { borderRadius: "10px", overflow: "hidden", border: `1px solid ${C.featureBorder}`, borderCollapse: "collapse" } },
                        React.createElement("tr", null,
                          React.createElement("td", { align: "center", style: { padding: "0" } },
                            React.createElement(Img, { className: "hero-img", src: imageUrl, alt: imageAlt || headline, width: "504", style: { display: "block", maxWidth: "100%", height: "auto", outline: "none", border: "none", textDecoration: "none" } })
                          )
                        )
                      )
                ),
              ] : []),

              // Detail rows
              ...(detailRows.length > 0 ? [
                row(C.card, "14px 40px 8px", "left",
                  React.createElement("table", { role: "presentation", width: "100%", cellPadding: "0", cellSpacing: "0", border: "0", style: { borderCollapse: "collapse" } },
                    React.createElement("tbody", null, ...detailRows)
                  )
                ),
              ] : []),

              // Spacer
              React.createElement("tr", null, React.createElement("td", { bgcolor: C.card, style: { backgroundColor: C.card, height: imageUrl || detailRows.length ? "20px" : "8px", fontSize: "0", lineHeight: "0" } }, "\u00A0")),

              // CTA
              row(C.card, "0 40px 40px", "center",
                React.createElement(Link, { href: finalCtaUrl, style: { display: "inline-block", backgroundColor: C.btnBg, color: C.btnText, fontSize: "11px", fontWeight: "700", fontFamily: FONT.heading, letterSpacing: "3px", textTransform: "uppercase", textDecoration: "none", padding: "14px 40px", textAlign: "center" } }, ctaText)
              ),

              // Divider
              React.createElement("tr", null, React.createElement("td", { bgcolor: C.card, style: { backgroundColor: C.card, padding: "0 40px" } }, React.createElement(Hr, { style: { borderColor: C.divider, borderWidth: "1px 0 0 0", margin: "0" } }))),

              // Sign-off
              row(C.card, "28px 40px 8px", "left", [
                React.createElement(Text, { key: "s1", style: { color: C.body, fontSize: "15px", lineHeight: "1.7", fontFamily: FONT.body, margin: "0 0 4px" } }, signoff),
                React.createElement(Text, { key: "s2", style: { color: C.heading, fontSize: "15px", fontFamily: FONT.heading, margin: "0 0 2px", fontWeight: "700" } }, "Henry"),
                React.createElement(Img, { key: "sig", src: BRAND.signature, alt: "H", width: "68", height: "49", style: { display: "block", margin: "6px 0 0", outline: "none", border: "none", textDecoration: "none" } }),
              ]),

              // Social
              row(C.card, "28px 40px 14px", "center",
                React.createElement("table", { role: "presentation", cellPadding: "0", cellSpacing: "0", border: "0", style: { margin: "0 auto" } },
                  React.createElement("tr", null,
                    React.createElement("td", { style: { padding: "0 10px" } }, React.createElement(Link, { href: BRAND.instagram, style: { textDecoration: "none" } }, React.createElement(Img, { src: BRAND.iconIg, alt: "Instagram", width: "18", height: "18", style: { display: "inline-block", opacity: "0.5" } }))),
                    React.createElement("td", { style: { padding: "0 10px" } }, React.createElement(Link, { href: BRAND.whatsapp, style: { textDecoration: "none" } }, React.createElement(Img, { src: BRAND.iconWa, alt: "WhatsApp", width: "18", height: "18", style: { display: "inline-block", opacity: "0.5" } }))),
                    React.createElement("td", { style: { padding: "0 10px" } }, React.createElement(Link, { href: `mailto:${BRAND.email}`, style: { textDecoration: "none" } }, React.createElement(Img, { src: BRAND.iconMail, alt: "Email", width: "18", height: "18", style: { display: "inline-block", opacity: "0.5" } })))
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
              React.createElement("tr", null, React.createElement("td", { bgcolor: C.card, style: { backgroundColor: C.card, height: "36px", fontSize: "0", lineHeight: "0" } }, "\u00A0"))
            )
          )
        )
      )
    )
  );
}

module.exports = { BroadcastEmail };
