const React = require("react");
const { Html, Text, Img } = require("@react-email/components");

const {
  BRAND, FONT, C,
  HERO_IMAGES, pickHeroImage,
  row, divider, spacer, emailHead, emailShell, logoRow,
  ctaButton, signoff, socialIcons, footer,
} = require("./welcome.js");

// ── Broadcast Email ──────────────────────────────────────────

function BroadcastEmail({
  previewText = "New from Dialed By H",
  tag = "NEW ARRIVAL",
  headline = "Something Special Just Landed",
  body = "",
  body2 = "",
  imageUrl = "",
  imageAlt = "",
  useRandomImage = false,
  details = [],
  ctaText = "View Now",
  ctaUrl = "",
  signoffText = "Talk soon,",
}) {
  const finalCtaUrl = ctaUrl || `${BRAND.siteUrl}/inventory.html`;

  // Rotating image library — use provided image, random from library, or none
  let heroSrc = imageUrl;
  let heroAlt = imageAlt || headline;
  if (!heroSrc && useRandomImage) {
    const hero = pickHeroImage();
    heroSrc = hero.src;
    heroAlt = hero.alt;
  }

  const detailRows = details
    .filter(d => d && d.value)
    .map((d, i, arr) =>
      React.createElement("tr", { key: i },
        React.createElement("td", {
          className: "detail-label detail-border",
          style: {
            color: C.muted, fontSize: "10px", fontWeight: "700",
            fontFamily: FONT.heading, letterSpacing: "2.5px", textTransform: "uppercase",
            padding: "12px 0", verticalAlign: "top",
            borderBottom: i < arr.length - 1 ? `1px solid ${C.divider}` : "none",
          },
        }, d.label),
        React.createElement("td", {
          className: "detail-value detail-border",
          style: {
            color: "#333333", fontSize: "14px", fontFamily: FONT.body, fontWeight: "500",
            padding: "12px 0 12px 16px", textAlign: "right", verticalAlign: "top",
            borderBottom: i < arr.length - 1 ? `1px solid ${C.divider}` : "none",
          },
        }, d.value)
      )
    );

  return React.createElement(
    Html, { lang: "en" },
    ...emailHead(previewText),
    emailShell([
      // Top spacer
      spacer("48px"),

      // Logo
      logoRow(),

      // Divider
      divider(),

      // Tag + Headline + Body
      row(C.card, "40px 48px 28px", "left", [
        React.createElement(Text, {
          key: "tag", className: "tag-text",
          style: { color: C.tag, fontSize: "10px", fontWeight: "700", fontFamily: FONT.heading, letterSpacing: "4px", textTransform: "uppercase", margin: "0 0 20px" },
        }, tag),
        React.createElement(Text, {
          key: "hl", className: "heading-text heading-main animate-slide",
          style: { color: C.heading, fontSize: "30px", fontWeight: "700", letterSpacing: "-0.5px", lineHeight: "1.2", margin: "0 0 24px", fontFamily: FONT.heading },
        }, headline),
        body ? React.createElement(Text, {
          key: "b1", className: "body-text body-main",
          style: { color: C.body, fontSize: "15px", lineHeight: "1.75", margin: "0 0 18px", fontFamily: FONT.body },
        }, body) : null,
        body2 ? React.createElement(Text, {
          key: "b2", className: "body-text body-main",
          style: { color: C.body, fontSize: "15px", lineHeight: "1.75", margin: "0", fontFamily: FONT.body },
        }, body2) : null,
      ]),

      // CTA — above the fold, before image
      ctaButton(ctaText, finalCtaUrl, "animate-slide animate-delay-1"),

      // Hero image — fluid, edge-to-edge
      ...(heroSrc ? [
        React.createElement("tr", { key: "hero" },
          React.createElement("td", {
            bgcolor: C.card, className: "email-bg",
            style: { backgroundColor: C.card, padding: "32px 0 0 0" },
          },
            React.createElement(Img, {
              src: heroSrc, alt: heroAlt, width: "600",
              className: "hero-img animate-fade animate-delay-2",
              style: { display: "block", width: "100%", maxWidth: "600px", height: "auto", outline: "none", border: "none" },
            })
          )
        ),
      ] : []),

      // Detail rows
      ...(detailRows.length > 0 ? [
        row(C.card, "24px 48px 8px", "left",
          React.createElement("table", {
            role: "presentation", width: "100%",
            cellPadding: "0", cellSpacing: "0", border: "0",
            style: { borderCollapse: "collapse" },
          },
            React.createElement("tbody", null, ...detailRows)
          )
        ),
      ] : []),

      // Spacer
      spacer(heroSrc || detailRows.length ? "16px" : "8px"),

      // Divider
      divider(),

      // Sign-off
      signoff(signoffText),

      // Social icons
      socialIcons(),

      // Footer
      footer(),

      // Bottom spacer
      spacer("40px"),
    ])
  );
}

module.exports = { BroadcastEmail };
